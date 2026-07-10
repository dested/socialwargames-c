// Renders a unit's 3D miniature to a small image for the bottom sheet — one
// shared offscreen WebGL context (contexts are expensive; sheets open often).

import * as THREE from 'three';
import type { Faction, UnitType } from '../../shared/types';
import { buildPiece, PIECE_HEIGHT } from './pieces3d';

const SIZE = 176;

let studio: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  stage: THREE.Group;
} | null = null;

function getStudio() {
  if (studio) return studio;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(SIZE, SIZE);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#dff1ff', '#b09268', 1.1));
  const key = new THREE.DirectionalLight('#fff3dc', 2.2);
  key.position.set(2, 3, 2.5);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  const stage = new THREE.Group();
  scene.add(stage);
  studio = { renderer, scene, camera, stage };
  return studio;
}

const cache = new Map<string, string>();

/** Data-URL portrait of the piece, ¾ view. Cached per (type, faction). */
export function portraitOf(type: UnitType, faction: Faction): string {
  const cacheKey = `${type}:${faction}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const s = getStudio();
  s.stage.clear();
  const piece = buildPiece(type, faction);
  piece.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  s.stage.add(piece);

  const h = PIECE_HEIGHT[type];
  const mid = h * 0.5;
  const dist = Math.max(1.3, h * 1.55);
  s.camera.position.set(dist * 0.85, mid + dist * 0.55, dist * 0.85);
  s.camera.lookAt(0, mid, 0);
  s.renderer.render(s.scene, s.camera);

  const url = s.renderer.domElement.toDataURL('image/png');
  cache.set(cacheKey, url);
  return url;
}
