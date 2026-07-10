// WarScene — the 3D war table. Owns the WebGL renderer, camera rig, gesture
// controls, picking, and the per-frame sync between game state (SceneView)
// and meshes. play.tsx drives it: one rAF loop calling scene.render(view, t).
//
// Sync strategy: terrain is built once; units are diffed by id; holo overlays
// (arrows/badges/targets/territory) rebuild only when their inputs change —
// the rAF loop only animates pulses and smoothed positions.

import * as THREE from 'three';
import { idx } from '../../shared/hex';
import type { Cell, Faction, Terrain, Unit, UnitType } from '../../shared/types';
import { UNIT_STATS } from '../../shared/units';
import { FACTIONS, UI, WORLD } from './palette';
import { cellToWorld, topY, worldToCell } from './hex3d';
import { buildTerrain, type TerrainMeshes } from './terrain3d';
import { buildPiece, PIECE_HEIGHT } from './pieces3d';
import {
  buildArrow,
  buildChip,
  buildHpSprite,
  buildSelectionBeam,
  holoMat,
  targetRingGeo,
  territoryGeo,
} from './holo';

export interface SceneView {
  units: Unit[];
  territory: Uint8Array;
  selected: { q: number; r: number; faction: Faction } | null;
  targets: Cell[];
  /** unitId → fractional axial coords, overrides unit cell during round flips */
  positions?: Map<number, { x: number; y: number }>;
  /** struck cells during round flips */
  flashes?: { q: number; r: number; alpha: number }[];
  /** order arrows: leading tally votes + your own pending vote */
  arrows?: { from: Cell; to: Cell; kind: 'move' | 'attack'; color?: string; bold?: boolean }[];
  /** vote chips above cells for non-directional actions */
  badges?: { q: number; r: number; label: string; color: string; lift?: number }[];
}

interface UnitEntry {
  group: THREE.Group;
  type: UnitType;
  faction: Faction;
  hp: number;
  hpSprite: THREE.Sprite | null;
  curY: number;
  heading: number;
  lastX: number;
  lastZ: number;
}

const FIT_MARGIN = 1.12;

export class WarScene {
  readonly canvas: HTMLCanvasElement;
  readonly terrain: Terrain;

  /** exposed for debug params + e2e: target cell coords, distance, angles */
  readonly cam = {
    target: new THREE.Vector3(),
    yaw: 0,
    pitch: 0.96,
    dist: 18,
  };

  onTap: ((cell: Cell | null) => void) | null = null;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private terrainMeshes: TerrainMeshes;
  private unitsGroup = new THREE.Group();
  private holoGroup = new THREE.Group();
  private units = new Map<number, UnitEntry>();

  private territoryMesh: THREE.InstancedMesh;
  private lastTerritory: Uint8Array | null = null;

  private targetsMesh: THREE.InstancedMesh;
  private lastTargets: Cell[] = [];

  private votesGroup = new THREE.Group();
  private votesKey = '';

  private selection: THREE.Group;
  private flashPool: THREE.Mesh[] = [];

  private raycaster = new THREE.Raycaster();
  private reducedMotion = false;
  private lastT = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, terrain: Terrain) {
    this.canvas = canvas;
    this.terrain = terrain;
    this.reducedMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    const worldR = terrain.R + 1.5;
    this.scene.background = new THREE.Color(WORLD.sky);
    this.scene.fog = new THREE.Fog(WORLD.sky, worldR * 2.6, worldR * 5.2);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, worldR * 8);

    // warm key light + cool sky fill — sunny diorama
    const hemi = new THREE.HemisphereLight('#dff1ff', '#b09268', 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff3dc', 2.0);
    sun.position.set(worldR * 0.8, worldR * 1.15, worldR * 0.45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -worldR;
    sun.shadow.camera.right = worldR;
    sun.shadow.camera.top = worldR;
    sun.shadow.camera.bottom = -worldR;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = worldR * 4;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.camera.updateProjectionMatrix(); // sizes above don't apply without this
    this.scene.add(sun, sun.target);

    this.terrainMeshes = buildTerrain(terrain);
    this.scene.add(this.terrainMeshes.group);
    this.scene.add(this.unitsGroup);
    this.scene.add(this.holoGroup);

    // territory paint: glowing hex fills over claimed top faces
    const capacity = (2 * terrain.R + 1) ** 2;
    this.territoryMesh = new THREE.InstancedMesh(
      territoryGeo,
      holoMat('#ffffff', 0.45),
      capacity,
    );
    this.territoryMesh.count = 0;
    this.territoryMesh.renderOrder = 2;
    this.holoGroup.add(this.territoryMesh);

    this.targetsMesh = new THREE.InstancedMesh(targetRingGeo, holoMat(UI.accent, 0.9), 128);
    this.targetsMesh.count = 0;
    this.targetsMesh.renderOrder = 4;
    this.holoGroup.add(this.targetsMesh);

    this.selection = buildSelectionBeam('#ffffff');
    this.selection.visible = false;
    this.holoGroup.add(this.selection);

    this.holoGroup.add(this.votesGroup);

    this.attachControls();
    this.resize();
  }

  // ---- camera ----

  /** Frame the whole board with the given faction's capital toward the viewer. */
  focusFaction(faction: Faction): void {
    const cap = this.terrain.capitals[faction];
    const w = cellToWorld(cap.q, cap.r);
    this.cam.yaw = Math.atan2(w.x, w.z);
    const center = new THREE.Vector3(0, 0, 0);
    this.cam.target.copy(center).lerp(new THREE.Vector3(w.x, 0, w.z), 0.18);
    this.cam.dist = this.fitDistance();
    this.cam.pitch = 0.96;
  }

  centerOn(q: number, r: number): void {
    const w = cellToWorld(q, r);
    this.cam.target.set(w.x, 0, w.z);
  }

  /** Distance at which the whole island fits the viewport. */
  fitDistance(): number {
    const worldR = this.terrain.R + 1.6;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const aspect = Math.max(0.4, this.camera.aspect);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    // board projected height shrinks with pitch; width doesn't
    const byHeight = (worldR * FIT_MARGIN) / Math.tan(vFov / 2) / Math.max(0.55, Math.sin(this.cam.pitch));
    const byWidth = (worldR * FIT_MARGIN) / Math.tan(hFov / 2);
    return Math.min(30, Math.max(byHeight, byWidth) * 0.72);
  }

  private applyCamera(): void {
    const { target, yaw, pitch, dist } = this.cam;
    const cp = Math.cos(pitch);
    this.camera.position.set(
      target.x + dist * cp * Math.sin(yaw),
      target.y + dist * Math.sin(pitch),
      target.z + dist * cp * Math.cos(yaw),
    );
    this.camera.lookAt(target);
  }

  resize(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- picking / projection ----

  screenToCell(px: number, py: number): Cell | null {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const ndc = new THREE.Vector2((px / w) * 2 - 1, -(py / h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);

    // pieces first (a tall capital should be tappable anywhere on its body)
    const unitHits = this.raycaster.intersectObjects(this.unitsGroup.children, true);
    for (const hit of unitHits) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.cell) o = o.parent;
      if (o?.userData.cell) return o.userData.cell as Cell;
    }

    const hit = this.raycaster.intersectObject(this.terrainMeshes.landMesh, false)[0];
    if (hit) {
      const cell = worldToCell(hit.point.x, hit.point.z);
      const R = this.terrain.R;
      if (Math.max(Math.abs(cell.q), Math.abs(cell.r), Math.abs(cell.q + cell.r)) <= R) return cell;
    }
    return null;
  }

  /** Screen position of a cell's top face center (e2e + badges math). */
  cellToScreen(q: number, r: number, w?: number, h?: number): { x: number; y: number } {
    const cw = w ?? this.canvas.clientWidth;
    const ch = h ?? this.canvas.clientHeight;
    const v = this.cellTop(q, r, 0.1);
    v.project(this.camera);
    return { x: ((v.x + 1) / 2) * cw, y: ((1 - v.y) / 2) * ch };
  }

  private cellTop(q: number, r: number, lift = 0): THREE.Vector3 {
    const { x, z } = cellToWorld(q, r);
    const e = Math.max(1, this.terrain.elevation[idx(q, r, this.terrain.R)] ?? 1);
    return new THREE.Vector3(x, topY(Math.min(3, e)) + lift, z);
  }

  // ---- per-frame sync ----

  render(view: SceneView, nowMs: number): void {
    if (this.disposed) return;
    const t = this.reducedMotion ? 0 : nowMs / 1000;
    const dt = Math.min(0.1, this.lastT ? nowMs / 1000 - this.lastT : 0.016);
    this.lastT = nowMs / 1000;

    this.syncUnits(view, dt);
    this.syncTerritory(view.territory);
    this.syncTargets(view.targets, t);
    this.syncVotes(view);
    this.syncSelection(view, t);
    this.syncFlashes(view.flashes ?? []);

    this.applyCamera();
    this.renderer.render(this.scene, this.camera);
  }

  private syncUnits(view: SceneView, dt: number): void {
    const seen = new Set<number>();
    for (const u of view.units) {
      seen.add(u.id);
      let entry = this.units.get(u.id);
      if (!entry || entry.type !== u.type || entry.faction !== u.faction) {
        if (entry) this.unitsGroup.remove(entry.group);
        const group = buildPiece(u.type, u.faction);
        const start = this.cellTop(u.q, u.r);
        group.position.copy(start);
        this.unitsGroup.add(group);
        entry = {
          group,
          type: u.type,
          faction: u.faction,
          hp: -1,
          hpSprite: null,
          curY: start.y,
          heading: this.cam.yaw + Math.PI, // face the camera on spawn
          lastX: start.x,
          lastZ: start.z,
        };
        this.units.set(u.id, entry);
      }

      const override = view.positions?.get(u.id);
      const aq = override ? override.x : u.q;
      const ar = override ? override.y : u.r;
      const { x, z } = cellToWorld(aq, ar);
      const near = worldToCell(x, z);
      const e = Math.max(1, this.terrain.elevation[idx(near.q, near.r, this.terrain.R)] ?? 1);
      const targetY = topY(Math.min(3, e));
      // exponential smoothing turns terrace steps into a glide
      entry.curY += (targetY - entry.curY) * Math.min(1, dt * 14);
      if (this.reducedMotion) entry.curY = targetY;

      const dx = x - entry.lastX;
      const dz = z - entry.lastZ;
      if (dx * dx + dz * dz > 1e-6) entry.heading = Math.atan2(-dz, dx);
      entry.lastX = x;
      entry.lastZ = z;

      entry.group.position.set(x, entry.curY, z);
      entry.group.rotation.y = entry.heading;
      entry.group.userData.cell = { q: u.q, r: u.r };

      // HP pips appear only when hurt
      const max = UNIT_STATS[u.type].hp;
      if (u.hp !== entry.hp) {
        entry.hp = u.hp;
        if (entry.hpSprite) {
          entry.group.remove(entry.hpSprite);
          entry.hpSprite = null;
        }
        if (u.hp < max) {
          const sprite = buildHpSprite(u.hp, max, FACTIONS[u.faction].glow);
          sprite.position.y = PIECE_HEIGHT[u.type] + 0.14;
          entry.group.add(sprite);
          entry.hpSprite = sprite;
        }
      }
    }
    for (const [id, entry] of this.units) {
      if (!seen.has(id)) {
        this.unitsGroup.remove(entry.group);
        this.units.delete(id);
      }
    }
  }

  private syncTerritory(territory: Uint8Array): void {
    if (territory === this.lastTerritory) return;
    this.lastTerritory = territory;
    const R = this.terrain.R;
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    let n = 0;
    for (let r = -R; r <= R; r++) {
      for (let q = -R; q <= R; q++) {
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > R) continue;
        const owner = territory[idx(q, r, R)];
        if (!owner) continue;
        const e = this.terrain.elevation[idx(q, r, R)];
        if (e < 1 || e > 3) continue;
        const { x, z } = cellToWorld(q, r);
        m.makeTranslation(x, topY(e) + 0.03, z);
        this.territoryMesh.setMatrixAt(n, m);
        color.set(FACTIONS[owner - 1].glow);
        this.territoryMesh.setColorAt(n, color);
        n++;
      }
    }
    this.territoryMesh.count = n;
    this.territoryMesh.instanceMatrix.needsUpdate = true;
    if (this.territoryMesh.instanceColor) this.territoryMesh.instanceColor.needsUpdate = true;
  }

  private syncTargets(targets: Cell[], t: number): void {
    if (targets !== this.lastTargets) {
      this.lastTargets = targets;
      const m = new THREE.Matrix4();
      const n = Math.min(targets.length, 128);
      for (let i = 0; i < n; i++) {
        const p = this.cellTop(targets[i].q, targets[i].r, 0.05);
        m.makeTranslation(p.x, p.y, p.z);
        this.targetsMesh.setMatrixAt(i, m);
      }
      this.targetsMesh.count = n;
      this.targetsMesh.instanceMatrix.needsUpdate = true;
    }
    (this.targetsMesh.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(t * 5) * 0.3;
  }

  private syncVotes(view: SceneView): void {
    const arrows = view.arrows ?? [];
    const badges = view.badges ?? [];
    const key =
      arrows.map((a) => `${a.from.q},${a.from.r}>${a.to.q},${a.to.r}:${a.kind}:${a.color ?? ''}:${a.bold ? 1 : 0}`).join('|') +
      '#' +
      badges.map((b) => `${b.q},${b.r}:${b.label}:${b.color}:${b.lift ?? 0}`).join('|');
    if (key === this.votesKey) return;
    this.votesKey = key;

    this.votesGroup.clear();
    for (const a of arrows) {
      const color = a.kind === 'attack' ? UI.danger : (a.color ?? '#eef3f7');
      this.votesGroup.add(
        buildArrow({
          from: this.cellTop(a.from.q, a.from.r, 0.16),
          to: this.cellTop(a.to.q, a.to.r, 0.16),
          color,
          bold: a.bold ?? false,
          attack: a.kind === 'attack',
        }),
      );
    }
    for (const b of badges) {
      const chip = buildChip(b.label, b.color);
      const p = this.cellTop(b.q, b.r, (b.lift ?? 0.5) + 0.3);
      chip.position.copy(p);
      this.votesGroup.add(chip);
    }
  }

  private syncSelection(view: SceneView, t: number): void {
    if (!view.selected) {
      this.selection.visible = false;
      return;
    }
    const { q, r, faction } = view.selected;
    this.selection.visible = true;
    const p = this.cellTop(q, r, 0.06);
    this.selection.position.copy(p);
    const glow = FACTIONS[faction].glow;
    const ring = this.selection.getObjectByName('ring') as THREE.Mesh;
    const beam = this.selection.getObjectByName('beam') as THREE.Mesh;
    (ring.material as THREE.MeshBasicMaterial).color.set(glow);
    (beam.material as THREE.MeshBasicMaterial).color.set(glow);
    const pulse = 1 + Math.sin(t * 3.2) * 0.05;
    ring.scale.setScalar(pulse);
    ring.rotation.y = t * 0.6;
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.05 + (Math.sin(t * 2.1) + 1) * 0.02;
  }

  private syncFlashes(flashes: { q: number; r: number; alpha: number }[]): void {
    while (this.flashPool.length < flashes.length) {
      const flash = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), holoMat('#fff7df', 1, true));
      flash.visible = false;
      this.holoGroup.add(flash);
      this.flashPool.push(flash);
    }
    this.flashPool.forEach((mesh, i) => {
      const f = flashes[i];
      if (!f) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      const p = this.cellTop(f.q, f.r, 0.25);
      mesh.position.copy(p);
      const s = 0.7 + (1 - f.alpha) * 1.6;
      mesh.scale.setScalar(s);
      (mesh.material as THREE.MeshBasicMaterial).opacity = f.alpha * 0.9;
    });
  }

  // ---- gestures: 1-finger pan / 2-finger pinch+twist / wheel zoom /
  //      right-drag orbit / double-tap zoom / tap → onTap ----

  private attachControls(): void {
    const canvas = this.canvas;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    let pinchAngle = 0;
    let downPos: { x: number; y: number } | null = null;
    let moved = false;
    let lastTap = 0;

    const worldR = this.terrain.R + 3;

    const perPixel = () => {
      const h = canvas.clientHeight || 1;
      return (2 * this.cam.dist * Math.tan((this.camera.fov * Math.PI) / 360)) / h;
    };
    const groundBasis = () => {
      const fwd = new THREE.Vector3(-Math.sin(this.cam.yaw), 0, -Math.cos(this.cam.yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      return { fwd, right };
    };
    const clampTarget = () => {
      const len = Math.hypot(this.cam.target.x, this.cam.target.z);
      if (len > worldR) {
        this.cam.target.x *= worldR / len;
        this.cam.target.z *= worldR / len;
      }
    };
    const clampDist = () => {
      this.cam.dist = Math.min(34, Math.max(4, this.cam.dist));
    };
    const clampPitch = () => {
      this.cam.pitch = Math.min(1.35, Math.max(0.42, this.cam.pitch));
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        pinchAngle = Math.atan2(b.y - a.y, b.x - a.x);
      }
      downPos = { x: e.clientX, y: e.clientY };
      moved = false;
    };

    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      pointers.set(e.pointerId, cur);
      if (Math.abs(cur.x - (downPos?.x ?? 0)) + Math.abs(cur.y - (downPos?.y ?? 0)) > 8) moved = true;

      if (pointers.size === 1) {
        if (e.pointerType === 'mouse' && (e.buttons & 2) !== 0) {
          // right-drag: orbit
          this.cam.yaw -= dx * 0.006;
          this.cam.pitch += dy * 0.005;
          clampPitch();
        } else {
          const s = perPixel();
          const { fwd, right } = groundBasis();
          const groundY = s / Math.max(0.35, Math.sin(this.cam.pitch));
          this.cam.target.addScaledVector(right, -dx * s);
          this.cam.target.addScaledVector(fwd, dy * groundY);
          clampTarget();
        }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d2 = Math.hypot(a.x - b.x, a.y - b.y);
        const ang2 = Math.atan2(b.y - a.y, b.x - a.x);
        if (pinchDist > 0) {
          this.cam.dist /= d2 / pinchDist;
          clampDist();
          this.cam.yaw += ang2 - pinchAngle;
        }
        pinchDist = d2;
        pinchAngle = ang2;
        moved = true;
      }
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinchDist = 0;
      if (moved || pointers.size > 0) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const nowMs = performance.now();
      if (nowMs - lastTap < 300) {
        // double-tap: dive toward the tapped point
        const cell = this.screenToCell(px, py);
        if (cell) {
          const w = cellToWorld(cell.q, cell.r);
          this.cam.target.lerp(new THREE.Vector3(w.x, 0, w.z), 0.55);
        }
        this.cam.dist *= 0.62;
        clampDist();
        lastTap = 0;
        return;
      }
      lastTap = nowMs;
      this.onTap?.(this.screenToCell(px, py));
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.cam.dist *= e.deltaY > 0 ? 1.11 : 0.9;
      clampDist();
    };
    const onContext = (e: Event) => e.preventDefault();

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContext);
    this.detachControls = () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
    };
  }

  private detachControls: () => void = () => {};

  dispose(): void {
    this.disposed = true;
    this.detachControls();
    this.renderer.dispose();
  }
}
