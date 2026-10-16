// Procedureel model van een Specialized Venge (2019), opgebouwd uit losse onderdelen.
// Elk onderdeel is een THREE.Group met een vaste id (gelijk aan content/parts/<id>.json).
// Maten: typische maat 56 (wielbasis ~993 mm, liggende achtervork 410 mm, trapasdrop 72 mm).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { aeroTube, along, annulus, disc, pathTube, place, roundTube, roundedBox, v } from './geometry';

export const PART_IDS = [
  'frame', 'fork', 'headset', 'stem', 'handlebar', 'seatpost', 'saddle', 'bb', 'crankset', 'powermeter',
  'chain', 'cassette', 'rd', 'fd', 'shifters', 'brakes', 'di2', 'wheelF', 'wheelR', 'tires',
] as const;
export type PartId = (typeof PART_IDS)[number];

/** Voorkeurskijkrichting per onderdeel (vanaf het onderdeel naar de camera). */
export const FOCUS_VIEW: Partial<Record<PartId, THREE.Vector3>> = {
  brakes: v(0.25, 0.35, -1),
  powermeter: v(0.15, 0.1, -1),
  di2: v(-0.9, 0.3, 0.6),
  saddle: v(0.3, 0.9, 1),
  seatpost: v(-0.4, 0.3, 1),
  headset: v(0.6, 0.4, 1),
  stem: v(0.3, 0.8, 0.9),
  handlebar: v(0.9, 0.6, 0.6),
  shifters: v(0.9, 0.3, 0.8),
  bb: v(0.1, -0.3, 1),
};

// ---------- materialen ----------
function makeMaterials() {
  const std = (color: number, roughness: number, metalness: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
    new THREE.MeshPhysicalMaterial({ color, roughness, metalness, ...extra });
  return {
    frame: std(0x151517, 0.55, 0.15, { clearcoat: 0.25, clearcoatRoughness: 0.6 }), // satijn zwart carbon
    carbon: std(0x1a1a1c, 0.4, 0.2, { clearcoat: 0.4, clearcoatRoughness: 0.35 }),
    rim: std(0x19191b, 0.32, 0.25, { clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    tire: std(0x121212, 0.9, 0.0),
    tireSide: std(0x1b1b1c, 0.8, 0.0),
    alloyDark: std(0x2b2d31, 0.35, 0.7),
    alloy: std(0xb9bdc3, 0.3, 1.0),
    steel: std(0x9a9ea5, 0.35, 1.0),
    rubber: std(0x1c1c1e, 0.85, 0.0),
    tape: std(0x3b3352, 0.7, 0.1, { sheen: 1, sheenColor: new THREE.Color(0x5a8f8a), sheenRoughness: 0.4 }), // paars/olie-glans
    saddle: std(0x161616, 0.75, 0.0),
    accent: std(0xe07b28, 0.5, 0.2), // 4iiii-oranje
    led: std(0x2a2a2a, 0.4, 0.1, { emissive: new THREE.Color(0x33ff88), emissiveIntensity: 0.6 }),
    screen: std(0x0d0f12, 0.2, 0.0, { clearcoat: 1, clearcoatRoughness: 0.05 }),
    hit: new THREE.MeshBasicMaterial({ visible: false }), // onzichtbare klikzones voor dunne onderdelen
  };
}
type Mats = ReturnType<typeof makeMaterials>;

/** Olie-glans "SPECIALIZED"-logo als canvas-textuur. */
function logoTexture(text: string, italic = true) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, c.width, 0);
  grad.addColorStop(0, '#6a4c9c');
  grad.addColorStop(0.3, '#3d8f9e');
  grad.addColorStop(0.55, '#7aa86a');
  grad.addColorStop(0.75, '#c49a3c');
  grad.addColorStop(1, '#a8456a');
  g.fillStyle = grad;
  g.font = `${italic ? 'italic ' : ''}900 128px "Arial Black", Arial, sans-serif`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, c.width / 2, c.height / 2 + 6, c.width - 20);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Logo als vlak van a naar b (leesrichting), met de voorkant naar `normal`. */
function decal(text: string, a: THREE.Vector3, b: THREE.Vector3, height: number, normal: THREE.Vector3, scale = 0.7) {
  const tex = logoTexture(text);
  const len = a.distanceTo(b) * scale;
  const geo = new THREE.PlaneGeometry(len, height);
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex, transparent: true, roughness: 0.3, metalness: 0.6, iridescence: 1, iridescenceIOR: 1.6,
    polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  const X = b.clone().sub(a).normalize();
  const Z = normal.clone().sub(X.clone().multiplyScalar(normal.dot(X))).normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X);
  m.matrixAutoUpdate = false;
  m.matrix.makeBasis(X, Y, Z).setPosition(a.clone().add(b).multiplyScalar(0.5));
  m.userData.decal = true;
  return m;
}

/** Tekst rond een velg (zoals het grote 'roval'-logo). */
function rimText(text: string, c: THREE.Vector3, rIn: number, rOut: number, z: number, side: 1 | -1, repeat = 2) {
  const cv = document.createElement('canvas');
  cv.width = 2048;
  cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#4a4a4f';
  g.font = '700 112px "Arial Rounded MT Bold", Arial, sans-serif';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  for (let i = 0; i < repeat; i++) g.fillText(text, ((i + 0.5) / repeat) * cv.width, 68, cv.width / repeat * 0.55);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const seg = 160;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2 * -side;
    for (const [r, vv] of [[rIn, 0], [rOut, 1]] as const) {
      pos.push(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, z);
      uv.push(i / seg, vv);
    }
    if (i < seg) {
      const k = i * 2;
      if (side === 1) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      else idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, roughness: 0.15, metalness: 0.2, clearcoat: 1, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.userData.decal = true;
  return m;
}

// ---------- hulpfuncties voor groepen ----------
function group(id: PartId) {
  const g = new THREE.Group();
  g.name = id;
  g.userData.partId = id;
  return g;
}
function add(g: THREE.Group, geos: THREE.BufferGeometry[] | THREE.BufferGeometry, mat: THREE.Material, opts: { cast?: boolean } = {}) {
  const list = Array.isArray(geos) ? geos : [geos];
  const geo = list.length === 1 ? list[0] : mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)), false);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = opts.cast ?? true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

// ---------- geometrie van de fiets ----------
const WHEEL_R = 0.337; // 700c + 26 mm band
const R = v(0, WHEEL_R); // achteras
const B = v(0.405, WHEEL_R - 0.072); // trapas
const F = v(0.993, WHEEL_R); // vooras
const SEAT_DIR: [number, number] = [-0.284, 0.959]; // 73,5°
const STEER_DOWN: [number, number] = [0.284, -0.959];
const HT_TOP = v(0.8, 0.836);
const HT_BOT = along(HT_TOP, ...STEER_DOWN, 0.155);
const ST_TOP = along(B, ...SEAT_DIR, 0.47);
const SS_JOIN = along(B, ...SEAT_DIR, 0.33);
const STEM_BASE = along(HT_TOP, -STEER_DOWN[0], -STEER_DOWN[1], 0.03);
const BAR = v(STEM_BASE.x + 0.11, STEM_BASE.y + 0.004);
const SADDLE = along(B, ...SEAT_DIR, 0.745);
const CHAIN_Z = 0.045;

function buildFrame(m: Mats) {
  const g = group('frame');
  const tubes: THREE.BufferGeometry[] = [];
  const HT_A = along(HT_TOP, -STEER_DOWN[0], -STEER_DOWN[1], 0.005);
  tubes.push(aeroTube(HT_A, HT_BOT, 0.075, 0.046, v(1, 0.25)));
  const dtTop = along(HT_BOT, -STEER_DOWN[0], -STEER_DOWN[1], 0.02);
  tubes.push(aeroTube(v(B.x - 0.01, B.y + 0.01), dtTop, 0.072, 0.05, v(0.8, -1), 0.45));
  const ttFront = along(HT_TOP, ...STEER_DOWN, 0.03);
  tubes.push(aeroTube(v(ST_TOP.x + 0.005, ST_TOP.y - 0.012), ttFront, 0.055, 0.036, v(0.05, 1), 0.25));
  tubes.push(aeroTube(v(B.x, B.y - 0.01), ST_TOP, 0.07, 0.04, v(1, 0.3), 0.5));
  // achtervork (laag aansluitende seatstays) en liggende achtervork
  for (const s of [1, -1]) {
    tubes.push(aeroTube(v(SS_JOIN.x - 0.006, SS_JOIN.y, s * 0.016), v(R.x + 0.01, R.y + 0.012, s * 0.062), 0.024, 0.016, v(1, 1), 0.4, 18));
    tubes.push(aeroTube(v(B.x - 0.02, B.y + 0.004, s * 0.034), v(R.x + 0.012, R.y - 0.004, s * 0.062), 0.032, 0.02, v(0.1, 1), 0.2, 18));
    tubes.push(place(roundedBox(0.04, 0.03, 0.008), v(R.x + 0.004, R.y + 0.002, s * 0.064)));
  }
  // trapashuis en zitbuisknoop
  tubes.push(place(new THREE.CylinderGeometry(0.031, 0.031, 0.08, 32), B, [90, 0, 0]));
  tubes.push(place(roundedBox(0.05, 0.03, 0.036, 0.012), v(ST_TOP.x + 0.006, ST_TOP.y - 0.005), [0, 0, -16]));
  add(g, tubes, m.frame);
  // bidonhouderbouten (zichtbaar detail)
  const bolts = [0.17, 0.27].map((d) => place(new THREE.CylinderGeometry(0.004, 0.004, 0.054, 10), along(v(B.x + 0.02, B.y + 0.02), 0.72, 0.69, d), [90, 0, 0]));
  add(g, bolts, m.steel);
  // logo's
  const dtA = along(v(B.x, B.y), 0.72, 0.69, 0.11);
  const dtB = along(v(B.x, B.y), 0.72, 0.69, 0.52);
  g.add(decal('SPECIALIZED', v(dtA.x, dtA.y, 0.0262), v(dtB.x, dtB.y, 0.0262), 0.05, v(0, 0, 1), 0.95));
  g.add(decal('SPECIALIZED', v(dtB.x, dtB.y, -0.0262), v(dtA.x, dtA.y, -0.0262), 0.05, v(0, 0, -1), 0.95));
  // liggende achtervork (aandrijfkant), leesrichting van achter naar voor
  const csA = v(R.x + 0.07, R.y - 0.002, 0.0585);
  const csB = v(B.x - 0.06, B.y + 0.012, 0.0405);
  g.add(decal('SPECIALIZED', csA, csB, 0.015, v(0, 0, 1), 0.8));
  return g;
}

function buildFork(m: Mats) {
  const g = group('fork');
  const crown = along(HT_BOT, ...STEER_DOWN, 0.012);
  const geos = [place(roundedBox(0.062, 0.024, 0.1, 0.011), crown, [0, 0, 16]), aeroTube(along(crown, -STEER_DOWN[0], -STEER_DOWN[1], 0.02), crown, 0.07, 0.046, v(1, 0.25), 0.5)];
  for (const s of [1, -1]) {
    geos.push(aeroTube(v(crown.x, crown.y, s * 0.045), v(F.x - 0.004, F.y + 0.01, s * 0.055), 0.05, 0.024, v(1, 0.25), 0.5, 20));
    geos.push(place(roundedBox(0.03, 0.03, 0.008), v(F.x, F.y, s * 0.057)));
  }
  add(g, geos, m.frame);
  return g;
}

function buildHeadset(m: Mats) {
  const g = group('headset');
  const top = STEM_BASE;
  add(g, aeroTube(HT_TOP, top, 0.07, 0.044, v(1, 0.25), 0.5), m.carbon);
  // dunne lijntjes = losse spacers
  const lines = [0.008, 0.016, 0.024].map((d) => {
    const p = along(HT_TOP, -STEER_DOWN[0], -STEER_DOWN[1], d);
    return aeroTube(p, along(p, -STEER_DOWN[0], -STEER_DOWN[1], 0.0012), 0.0712, 0.0452, v(1, 0.25), 0.5);
  });
  add(g, lines, m.alloyDark, { cast: false });
  return g;
}

function buildStem(m: Mats) {
  const g = group('stem');
  const geos = [
    place(roundedBox(0.05, 0.045, 0.042, 0.012), v(STEM_BASE.x + 0.005, STEM_BASE.y + 0.015), [0, 0, 6]),
    aeroTube(v(STEM_BASE.x + 0.01, STEM_BASE.y + 0.016), v(BAR.x - 0.012, BAR.y + 0.004), 0.034, 0.03, v(0, 1), 0.15),
    place(roundedBox(0.03, 0.044, 0.05, 0.01), v(BAR.x + 0.002, BAR.y), [0, 0, 0]), // voorplaat
  ];
  add(g, geos, m.frame);
  // accessoiremount + Garmin
  const arm = place(roundedBox(0.075, 0.012, 0.03, 0.005), v(BAR.x + 0.045, BAR.y - 0.012));
  add(g, arm, m.alloyDark);
  add(g, place(roundedBox(0.085, 0.012, 0.055, 0.008), v(BAR.x + 0.07, BAR.y + 0.003), [0, 0, 8]), m.carbon);
  add(g, place(new THREE.BoxGeometry(0.06, 0.002, 0.042), v(BAR.x + 0.072, BAR.y + 0.0105), [0, 0, 8]), m.screen, { cast: false });
  return g;
}

function barPath(s: number) {
  const x = BAR.x;
  const y = BAR.y;
  return [
    v(x, y, s * 0.03), v(x + 0.004, y, s * 0.1), v(x + 0.018, y + 0.002, s * 0.165), v(x + 0.05, y, s * 0.196),
    v(x + 0.082, y - 0.012, s * 0.204), v(x + 0.098, y - 0.05, s * 0.207), v(x + 0.088, y - 0.1, s * 0.21),
    v(x + 0.05, y - 0.125, s * 0.211), v(x - 0.01, y - 0.12, s * 0.211),
  ];
}

function buildHandlebar(m: Mats) {
  const g = group('handlebar');
  add(g, [pathTube(barPath(1), 0.0118, false, 80, 14), pathTube(barPath(-1), 0.0118, false, 80, 14)], m.tape);
  add(g, aeroTube(v(BAR.x, BAR.y, -0.032), v(BAR.x, BAR.y, 0.032), 0.03, 0.03, v(1, 0), 0), m.carbon);
  add(g, [v(BAR.x - 0.01, BAR.y - 0.12, 0.211), v(BAR.x - 0.01, BAR.y - 0.12, -0.211)].map((p) => place(new THREE.CylinderGeometry(0.0125, 0.0125, 0.012, 16), p, [0, 0, 90])), m.rubber);
  return g;
}

function buildShifters(m: Mats) {
  const g = group('shifters');
  for (const s of [1, -1]) {
    const hood = place(roundedBox(0.07, 0.034, 0.03, 0.012), v(BAR.x + 0.084, BAR.y - 0.006, s * 0.205), [0, 0, 6]);
    const horn = place(roundedBox(0.02, 0.028, 0.026, 0.009), v(BAR.x + 0.118, BAR.y + 0.006, s * 0.205), [0, 0, 25]);
    add(g, [hood, horn], m.rubber);
    const lever = pathTube([
      v(BAR.x + 0.118, BAR.y - 0.014, s * 0.205), v(BAR.x + 0.124, BAR.y - 0.05, s * 0.206),
      v(BAR.x + 0.115, BAR.y - 0.095, s * 0.208), v(BAR.x + 0.095, BAR.y - 0.125, s * 0.21),
    ], 0.0065, false, 30, 8);
    add(g, lever, m.alloyDark);
  }
  return g;
}

function buildSeatpost(m: Mats) {
  const g = group('seatpost');
  const a = along(B, ...SEAT_DIR, 0.45);
  const b = along(B, ...SEAT_DIR, 0.715);
  add(g, aeroTube(a, b, 0.052, 0.026, v(1, 0.3), 0.55), m.carbon);
  add(g, place(roundedBox(0.045, 0.03, 0.034, 0.01), along(B, ...SEAT_DIR, 0.725)), m.alloyDark);
  return g;
}

function buildSaddle(m: Mats) {
  const g = group('saddle');
  const half: [number, number][] = [
    [-0.118, 0], [-0.116, 0.05], [-0.103, 0.07], [-0.07, 0.072], [-0.025, 0.062],
    [0.025, 0.032], [0.075, 0.022], [0.112, 0.018], [0.125, 0],
  ];
  const pts = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [x, -y] as [number, number])];
  const shape = new THREE.Shape();
  shape.moveTo(...pts[0]);
  shape.splineThru(pts.slice(1).map(([x, y]) => new THREE.Vector2(x, y)));
  shape.closePath();
  const hole = new THREE.Path();
  hole.absellipse(-0.015, 0, 0.055, 0.011, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.009, bevelSize: 0.008, bevelSegments: 4, curveSegments: 24 });
  geo.rotateX(-Math.PI / 2);
  const sp = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    sp.setY(i, sp.getY(i) + (x < 0 ? 0.35 * x * x : -0.25 * x * x)); // opgewipte achterkant, licht aflopende neus
  }
  geo.computeVertexNormals();
  geo.translate(SADDLE.x + 0.01, SADDLE.y + 0.012, 0);
  add(g, geo, m.saddle);
  const rails = [1, -1].map((s) => pathTube([
    v(SADDLE.x - 0.09, SADDLE.y + 0.012, s * 0.035), v(SADDLE.x - 0.05, SADDLE.y - 0.005, s * 0.022),
    v(SADDLE.x + 0.04, SADDLE.y - 0.005, s * 0.02), v(SADDLE.x + 0.1, SADDLE.y + 0.012, s * 0.012),
  ], 0.0035, false, 30, 8));
  add(g, rails, m.alloyDark);
  return g;
}

function wheel(id: 'wheelF' | 'wheelR', c: THREE.Vector3, spokes: number, m: Mats) {
  const g = group(id);
  const profile = [
    [0.311, -0.0135], [0.3, -0.0142], [0.282, -0.0128], [0.266, -0.008], [0.2605, 0],
    [0.266, 0.008], [0.282, 0.0128], [0.3, 0.0142], [0.311, 0.0135],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const rim = new THREE.LatheGeometry(profile, 120);
  rim.rotateX(Math.PI / 2);
  rim.translate(c.x, c.y, 0);
  add(g, rim, m.rim);
  for (const side of [1, -1] as const) g.add(rimText('roval', c, 0.268, 0.304, side * 0.01405, side, 2));
  // naaf, flenzen, steekas
  const hubGeos = [
    place(new THREE.CylinderGeometry(0.017, 0.017, id === 'wheelR' ? 0.12 : 0.09, 24), c, [90, 0, 0]),
    place(new THREE.CylinderGeometry(0.026, 0.026, 0.004, 24), v(c.x, c.y, 0.03), [90, 0, 0]),
    place(new THREE.CylinderGeometry(0.026, 0.026, 0.004, 24), v(c.x, c.y, -0.03), [90, 0, 0]),
  ];
  add(g, hubGeos, m.alloyDark);
  const axleLen = id === 'wheelR' ? 0.168 : 0.1275;
  add(g, [
    place(new THREE.CylinderGeometry(0.0075, 0.0075, axleLen, 16), c, [90, 0, 0]),
    place(new THREE.CylinderGeometry(0.011, 0.011, 0.006, 16), v(c.x, c.y, axleLen / 2), [90, 0, 0]),
  ], m.alloyDark);
  // spaken
  const sp: THREE.BufferGeometry[] = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const side = i % 2 ? 1 : -1;
    const hub = v(c.x + Math.cos(a + 0.12 * side) * 0.024, c.y + Math.sin(a + 0.12 * side) * 0.024, side * 0.03);
    const rimP = v(c.x + Math.cos(a) * 0.262, c.y + Math.sin(a) * 0.262, side * 0.003);
    sp.push(roundTube(hub, rimP, 0.0011, 5));
  }
  add(g, sp, m.steel, { cast: false });
  // ventiel
  add(g, place(new THREE.CylinderGeometry(0.003, 0.003, 0.02, 8), v(c.x, c.y - 0.258)), m.steel);
  return g;
}

function buildTires(m: Mats) {
  const g = group('tires');
  for (const c of [R, F]) {
    const t = new THREE.TorusGeometry(WHEEL_R - 0.0135, 0.0135, 20, 160);
    t.translate(c.x, c.y, 0);
    add(g, t, m.tire);
    const band = new THREE.TorusGeometry(WHEEL_R - 0.022, 0.0118, 8, 160, Math.PI * 2);
    band.scale(1, 1, 1.02);
    band.translate(c.x, c.y, 0);
    add(g, band, m.tireSide, { cast: false });
  }
  return g;
}

function buildBrakes(m: Mats) {
  const g = group('brakes');
  const rotors: [THREE.Vector3, number, number][] = [[R, 0.07, 30], [F, 0.08, 150]];
  for (const [c, r, angle] of rotors) {
    add(g, place(annulus(r, r - 0.016, 0.0018), v(c.x, c.y, -0.052)), m.alloy);
    const spider = [0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i / 6) * 360;
      const p = v(c.x + Math.cos(THREE.MathUtils.degToRad(a)) * (r * 0.5), c.y + Math.sin(THREE.MathUtils.degToRad(a)) * (r * 0.5), -0.052);
      return place(roundedBox(r * 0.75, 0.012, 0.003, 0.003), p, [0, 0, a]);
    });
    spider.push(place(new THREE.CylinderGeometry(0.024, 0.024, 0.006, 24), v(c.x, c.y, -0.05), [90, 0, 0]));
    add(g, spider, m.alloyDark);
    const rad = THREE.MathUtils.degToRad(angle);
    const pos = v(c.x + Math.cos(rad) * (r - 0.008), c.y + Math.sin(rad) * (r - 0.008), -0.053);
    add(g, place(roundedBox(0.06, 0.026, 0.036, 0.009), pos, [0, 0, angle + 90]), m.alloyDark);
    add(g, place(roundedBox(0.04, 0.012, 0.038, 0.004), v(pos.x + Math.cos(rad) * 0.014, pos.y + Math.sin(rad) * 0.014, -0.053), [0, 0, angle + 90]), m.steel);
  }
  return g;
}

const COGS = [28, 25, 23, 21, 19, 17, 15, 14, 13, 12, 11];
const cogR = (t: number) => (t * 0.0127) / (2 * Math.PI);
const cogZ = (i: number) => 0.026 + i * 0.0038;

function buildCassette(m: Mats) {
  const g = group('cassette');
  const geos = COGS.map((t, i) => place(disc(cogR(t), 0.0018, 72), v(R.x, R.y, cogZ(i))));
  geos.push(place(disc(0.016, 0.044, 24), v(R.x, R.y, 0.045)));
  add(g, geos, m.alloy);
  return g;
}

// kettingloop: groot blad (52T) + 17T + derailleurwieltjes
const RING_R = cogR(52);
const COG_I = COGS.indexOf(17);
const PULLEY_R = 0.019;
const UP = v(R.x - 0.004, R.y - 0.062);
const LOW = v(R.x + 0.03, R.y - 0.135);

function arc(c: THREE.Vector3, r: number, from: number, to: number, n: number, z: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = THREE.MathUtils.degToRad(from + ((to - from) * i) / n);
    pts.push(v(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, z));
  }
  return pts;
}

function buildChain(m: Mats) {
  const g = group('chain');
  // volgorde: groot blad (voorkant) → onder naar onderste wieltje → bovenste wieltje → tandkrans → bovenpart terug
  const z = CHAIN_Z;
  const pts = [
    ...arc(B, RING_R, 92, -92, 20, z),
    ...arc(LOW, PULLEY_R, 270, 90, 8, z),
    ...arc(UP, PULLEY_R, -90, 90, 8, z),
    ...arc(R, cogR(17), 280, 92, 12, cogZ(COG_I)),
  ];
  const curve = pathTube(pts, 0.0034, true, 360, 6);
  add(g, curve, m.steel);
  add(g, pathTube(pts, 0.011, true, 120, 6), m.hit, { cast: false });
  return g;
}

function buildCrankset(m: Mats) {
  const g = group('crankset');
  const rings = [
    place(annulus(RING_R, RING_R - 0.012, 0.004), v(B.x, B.y, CHAIN_Z)),
    place(annulus(cogR(36), cogR(36) - 0.01, 0.004), v(B.x, B.y, CHAIN_Z - 0.006)),
  ];
  add(g, rings, m.alloyDark);
  const spider = [0, 1, 2, 3].map((i) => {
    const a = 45 + i * 90 + 15;
    const p = along(B, Math.cos(THREE.MathUtils.degToRad(a)), Math.sin(THREE.MathUtils.degToRad(a)), 0.05, CHAIN_Z + 0.004);
    return place(roundedBox(0.09, 0.016, 0.008, 0.004), p, [0, 0, a]);
  });
  const crankAngle = -32;
  const ca = THREE.MathUtils.degToRad(crankAngle);
  const pedalDS = v(B.x + Math.cos(ca) * 0.1725, B.y + Math.sin(ca) * 0.1725, 0.066);
  const pedalNDS = v(B.x - Math.cos(ca) * 0.1725, B.y - Math.sin(ca) * 0.1725, -0.066);
  const arms = [
    ...spider,
    aeroTube(v(B.x, B.y, 0.06), pedalDS, 0.032, 0.014, v(0, 0, 1).cross(v(Math.cos(ca), Math.sin(ca))), 0),
    aeroTube(v(B.x, B.y, -0.06), pedalNDS, 0.032, 0.014, v(0, 0, 1).cross(v(-Math.cos(ca), -Math.sin(ca))), 0),
    place(new THREE.CylinderGeometry(0.019, 0.019, 0.016, 24), v(B.x, B.y, 0.06), [90, 0, 0]),
    place(new THREE.CylinderGeometry(0.019, 0.019, 0.016, 24), v(B.x, B.y, -0.06), [90, 0, 0]),
    place(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 16), pedalDS, [90, 0, 0]),
    place(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 16), pedalNDS, [90, 0, 0]),
  ];
  add(g, arms, m.alloyDark);
  return g;
}

function buildPowermeter(m: Mats) {
  const g = group('powermeter');
  const ca = THREE.MathUtils.degToRad(-32 + 180);
  const p = v(B.x + Math.cos(ca) * 0.085, B.y + Math.sin(ca) * 0.085, -0.051);
  add(g, place(roundedBox(0.05, 0.02, 0.009, 0.004), p, [0, 0, -32]), m.carbon);
  add(g, place(roundedBox(0.012, 0.021, 0.0095, 0.003), v(p.x + Math.cos(ca) * 0.02, p.y + Math.sin(ca) * 0.02, p.z), [0, 0, -32]), m.accent);
  add(g, place(new THREE.BoxGeometry(0.07, 0.04, 0.03), p, [0, 0, -32]), m.hit, { cast: false });
  return g;
}

function buildBB(m: Mats) {
  const g = group('bb');
  add(g, [0.043, -0.043].map((z) => place(new THREE.CylinderGeometry(0.0235, 0.0235, 0.006, 32), v(B.x, B.y, z), [90, 0, 0])), m.alloy);
  add(g, place(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 16), B, [90, 0, 0]), m.hit, { cast: false });
  return g;
}

function buildRD(m: Mats) {
  const g = group('rd');
  const z = 0.07;
  const body = [
    place(roundedBox(0.03, 0.05, 0.022, 0.008), v(R.x - 0.012, R.y - 0.028, z), [0, 0, -15]),
    place(roundedBox(0.045, 0.024, 0.02, 0.007), v(R.x - 0.005, R.y - 0.052, z - 0.004), [0, 0, 35]),
  ];
  add(g, body, m.alloyDark);
  const mid = UP.clone().add(LOW).multiplyScalar(0.5);
  const ang = THREE.MathUtils.radToDeg(Math.atan2(LOW.y - UP.y, LOW.x - UP.x));
  const len = UP.distanceTo(LOW) + 0.042;
  add(g, [
    place(roundedBox(len, 0.034, 0.003, 0.0015), v(mid.x, mid.y, CHAIN_Z + 0.012), [0, 0, ang]),
    place(roundedBox(len * 0.9, 0.028, 0.003, 0.0015), v(mid.x, mid.y, CHAIN_Z - 0.012), [0, 0, ang]),
  ], m.carbon);
  add(g, [UP, LOW].map((p) => place(disc(PULLEY_R, 0.007, 32), v(p.x, p.y, CHAIN_Z))), m.rubber);
  add(g, place(new THREE.BoxGeometry(0.08, 0.15, 0.05), v(R.x + 0.005, R.y - 0.075, 0.055)), m.hit, { cast: false });
  return g;
}

function buildFD(m: Mats) {
  const g = group('fd');
  const top = v(B.x, B.y + RING_R);
  add(g, [
    place(roundedBox(0.08, 0.026, 0.003, 0.0015), v(top.x - 0.015, top.y + 0.022, CHAIN_Z + 0.012), [0, 0, -8]),
    place(roundedBox(0.06, 0.018, 0.003, 0.0015), v(top.x - 0.02, top.y + 0.02, CHAIN_Z - 0.01), [0, 0, -8]),
  ], m.alloy);
  add(g, place(roundedBox(0.036, 0.05, 0.034, 0.01), v(B.x - 0.05, B.y + 0.15, 0.022), [0, 0, -16]), m.alloyDark);
  return g;
}

function buildDi2(m: Mats) {
  const g = group('di2');
  const p = along(B, ...SEAT_DIR, 0.6);
  add(g, place(roundedBox(0.012, 0.045, 0.018, 0.004), v(p.x - 0.024, p.y, 0), [0, 0, -16]), m.alloyDark);
  add(g, place(new THREE.SphereGeometry(0.0025, 10, 8), v(p.x - 0.031, p.y + 0.012, 0)), m.led, { cast: false });
  add(g, place(new THREE.BoxGeometry(0.04, 0.07, 0.04), v(p.x - 0.024, p.y, 0), [0, 0, -16]), m.hit, { cast: false });
  return g;
}

export interface BikeModel {
  root: THREE.Group;
  parts: Map<PartId, THREE.Group>;
}

export function buildBike(): BikeModel {
  const m = makeMaterials();
  const root = new THREE.Group();
  root.name = 'venge';
  const groups = [
    buildFrame(m), buildFork(m), buildHeadset(m), buildStem(m), buildHandlebar(m), buildShifters(m),
    buildSeatpost(m), buildSaddle(m), wheel('wheelR', R, 24, m), wheel('wheelF', F, 21, m), buildTires(m),
    buildBrakes(m), buildCassette(m), buildChain(m), buildCrankset(m), buildPowermeter(m), buildBB(m),
    buildRD(m), buildFD(m), buildDi2(m),
  ];
  const parts = new Map<PartId, THREE.Group>();
  for (const g of groups) {
    // eigen materiaalkopieën per onderdeel, zodat markeren per onderdeel kan
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = (o.material as THREE.Material).clone();
        o.userData.partId = g.userData.partId;
      }
    });
    parts.set(g.userData.partId, g);
    root.add(g);
  }
  // fiets centreren rond de oorsprong
  root.position.set(-0.5, 0, 0);
  return { root, parts };
}
