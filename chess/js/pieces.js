// Staunton-style pieces built from lathe profiles, plus marble and obsidian materials.
import * as THREE from '../vendor/three.module.js';
import { marbleTexture, obsidianRoughness } from './textures.js';

const SEGMENTS = 48;

function arc(cx, cy, r, a0, a1, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([Math.max(0, cx + Math.cos(a) * r), cy + Math.sin(a) * r]);
  }
  return pts;
}

function base(r) {
  return [[0, 0], [r, 0], [r, 0.045], [r * 0.96, 0.07], [r * 0.86, 0.085], [r * 0.88, 0.11], [r * 0.84, 0.13], [r * 0.72, 0.15]];
}

function lathe(points) {
  const g = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), SEGMENTS);
  g.computeVertexNormals();
  return g;
}

function profile(type) {
  switch (type) {
    case 'p':
      return [...base(0.31), [0.19, 0.19], [0.13, 0.36], [0.18, 0.39], [0.18, 0.42], [0.11, 0.44], ...arc(0, 0.56, 0.135, -1.05, Math.PI / 2, 12)];
    case 'r':
      return [...base(0.35), [0.26, 0.2], [0.22, 0.56], [0.27, 0.6], [0.28, 0.65], [0.3, 0.67], [0.3, 0.78], [0.24, 0.78], [0.24, 0.74], [0, 0.74]];
    case 'n':
      return [...base(0.35), [0.27, 0.19], [0.26, 0.24], [0.21, 0.26], [0, 0.26]];
    case 'b':
      return [...base(0.33), [0.21, 0.2], [0.12, 0.52], [0.19, 0.55], [0.19, 0.59], [0.11, 0.61],
        [0.15, 0.66], [0.18, 0.74], [0.17, 0.82], [0.13, 0.9], [0.07, 0.96], [0.025, 0.985], [0.025, 1.0],
        ...arc(0, 1.03, 0.04, -Math.PI / 2, Math.PI / 2, 8)];
    case 'q':
      return [...base(0.36), [0.24, 0.21], [0.14, 0.6], [0.21, 0.65], [0.21, 0.69], [0.14, 0.71],
        [0.17, 0.85], [0.24, 1.0], [0.24, 1.03], [0.19, 1.03], [0.13, 1.0], [0.06, 1.02], ...arc(0, 1.07, 0.06, -1.2, Math.PI / 2, 8)];
    case 'k':
      return [...base(0.37), [0.25, 0.21], [0.15, 0.64], [0.22, 0.69], [0.22, 0.73], [0.15, 0.75],
        [0.19, 0.96], [0.23, 1.06], [0.23, 1.09], [0.12, 1.11], [0, 1.12]];
  }
  throw new Error('unknown piece ' + type);
}

function knightHead() {
  const s = new THREE.Shape();
  const pts = [
    [-0.19, 0.24], [-0.23, 0.45], [-0.2, 0.66], [-0.13, 0.82], [-0.07, 0.9], [-0.04, 0.98], [0.01, 0.9],
    [0.08, 0.87], [0.19, 0.77], [0.29, 0.63], [0.32, 0.55], [0.28, 0.5], [0.16, 0.52], [0.07, 0.55],
    [0.1, 0.42], [0.17, 0.3], [0.17, 0.24],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  s.moveTo(pts[0].x, pts[0].y);
  s.splineThru(pts.slice(1));
  s.lineTo(pts[0].x, pts[0].y);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.18, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 4, curveSegments: 24,
  });
  g.translate(0, 0, -0.09);
  g.computeVertexNormals();
  return g;
}

// Returns [{ geometry, matrix }] parts in piece-local space (y up, base at y=0, knight facing +x).
const partCache = new Map();
export function pieceParts(type) {
  if (partCache.has(type)) return partCache.get(type);
  const parts = [{ geometry: lathe(profile(type)), matrix: new THREE.Matrix4() }];
  const m = (x, y, z, ry = 0) => new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
  if (type === 'r') {
    const merlon = new THREE.BoxGeometry(0.12, 0.1, 0.07);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push({ geometry: merlon, matrix: m(Math.cos(a) * 0.27, 0.83, Math.sin(a) * 0.27, -a + Math.PI / 2) });
    }
  } else if (type === 'n') {
    parts.push({ geometry: knightHead(), matrix: new THREE.Matrix4() });
    const ear = new THREE.ConeGeometry(0.035, 0.1, 10);
    parts.push({ geometry: ear, matrix: m(-0.03, 0.99, 0.06) });
    parts.push({ geometry: ear, matrix: m(-0.03, 0.99, -0.06) });
  } else if (type === 'b') {
    parts.push({ geometry: new THREE.TorusGeometry(0.17, 0.018, 8, 40).rotateX(Math.PI / 2), matrix: m(0, 0.71, 0) });
  } else if (type === 'q') {
    const ball = new THREE.SphereGeometry(0.035, 12, 8);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      parts.push({ geometry: ball, matrix: m(Math.cos(a) * 0.235, 1.06, Math.sin(a) * 0.235) });
    }
  } else if (type === 'k') {
    parts.push({ geometry: new THREE.BoxGeometry(0.07, 0.27, 0.07), matrix: m(0, 1.24, 0) });
    parts.push({ geometry: new THREE.BoxGeometry(0.21, 0.07, 0.07), matrix: m(0, 1.27, 0) });
  }
  partCache.set(type, parts);
  return parts;
}

export const PIECE_HEIGHT = { p: 0.7, r: 0.88, n: 1.0, b: 1.07, q: 1.13, k: 1.38 };

let materials = null;
export function pieceMaterials() {
  if (materials) return materials;
  const marble = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: marbleTexture(), roughness: 0.32, metalness: 0,
    clearcoat: 0.55, clearcoatRoughness: 0.22, sheen: 0.25, sheenColor: new THREE.Color(0xfff2dc), sheenRoughness: 0.6,
  });
  marble.map.repeat.set(1, 1.5);
  const rough = obsidianRoughness();
  const obsidian = new THREE.MeshPhysicalMaterial({
    color: 0x07070b, roughness: 0.1, roughnessMap: rough, metalness: 0.05,
    clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.45, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 520],
    specularIntensity: 1, specularColor: new THREE.Color(0xc9c2ff),
  });
  materials = { w: marble, b: obsidian };
  return materials;
}

// Builds a piece. Hierarchy: root (board position) -> pose (action poses) -> idle (idle motion) -> body (meshes).
export function createPiece(type, color) {
  const mats = pieceMaterials();
  const material = mats[color].clone(); // per-piece clone so glows and hit flashes stay local
  const root = new THREE.Group();
  const pose = new THREE.Group();
  const idle = new THREE.Group();
  const body = new THREE.Group();
  root.add(pose);
  pose.add(idle);
  idle.add(body);
  for (const part of pieceParts(type)) {
    const mesh = new THREE.Mesh(part.geometry, material);
    mesh.applyMatrix4(part.matrix);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
  }
  // Knights look toward the opponent, turned 40 degrees so the player sees the head in three-quarter profile.
  if (type === 'n') body.rotation.y = color === 'w' ? Math.PI / 2 + 0.7 : -Math.PI / 2 + 0.7;
  return { root, pose, idle, body, material, type, color };
}
