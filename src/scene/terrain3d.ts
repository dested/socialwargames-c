// Builds the static diorama island from a Terrain. The land is ONE merged
// mesh with baked per-vertex colors (turf tops + earth flanks): a single draw
// call that plays perfectly with shadow mapping — instanced receivers proved
// unreliable, and the board never changes anyway. Trees, ore crystals and
// mountain caps stay instanced (small, numerous casters). Built once per game.

import * as THREE from 'three';
import { DIRS, forEachCell, idx, inBoard } from '../../shared/hex';
import type { Terrain } from '../../shared/types';
import { WORLD } from './palette';
import { BASE_Y, HEX_A, OCEAN_Y, cellHash, cellToWorld, hexCorner, topY } from './hex3d';

export interface TerrainMeshes {
  group: THREE.Group;
  /** raycast this to pick cells (intersection point → worldToCell) */
  landMesh: THREE.Mesh;
}

const BEVEL_IN = 0.085;
const BEVEL_DROP = 0.075;

const tmpMatrix = new THREE.Matrix4();
const tmpColor = new THREE.Color();

/** Slight per-cell lightness jitter so the board reads handmade, not tiled. */
function jittered(hex: string, q: number, r: number, salt: number, spread = 0.06): THREE.Color {
  tmpColor.set(hex);
  const j = (cellHash(q, r, salt) - 0.5) * 2 * spread;
  tmpColor.offsetHSL(0, 0, j);
  return tmpColor;
}

export function buildTerrain(terrain: Terrain): TerrainMeshes {
  const group = new THREE.Group();
  const R = terrain.R;

  const isShore = (q: number, r: number): boolean =>
    DIRS.some(([dq, dr]) => {
      if (!inBoard(q + dq, r + dr, R)) return true;
      return terrain.elevation[idx(q + dq, r + dr, R)] === 0;
    });

  // ---- merged land geometry with vertex colors ----
  const pos: number[] = [];
  const col: number[] = [];
  const pushTri = (a: number[], b: number[], c: number[], color: THREE.Color) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let k = 0; k < 3; k++) col.push(color.r, color.g, color.b);
  };

  forEachCell(R, (q, r, i) => {
    const e = terrain.elevation[i];
    if (e < 1) return; // water cells have no column
    const { x, z } = cellToWorld(q, r);
    const y = topY(e);
    const yb = y - BEVEL_DROP;
    const rIn = HEX_A * (1 - BEVEL_IN);

    let topColorHex: string;
    if (e === 4) topColorHex = WORLD.stone;
    else if (terrain.forest[i]) topColorHex = WORLD.forestFloor;
    else if (e === 1 && isShore(q, r)) topColorHex = WORLD.sand;
    else topColorHex = e === 1 ? WORLD.grass1 : e === 2 ? WORLD.grass2 : WORLD.grass3;
    const topColor = jittered(topColorHex, q, r, 1).clone();
    const sideColor = jittered(e === 4 ? WORLD.stone : WORLD.earth, q, r, 2, 0.045).clone();

    for (let k = 0; k < 6; k++) {
      const [ix0, iz0] = hexCorner(k, rIn);
      const [ix1, iz1] = hexCorner(k + 1, rIn);
      const [ox0, oz0] = hexCorner(k, HEX_A);
      const [ox1, oz1] = hexCorner(k + 1, HEX_A);
      // top fan (CCW from above → +y normal)
      pushTri([x, y, z], [x + ix1, y, z + iz1], [x + ix0, y, z + iz0], topColor);
      // turf bevel wrapping the rim
      pushTri([x + ix0, y, z + iz0], [x + ix1, y, z + iz1], [x + ox1, yb, z + oz1], topColor);
      pushTri([x + ix0, y, z + iz0], [x + ox1, yb, z + oz1], [x + ox0, yb, z + oz0], topColor);
      // flank down into the water — skip faces shared with an equal-or-taller
      // neighbor (invisible). Edge between corners k,k+1 faces DIRS[(k+1)%6]:
      // corners sit at 30°+60k, so the edge midpoint is at 60°(k+1) = DIRS[k+1].
      const [dq, dr] = DIRS[(k + 1) % 6];
      const covered =
        inBoard(q + dq, r + dr, R) && terrain.elevation[idx(q + dq, r + dr, R)] >= e;
      if (!covered) {
        pushTri([x + ox0, yb, z + oz0], [x + ox1, yb, z + oz1], [x + ox1, BASE_Y, z + oz1], sideColor);
        pushTri([x + ox0, yb, z + oz0], [x + ox1, BASE_Y, z + oz1], [x + ox0, BASE_Y, z + oz0], sideColor);
      }
    }
  });

  const landGeo = new THREE.BufferGeometry();
  landGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  landGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  landGeo.computeVertexNormals();
  const landMesh = new THREE.Mesh(
    landGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true }),
  );
  landMesh.receiveShadow = true;
  landMesh.castShadow = true;
  group.add(landMesh);

  group.add(buildMountainCaps(terrain));
  group.add(buildForests(terrain));
  group.add(buildOre(terrain));
  group.add(buildOcean(R));

  return { group, landMesh };
}

/** Craggy low-poly peaks sitting on the e=4 columns. */
function buildMountainCaps(terrain: Terrain): THREE.Group {
  const g = new THREE.Group();
  const cells: { q: number; r: number }[] = [];
  forEachCell(terrain.R, (q, r, i) => {
    if (terrain.elevation[i] === 4) cells.push({ q, r });
  });
  if (!cells.length) return g;
  const rockMat = new THREE.MeshStandardMaterial({ color: WORLD.stone, roughness: 1, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: WORLD.snow, roughness: 0.9, flatShading: true });
  const rockGeo = new THREE.ConeGeometry(HEX_A * 0.82, 0.52, 6, 1);
  const snowGeo = new THREE.ConeGeometry(HEX_A * 0.34, 0.24, 6, 1);

  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, cells.length);
  const snows = new THREE.InstancedMesh(snowGeo, snowMat, cells.length);
  rocks.castShadow = true;
  cells.forEach(({ q, r }, n) => {
    const { x, z } = cellToWorld(q, r);
    const y = topY(4);
    const rot = cellHash(q, r, 3) * Math.PI;
    tmpMatrix.compose(
      new THREE.Vector3(x, y + 0.2, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)),
      new THREE.Vector3(1, 0.9 + cellHash(q, r, 4) * 0.5, 1),
    );
    rocks.setMatrixAt(n, tmpMatrix);
    tmpMatrix.compose(
      new THREE.Vector3(x, y + 0.46 + cellHash(q, r, 4) * 0.2, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    snows.setMatrixAt(n, tmpMatrix);
  });
  rocks.instanceMatrix.needsUpdate = true;
  snows.instanceMatrix.needsUpdate = true;
  g.add(rocks, snows);
  return g;
}

/** 2–3 pines per forest cell with deterministic jitter. */
function buildForests(terrain: Terrain): THREE.Group {
  const g = new THREE.Group();
  const spots: { x: number; z: number; y: number; s: number; q: number; r: number; k: number }[] = [];
  forEachCell(terrain.R, (q, r, i) => {
    if (!terrain.forest[i]) return;
    const e = terrain.elevation[i];
    if (e < 1 || e > 3) return;
    const { x, z } = cellToWorld(q, r);
    const y = topY(e);
    const count = 2 + Math.floor(cellHash(q, r, 5) * 2);
    for (let k = 0; k < count; k++) {
      const ang = (cellHash(q, r, 6 + k) * 2 - 1) * Math.PI;
      const rad = 0.08 + cellHash(q, r, 9 + k) * (HEX_A * 0.52);
      spots.push({
        x: x + Math.cos(ang) * rad,
        z: z + Math.sin(ang) * rad,
        y,
        s: 0.75 + cellHash(q, r, 12 + k) * 0.5,
        q,
        r,
        k,
      });
    }
  });
  if (!spots.length) return g;

  const trunkMat = new THREE.MeshStandardMaterial({ color: WORLD.treeTrunk, roughness: 1, flatShading: true });
  const canopyMat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
  const trunkGeo = new THREE.CylinderGeometry(0.03, 0.045, 0.14, 5);
  const canopyGeo = new THREE.ConeGeometry(0.15, 0.4, 6);

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, spots.length);
  canopies.castShadow = true;
  trunks.castShadow = true;
  spots.forEach((t, n) => {
    tmpMatrix.compose(
      new THREE.Vector3(t.x, t.y + 0.07 * t.s, t.z),
      new THREE.Quaternion(),
      new THREE.Vector3(t.s, t.s, t.s),
    );
    trunks.setMatrixAt(n, tmpMatrix);
    tmpMatrix.compose(
      new THREE.Vector3(t.x, t.y + (0.14 + 0.2) * t.s, t.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, cellHash(t.q, t.r, 20 + t.k) * Math.PI, 0)),
      new THREE.Vector3(t.s, t.s, t.s),
    );
    canopies.setMatrixAt(n, tmpMatrix);
    canopies.setColorAt(n, jittered(cellHash(t.q, t.r, 30 + t.k) > 0.5 ? WORLD.tree1 : WORLD.tree2, t.q, t.r, 40 + t.k, 0.05));
  });
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  g.add(trunks, canopies);
  return g;
}

/** Glinting gold crystal clusters on ore nodes. */
function buildOre(terrain: Terrain): THREE.Group {
  const g = new THREE.Group();
  const nodes: { q: number; r: number; e: number }[] = [];
  forEachCell(terrain.R, (q, r, i) => {
    if (terrain.ore[i]) nodes.push({ q, r, e: terrain.elevation[i] });
  });
  if (!nodes.length) return g;
  const mat = new THREE.MeshStandardMaterial({
    color: WORLD.ore,
    emissive: new THREE.Color(WORLD.oreDeep),
    emissiveIntensity: 0.55,
    roughness: 0.3,
    metalness: 0.35,
    flatShading: true,
  });
  const geo = new THREE.OctahedronGeometry(0.1);
  const count = nodes.length * 3;
  const crystals = new THREE.InstancedMesh(geo, mat, count);
  crystals.castShadow = true;
  let n = 0;
  for (const node of nodes) {
    const { x, z } = cellToWorld(node.q, node.r);
    const y = topY(Math.max(1, node.e));
    for (let k = 0; k < 3; k++) {
      const ang = cellHash(node.q, node.r, 50 + k) * Math.PI * 2;
      const rad = 0.06 + cellHash(node.q, node.r, 60 + k) * 0.16;
      const s = 0.7 + cellHash(node.q, node.r, 70 + k) * 0.9;
      tmpMatrix.compose(
        new THREE.Vector3(x + Math.cos(ang) * rad, y + 0.07 * s, z + Math.sin(ang) * rad),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(cellHash(node.q, node.r, 80 + k) * 0.5, ang, cellHash(node.q, node.r, 90 + k) * 0.5),
        ),
        new THREE.Vector3(s * 0.8, s * 1.3, s * 0.8),
      );
      crystals.setMatrixAt(n++, tmpMatrix);
    }
  }
  crystals.instanceMatrix.needsUpdate = true;
  g.add(crystals);
  return g;
}

/** Two stacked discs: a deep floor and a translucent surface — shallows near
 *  shore read lighter because the earth flanks show through the surface. Both
 *  discs run past the fog horizon so their rims never band against the sky. */
function buildOcean(R: number): THREE.Group {
  const g = new THREE.Group();
  const reach = (R + 1.5) * 6;

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(reach * 1.4, 48),
    new THREE.MeshStandardMaterial({ color: WORLD.oceanDeep, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = BASE_Y;
  g.add(floor);

  const surface = new THREE.Mesh(
    new THREE.CircleGeometry(reach, 64),
    new THREE.MeshStandardMaterial({
      color: WORLD.ocean,
      roughness: 0.32,
      metalness: 0.05,
      transparent: true,
      opacity: 0.86,
    }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = OCEAN_Y;
  surface.receiveShadow = true;
  g.add(surface);

  return g;
}
