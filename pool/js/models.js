// Models: the table (built from the physics geometry), the cue, and a bright loft to put them in.
import * as THREE from '../vendor/three.module.js';
import {
  R, HX, HZ, TABLE, POCKETS, SEGMENTS, HEAD_STRING_X, CUSHION_TOP, RAIL_TOP, RAIL_IN, RAIL_W, OUT_X, OUT_Z, CUE_LENGTH,
} from './physics.js';
import { CUES, buildCueModel } from './cues.js';
import {
  clothMaps, clothWear, woodMaps, plasterTexture, brickTexture, rugTexture, skylineTexture, plateTexture, artTexture,
} from './textures.js';

export { CUSHION_TOP, RAIL_TOP, RAIL_IN, RAIL_W, OUT_X, OUT_Z, CUE_LENGTH };
export const FLOOR_Y = -0.76;
const RAIL_BOTTOM = -0.1;
const CEILING_Y = FLOOR_Y + 3.3;

const shadow = (m, cast = true, receive = true) => {
  m.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return m;
};

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function buildTable() {
  const t = new THREE.Group();
  const clothSet = clothMaps();
  // Worsted cloth with a velvet sheen; the cushions use the same cloth at the same scale.
  const clothMat = (rx, ry) => {
    const map = clothSet.map.clone();
    const normalMap = clothSet.normalMap.clone();
    for (const t of [map, normalMap]) {
      t.repeat.set(rx, ry);
      t.needsUpdate = true;
    }
    return new THREE.MeshPhysicalMaterial({
      map, normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.93,
      sheen: 0.6, sheenColor: new THREE.Color(0x2f8a60), sheenRoughness: 0.6,
    });
  };
  // UVs are in metres: one tile of cloth covers about 70 cm, so its weave stays visible up close.
  const cloth = clothMat(1.4, 1.4);
  const railCloth = clothMat(0.47, 0.47);
  // Lacquered Honduran mahogany with ribbon figure.
  const railWood = woodMaps({ base: [124, 56, 30], dark: [58, 22, 10], rings: 30, figure: 0.1, seed: 7 });
  const mahogany = new THREE.MeshPhysicalMaterial({
    map: railWood.map, normalMap: railWood.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughnessMap: railWood.roughnessMap,
    roughness: 1, clearcoat: 1, clearcoatRoughness: 0.08,
  });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xa9a9b0, metalness: 1, roughness: 0.32 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 0.55 });
  const pocketDark = new THREE.MeshStandardMaterial({ color: 0x0c0907, roughness: 0.9, side: THREE.DoubleSide });

  // Bed: cloth over slate, with the pocket holes cut out.
  const bedShape = new THREE.Shape();
  const ex = HX + RAIL_IN + 0.004, ez = HZ + RAIL_IN + 0.004;
  bedShape.moveTo(-ex, -ez);
  bedShape.lineTo(ex, -ez);
  bedShape.lineTo(ex, ez);
  bedShape.lineTo(-ex, ez);
  bedShape.lineTo(-ex, -ez);
  const holes = POCKETS.map((p) => ({ x: p.x, z: p.z, r: p.r + 0.004 }));
  for (const h of holes) {
    const hole = new THREE.Path();
    hole.absarc(h.x, -h.z, h.r, 0, Math.PI * 2, true);
    bedShape.holes.push(hole);
  }
  const bed = new THREE.Mesh(new THREE.ShapeGeometry(bedShape, 40).rotateX(-Math.PI / 2), cloth);
  bed.receiveShadow = true;
  t.add(bed);
  const wear = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE.L, TABLE.W).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: clothWear(), transparent: true, depthWrite: false, roughness: 1 }),
  );
  wear.position.y = 0.0004;
  wear.receiveShadow = true;
  t.add(wear);
  const slate = new THREE.Mesh(new THREE.BoxGeometry(ex * 2, 0.03, ez * 2), new THREE.MeshStandardMaterial({ color: 0x2a2a2c }));
  slate.position.y = -0.0151 - 0.03;
  t.add(slate);

  // Markings: head string and spots, as faint as on a real cloth.
  const mark = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });
  const head = new THREE.Mesh(new THREE.PlaneGeometry(0.003, TABLE.W).rotateX(-Math.PI / 2), mark);
  head.position.set(HEAD_STRING_X, 0.0006, 0);
  t.add(head);
  for (const x of [-HX / 2, HX / 2]) {
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.007, 20).rotateX(-Math.PI / 2), mark);
    spot.position.set(x, 0.0007, 0);
    t.add(spot);
  }

  // Pocket bags.
  for (const h of holes) {
    const prof = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * (Math.PI / 2);
      prof.push(new THREE.Vector2(h.r * (0.35 + 0.65 * Math.cos(a)), -0.012 - Math.sin(a) * 0.1));
    }
    prof.unshift(new THREE.Vector2(h.r, 0));
    const bag = new THREE.Mesh(new THREE.LatheGeometry(prof.reverse(), 40), pocketDark);
    bag.position.set(h.x, 0, h.z);
    t.add(bag);
    const liner = new THREE.Mesh(new THREE.TorusGeometry(h.r + 0.002, 0.007, 10, 48).rotateX(Math.PI / 2), leather);
    liner.position.set(h.x, 0.0, h.z);
    t.add(liner);
  }

  // Cushions: a real cushion profile swept between each nose segment and its jaws.
  const nose = SEGMENTS.filter((s) => !s.jaw);
  const jaws = SEGMENTS.filter((s) => s.jaw);
  const section = [[0.012, 0], [0, 0.036], [0.018, CUSHION_TOP], [RAIL_IN + 0.004, CUSHION_TOP], [RAIL_IN + 0.004, 0]];
  for (const s of nose) {
    const jawAt = (x, z) => jaws.find((j) => Math.abs(j.ax - x) < 1e-6 && Math.abs(j.az - z) < 1e-6);
    const ja = jawAt(s.ax, s.az), jb = jawAt(s.bx, s.bz);
    const k = (RAIL_IN + 0.004) / 0.06;
    const A = [s.ax, s.az], B = [s.bx, s.bz];
    const A2 = [s.ax + ja.dx * k, s.az + ja.dz * k], B2 = [s.bx + jb.dx * k, s.bz + jb.dz * k];
    const point = (u, d, y) => {
      const f = d / (RAIL_IN + 0.004);
      const nx = A[0] + (B[0] - A[0]) * u, nz = A[1] + (B[1] - A[1]) * u;
      const bx = A2[0] + (B2[0] - A2[0]) * u, bz = A2[1] + (B2[1] - A2[1]) * u;
      return [nx + (bx - nx) * f, y, nz + (bz - nz) * f];
    };
    const pos = [];
    const tri = (p, q, r) => pos.push(...p, ...q, ...r);
    for (let i = 0; i < section.length; i++) {
      const [d0, y0] = section[i], [d1, y1] = section[(i + 1) % section.length];
      const p00 = point(0, d0, y0), p01 = point(0, d1, y1), p10 = point(1, d0, y0), p11 = point(1, d1, y1);
      tri(p00, p10, p11);
      tri(p00, p11, p01);
    }
    for (const u of [0, 1]) {
      const ring = section.map(([d, y]) => point(u, d, y));
      for (let i = 1; i < ring.length - 1; i++) (u ? tri(ring[0], ring[i], ring[i + 1]) : tri(ring[0], ring[i + 1], ring[i]));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const uv = [];
    for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] * 3 + pos[i + 1] * 3, pos[i + 2] * 3);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    repairNormals(geo);
    const m = new THREE.Mesh(geo, railCloth);
    m.material.side = THREE.DoubleSide;
    t.add(shadow(m));
  }

  // Rails: one rounded, lacquered mahogany frame with the pockets cut out of it.
  const outer = roundedRect(OUT_X, OUT_Z, 0.1);
  const inner = railHole(holes.map((h) => ({ ...h, r: h.r + 0.012 })));
  outer.holes.push(new THREE.Path(inner.map(([x, z]) => new THREE.Vector2(x, -z)).reverse()));
  const bevel = 0.012;
  const railGeo = new THREE.ExtrudeGeometry(outer, {
    depth: RAIL_TOP - RAIL_BOTTOM - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 24,
  });
  railGeo.rotateX(-Math.PI / 2);
  repairNormals(railGeo);
  const rails = new THREE.Mesh(railGeo, mahogany);
  rails.position.y = RAIL_BOTTOM + bevel;
  t.add(shadow(rails));

  // Chrome pocket irons around each pocket on the rail top.
  for (const p of POCKETS) {
    const ang = Math.atan2(Math.sign(p.z), p.corner ? Math.sign(p.x) : 0);
    const span = p.corner ? Math.PI * 1.25 : Math.PI * 0.95;
    const rr = p.r + 0.03;
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = ang - span / 2 + (span * i) / 40;
      pts.push(new THREE.Vector3(p.x + Math.cos(a) * rr, RAIL_TOP + 0.001, p.z + Math.sin(a) * rr));
    }
    const iron = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.014, 12, false), chrome);
    iron.scale.y = 0.55;
    iron.position.y = (RAIL_TOP + 0.001) * 0.45;
    t.add(shadow(iron));
  }

  // Mother-of-pearl sights.
  const pearl = new THREE.MeshPhysicalMaterial({ color: 0xf4f1ea, roughness: 0.25, iridescence: 0.6, clearcoat: 1 });
  const sight = new THREE.CircleGeometry(0.011, 4).rotateX(-Math.PI / 2);
  const midZ = HZ + RAIL_IN + RAIL_W * 0.45, midX = HX + RAIL_IN + RAIL_W * 0.45;
  for (let k = 1; k < 8; k++) {
    if (k === 4) continue;
    for (const sz of [-1, 1]) {
      const d = new THREE.Mesh(sight, pearl);
      d.position.set(-HX + (k * TABLE.L) / 8, RAIL_TOP + 0.0008, sz * midZ);
      t.add(d);
    }
  }
  for (let k = 1; k < 4; k++) {
    for (const sx of [-1, 1]) {
      const d = new THREE.Mesh(sight, pearl);
      d.position.set(sx * midX, RAIL_TOP + 0.0008, -HZ + (k * TABLE.W) / 4);
      t.add(d);
    }
  }

  // Apron with a moulding, turned legs and a brass plate.
  const apronWood = woodMaps({ base: [118, 52, 28], dark: [54, 20, 8], rings: 26, figure: 0.06, seed: 4, w: 1024, h: 512 });
  const apronMat = new THREE.MeshPhysicalMaterial({
    map: apronWood.map, normalMap: apronWood.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughnessMap: apronWood.roughnessMap,
    roughness: 1, clearcoat: 0.85, clearcoatRoughness: 0.12,
  });
  const apronShape = roundedRect(OUT_X - 0.03, OUT_Z - 0.03, 0.08);
  const apronGeo = new THREE.ExtrudeGeometry(apronShape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3 });
  apronGeo.rotateX(-Math.PI / 2);
  repairNormals(apronGeo);
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.position.y = RAIL_BOTTOM - 0.17;
  t.add(shadow(apron));
  const moulding = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedRect(OUT_X - 0.015, OUT_Z - 0.015, 0.09), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3 }).rotateX(-Math.PI / 2),
    apronMat,
  );
  moulding.position.y = RAIL_BOTTOM - 0.02;
  t.add(shadow(moulding));
  const legProfile = [
    [0.0, 0], [0.085, 0], [0.09, 0.02], [0.07, 0.05], [0.06, 0.08], [0.075, 0.12], [0.095, 0.18], [0.09, 0.24],
    [0.06, 0.29], [0.05, 0.33], [0.058, 0.36], [0.05, 0.4], [0.07, 0.42], [0.072, 0.47], [0.0, 0.47],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const legGeo = new THREE.LatheGeometry(legProfile, 32);
  const legH = RAIL_BOTTOM - 0.17 - FLOOR_Y;
  legGeo.scale(1, legH / 0.47, 1);
  for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, -1], [0, 1]]) {
    const leg = new THREE.Mesh(legGeo, apronMat);
    leg.position.set(x * (HX - 0.05), FLOOR_Y, z * (HZ - 0.02));
    t.add(shadow(leg));
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.06), new THREE.MeshStandardMaterial({ map: plateTexture('EIGHT BALL'), metalness: 0.8, roughness: 0.3 }));
  plate.position.set(-(OUT_X - 0.03) - 0.0105, RAIL_BOTTOM - 0.09, 0);
  plate.rotation.y = -Math.PI / 2;
  t.add(plate);

  // A cube of chalk on the rail.
  const chalk = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.022), new THREE.MeshStandardMaterial({ color: 0x2f66b0, roughness: 0.9 }));
  chalk.position.set(-HX + 0.25, RAIL_TOP + 0.011, HZ + RAIL_IN + RAIL_W * 0.5);
  chalk.rotation.y = 0.4;
  t.add(shadow(chalk));

  // Kitchen shading for ball-in-hand placement.
  const kitchen = new THREE.Mesh(
    new THREE.PlaneGeometry(HEAD_STRING_X + HX, TABLE.W).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.045, depthWrite: false }),
  );
  kitchen.position.set((HEAD_STRING_X - HX) / 2, 0.001, 0);
  kitchen.visible = false;
  t.add(kitchen);
  return { group: t, kitchen, clothMaterial: cloth };
}

function roundedRect(hx, hz, r) {
  const s = new THREE.Shape();
  s.moveTo(-hx + r, -hz);
  s.lineTo(hx - r, -hz);
  s.quadraticCurveTo(hx, -hz, hx, -hz + r);
  s.lineTo(hx, hz - r);
  s.quadraticCurveTo(hx, hz, hx - r, hz);
  s.lineTo(-hx + r, hz);
  s.quadraticCurveTo(-hx, hz, -hx, hz - r);
  s.lineTo(-hx, -hz + r);
  s.quadraticCurveTo(-hx, -hz, -hx + r, -hz);
  return s;
}

// Outline of the area inside the rails: the cushion rectangle plus the pocket openings, as a polygon
// sampled around the centre (the shape is star-shaped from there).
function railHole(circles) {
  const ix = HX + RAIL_IN, iz = HZ + RAIL_IN;
  const pts = [];
  const N = 1440;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    let d = Math.min(Math.abs(dx) > 1e-9 ? ix / Math.abs(dx) : Infinity, Math.abs(dz) > 1e-9 ? iz / Math.abs(dz) : Infinity);
    for (const c of circles) {
      const b = dx * c.x + dz * c.z;
      const q = c.x * c.x + c.z * c.z - c.r * c.r;
      const disc = b * b - q;
      if (disc < 0) continue;
      const t0 = b - Math.sqrt(disc), t1 = b + Math.sqrt(disc);
      if (t0 <= d + 1e-6) d = Math.max(d, t1);
    }
    const p = [dx * d, dz * d];
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.004) pts.push(p);
  }
  // Drop points that sit on a straight line between their neighbours (long cushion edges).
  return pts.filter((p, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
    const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
    return Math.abs(cross) > 1e-7;
  });
}

// Zero-length normals (from degenerate triangles) turn into NaN in lighting; give them a sane value.
export function repairNormals(geo) {
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i), z = n.getZ(i);
    const l = Math.hypot(x, y, z);
    if (!(l > 1e-6)) n.setXYZ(i, 0, 1, 0);
    else n.setXYZ(i, x / l, y / l, z / l);
  }
  n.needsUpdate = true;
  return geo;
}

// ---------------------------------------------------------------------------
// Cue
// ---------------------------------------------------------------------------

export function buildCue(design = CUES[0]) {
  return buildCueModel(design);
}

// ---------------------------------------------------------------------------
// Room: a sunlit loft
// ---------------------------------------------------------------------------

export function buildRoom() {
  const room = new THREE.Group();
  const W = 6.2, D = 5; // half extents
  const oak = woodMaps({ base: [218, 178, 128], dark: [168, 120, 76], planks: 8, w: 1536, h: 1536, seed: 12, rings: 7, figure: 0.03, gloss: 0.45 });
  for (const t of [oak.map, oak.normalMap, oak.roughnessMap]) t.repeat.set(4, 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2), new THREE.MeshStandardMaterial({
    map: oak.map, normalMap: oak.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: oak.roughnessMap, roughness: 1,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  room.add(floor);

  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 3.6), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = FLOOR_Y + 0.004;
  rug.receiveShadow = true;
  room.add(rug);

  const plaster = plasterTexture();
  plaster.repeat.set(3, 1.5);
  const wallMat = new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.95 });
  const brick = brickTexture();
  brick.repeat.set(3, 1.4);
  const brickMat = new THREE.MeshStandardMaterial({ map: brick, roughness: 0.95 });
  const H = CEILING_Y - FLOOR_Y;

  // Brick wall behind the long side, plaster behind the head end and the other long side.
  const wall = (w, mat, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), mat);
    m.position.set(x, FLOOR_Y + H / 2, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    room.add(m);
    return m;
  };
  wall(W * 2, brickMat, 0, -D, 0);
  wall(W * 2, wallMat, 0, D, Math.PI);
  wall(D * 2, wallMat, -W, 0, Math.PI / 2);

  // Window wall at the foot end: steel-framed glazing onto the city.
  const winBottom = FLOOR_Y + 0.5, winTop = CEILING_Y - 0.35;
  const sill = new THREE.Mesh(new THREE.PlaneGeometry(D * 2, winBottom - FLOOR_Y), wallMat);
  sill.position.set(W, (FLOOR_Y + winBottom) / 2, 0);
  sill.rotation.y = -Math.PI / 2;
  room.add(sill);
  const head = new THREE.Mesh(new THREE.PlaneGeometry(D * 2, CEILING_Y - winTop), wallMat);
  head.position.set(W, (winTop + CEILING_Y) / 2, 0);
  head.rotation.y = -Math.PI / 2;
  room.add(head);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(D * 2 + 6, (winTop - winBottom) + 3), new THREE.MeshBasicMaterial({ map: skylineTexture(), fog: false }));
  sky.position.set(W + 2.5, (winBottom + winTop) / 2, 0);
  sky.rotation.y = -Math.PI / 2;
  room.add(sky);
  const steel = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.5, metalness: 0.6 });
  for (let z = -D; z <= D + 1e-6; z += 0.62) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, winTop - winBottom, 0.035), steel);
    bar.position.set(W - 0.02, (winBottom + winTop) / 2, z);
    room.add(bar);
  }
  for (let y = winBottom; y <= winTop + 1e-6; y += (winTop - winBottom) / 4) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, D * 2), steel);
    bar.position.set(W - 0.02, y, 0);
    room.add(bar);
  }

  // Ceiling with exposed timber beams.
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2), new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = CEILING_Y;
  room.add(ceiling);
  const beamWood = woodMaps({ base: [128, 92, 62], dark: [78, 52, 32], seed: 2, w: 1024, h: 256, rings: 12, gloss: 0.8 });
  const beamMat = new THREE.MeshStandardMaterial({ map: beamWood.map, normalMap: beamWood.normalMap, roughness: 0.85 });
  for (let x = -W + 1; x < W; x += 1.8) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, D * 2), beamMat);
    beam.position.set(x, CEILING_Y - 0.14, 0);
    room.add(beam);
  }

  // Pendant: three domes on a black steel bar.
  const pendant = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.35, metalness: 0.5 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 0.3, metalness: 1 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4de).multiplyScalar(2.2) });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.025, 0.025), black);
  bar.position.y = 1.35;
  pendant.add(bar);
  for (const sx of [-1, 1]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, CEILING_Y - 1.35), black);
    cable.position.set(sx * 0.9, (CEILING_Y + 1.35) / 2, 0);
    pendant.add(cable);
  }
  const domeProfile = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * (Math.PI / 2);
    domeProfile.push(new THREE.Vector2(0.02 + Math.sin(a) * 0.2, 0.17 - (1 - Math.cos(a)) * 0.17));
  }
  const domeGeo = new THREE.LatheGeometry(domeProfile, 40);
  for (const x of [-0.78, 0, 0.78]) {
    const dome = new THREE.Mesh(domeGeo, [black][0]);
    dome.material = new THREE.MeshStandardMaterial({ color: 0x1f3b33, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide });
    dome.position.set(x, 1.13, 0);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 16), brass);
    cap.position.set(x, 1.32, 0);
    const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.19, 40).rotateX(Math.PI / 2), glow);
    bulb.position.set(x, 1.135, 0);
    pendant.add(dome, cap, bulb);
  }
  room.add(pendant);

  // Cue rack with cues and a triangle, on the plaster wall behind the head end.
  const rackBoard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.45, 0.9), beamMat);
  rackBoard.position.set(-W + 0.03, FLOOR_Y + 1.2, -1.2);
  room.add(shadow(rackBoard));
  // The rack shows every cue design; filled in after the first frame so start-up stays quick.
  const rack = new THREE.Group();
  room.add(rack);
  const fillRack = async () => {
    for (let i = 0; i < CUES.length; i++) {
      await new Promise((r) => setTimeout(r, 120));
      const c = buildCueModel(CUES[i]);
      c.rotation.z = Math.PI / 2; // tip up
      c.position.set(-W + 0.1, FLOOR_Y + 0.05 + CUE_LENGTH + 0.0025, -1.56 + i * 0.12);
      rack.add(shadow(c));
    }
  };
  const tri = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 3), beamMat);
  tri.position.set(-W + 0.07, FLOOR_Y + 1.6, 0.0);
  tri.rotation.y = Math.PI / 2;
  tri.rotation.x = Math.PI / 2;
  room.add(tri);

  // Framed prints.
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x22201e, roughness: 0.6 });
  const print = (x, z, ry, seed, w = 0.8, h = 1.0, y = FLOOR_Y + 1.7) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.03), frameMat);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: artTexture(seed), roughness: 0.9 }));
    art.position.z = 0.016;
    const g = new THREE.Group();
    g.add(frame, art);
    g.position.set(x, y, z);
    g.rotation.y = ry;
    room.add(g);
  };
  print(-1.4, D - 0.02, Math.PI, 3);
  print(0.1, D - 0.02, Math.PI, 8, 1.1, 0.8);
  print(-W + 0.02, 1.4, Math.PI / 2, 5);

  // Bar stools along the brick wall.
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x8a4b2a, roughness: 0.5 });
  for (const x of [-1.6, -0.6, 0.4, 1.4]) {
    const stool = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.06, 32), seatMat);
    seat.position.y = 0.72;
    stool.add(seat);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.74, 8), black);
      leg.position.set(Math.cos(a) * 0.13, 0.36, Math.sin(a) * 0.13);
      leg.rotation.set(Math.sin(a) * -0.08, 0, Math.cos(a) * 0.08);
      stool.add(leg);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.008, 6, 32).rotateX(Math.PI / 2), black);
    ring.position.y = 0.28;
    stool.add(ring);
    stool.position.set(x, FLOOR_Y, -D + 0.55);
    room.add(shadow(stool));
  }

  // Plants by the windows.
  const pot = new THREE.LatheGeometry([[0, 0], [0.16, 0], [0.2, 0.36], [0.21, 0.38], [0.19, 0.38], [0, 0.36]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
  const potMat = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.7 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.6, side: THREE.DoubleSide });
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.quadraticCurveTo(0.14, 0.12, 0, 0.36);
  leafShape.quadraticCurveTo(-0.14, 0.12, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(leafShape, 8);
  for (const [px, pz, seed] of [[W - 0.5, -D + 0.6, 1], [W - 0.5, D - 0.6, 2], [-W + 0.6, D - 0.6, 3]]) {
    const plant = new THREE.Group();
    plant.add(new THREE.Mesh(pot, potMat));
    let s = seed * 97;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 16; i++) {
      const stemH = 0.4 + r() * 0.9;
      const a = r() * Math.PI * 2;
      const lean = 0.15 + r() * 0.35;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, stemH, 5), leafMat);
      stem.position.set(Math.cos(a) * lean * stemH * 0.5, 0.36 + stemH / 2, Math.sin(a) * lean * stemH * 0.5);
      stem.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
      plant.add(stem);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(Math.cos(a) * lean * stemH, 0.36 + stemH, Math.sin(a) * lean * stemH);
      leaf.rotation.set(-0.6 - r() * 0.6, -a + Math.PI / 2, 0);
      leaf.scale.setScalar(0.9 + r() * 0.8);
      plant.add(leaf);
    }
    plant.position.set(px, FLOOR_Y, pz);
    room.add(shadow(plant));
  }
  return { group: room, pendantMeshes: pendant.children.filter((c) => c.isMesh), fillRack };
}
