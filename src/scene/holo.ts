// The holographic command layer: everything that is DATA (votes, targets,
// selection, damage) renders as glowing unlit light floating over the diorama.
// Terrain never glows; data always does — that contrast is the visual law.

import * as THREE from 'three';
import { buildFlatHexGeometry, buildHexRingGeometry, HEX_A } from './hex3d';

// ---- shared geometries / material factories ----

export const territoryGeo = buildFlatHexGeometry(HEX_A * 0.94);
export const targetRingGeo = buildHexRingGeometry(HEX_A * 0.62, HEX_A * 0.82);
export const selectRingGeo = buildHexRingGeometry(HEX_A * 0.5, HEX_A * 0.66);

export function holoMat(color: string | THREE.Color, opacity: number, additive = false): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// ---- vote arrows: glowing arcs from cell to cell ----

export interface ArrowSpec {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: string;
  bold: boolean;
  attack: boolean;
}

/** Arc arrow: bright core tube + soft glow tube + head cone; attack arrows
 *  additionally get a target reticle ring. Rebuilt only when votes change. */
export function buildArrow(spec: ArrowSpec): THREE.Group {
  const g = new THREE.Group();
  const dist = spec.from.distanceTo(spec.to);
  const mid = spec.from.clone().add(spec.to).multiplyScalar(0.5);
  mid.y = Math.max(spec.from.y, spec.to.y) + 0.38 + dist * 0.16;
  // stop the tube short of the target so the head cone reads as the tip
  const curve = new THREE.QuadraticBezierCurve3(spec.from, mid, spec.to);
  const headT = Math.max(0.72, 1 - 0.16 / Math.max(0.4, dist));
  const shaft = new THREE.QuadraticBezierCurve3(spec.from, mid, curve.getPoint(headT));

  const coreR = spec.bold ? 0.08 : 0.05;
  const core = new THREE.Mesh(new THREE.TubeGeometry(shaft, 14, coreR, 6), holoMat(spec.color, 1));
  const glow = new THREE.Mesh(new THREE.TubeGeometry(shaft, 14, coreR * 2.4, 6), holoMat(spec.color, 0.2, true));
  g.add(core, glow);

  const head = new THREE.Mesh(new THREE.ConeGeometry(spec.bold ? 0.18 : 0.13, spec.bold ? 0.38 : 0.28, 8), holoMat(spec.color, 1));
  const tip = curve.getPoint(1);
  const tangent = curve.getTangent(1).normalize();
  head.position.copy(tip).addScaledVector(tangent, -0.09);
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  g.add(head);

  if (spec.attack) {
    const reticle = new THREE.Mesh(new THREE.RingGeometry(HEX_A * 0.42, HEX_A * 0.52, 24), holoMat(spec.color, 0.85));
    reticle.rotation.x = -Math.PI / 2;
    reticle.position.set(spec.to.x, spec.to.y + 0.04, spec.to.z);
    const reticle2 = new THREE.Mesh(new THREE.RingGeometry(HEX_A * 0.2, HEX_A * 0.26, 24), holoMat(spec.color, 0.6));
    reticle2.rotation.x = -Math.PI / 2;
    reticle2.position.set(spec.to.x, spec.to.y + 0.04, spec.to.z);
    g.add(reticle, reticle2);
  }
  return g;
}

// ---- floating text chips (vote badges) ----

const spriteCache = new Map<string, { material: THREE.SpriteMaterial; aspect: number }>();

function chipTexture(label: string, color: string): { texture: THREE.CanvasTexture; aspect: number } {
  const pad = 18;
  const fs = 44;
  const c = document.createElement('canvas');
  const measure = c.getContext('2d')!;
  measure.font = `700 ${fs}px system-ui, sans-serif`;
  const tw = Math.ceil(measure.measureText(label).width);
  c.width = tw + pad * 2 + 8;
  c.height = fs + pad * 2 - 6;
  const ctx = c.getContext('2d')!;
  const w = c.width;
  const h = c.height;
  const rad = h / 2;
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 8, rad);
  ctx.fillStyle = 'rgba(10,14,18,0.82)';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.font = `700 ${fs}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(label, w / 2, h / 2 + 2);
  const texture = new THREE.CanvasTexture(c);
  texture.anisotropy = 2;
  return { texture, aspect: w / h };
}

export function buildChip(label: string, color: string): THREE.Sprite {
  const key = `${label}|${color}`;
  let entry = spriteCache.get(key);
  if (!entry) {
    const { texture, aspect } = chipTexture(label, color);
    entry = { material: new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }), aspect };
    spriteCache.set(key, entry);
  }
  const sprite = new THREE.Sprite(entry.material);
  const h = 0.34;
  sprite.scale.set(h * entry.aspect, h, 1);
  sprite.renderOrder = 20;
  return sprite;
}

// ---- HP pips (only shown when damaged) ----

export function buildHpSprite(hp: number, max: number, color: string): THREE.Sprite {
  const key = `hp:${hp}/${max}|${color}`;
  let entry = spriteCache.get(key);
  if (!entry) {
    const pips = Math.min(10, max);
    const filled = Math.max(1, Math.round((hp / max) * pips));
    const d = 26;
    const gap = 10;
    const c = document.createElement('canvas');
    c.width = pips * d + (pips - 1) * gap + 12;
    c.height = d + 12;
    const ctx = c.getContext('2d')!;
    for (let i = 0; i < pips; i++) {
      const x = 6 + i * (d + gap) + d / 2;
      ctx.beginPath();
      ctx.arc(x, c.height / 2, d / 2, 0, Math.PI * 2);
      ctx.fillStyle = i < filled ? color : 'rgba(10,14,18,0.55)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = i < filled ? 'rgba(10,14,18,0.8)' : 'rgba(255,255,255,0.4)';
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(c);
    entry = {
      material: new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }),
      aspect: c.width / c.height,
    };
    spriteCache.set(key, entry);
  }
  const sprite = new THREE.Sprite(entry.material);
  const h = 0.11;
  sprite.scale.set(h * entry.aspect, h, 1);
  sprite.renderOrder = 19;
  return sprite;
}

// ---- selection: ring + light beam over the chosen piece ----

export function buildSelectionBeam(color: string): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(selectRingGeo, holoMat(color, 0.9));
  ring.name = 'ring';
  g.add(ring);
  const beamGeo = new THREE.CylinderGeometry(0.3, 0.36, 2.4, 18, 1, true);
  const beam = new THREE.Mesh(beamGeo, holoMat(color, 0.07, true));
  beam.position.y = 1.2;
  beam.name = 'beam';
  g.add(beam);
  return g;
}
