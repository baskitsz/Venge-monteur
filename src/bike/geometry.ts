// Kleine bouwstenen voor het procedurele fietsmodel. Eenheden: meter.
// Assenstelsel: x = rijrichting (voor), y = omhoog, z = zijkant (+z = aandrijfkant).
import * as THREE from 'three';

export const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

/** Punt op afstand `len` vanaf `from` in richting (dx, dy). */
export function along(from: THREE.Vector3, dx: number, dy: number, len: number, z = from.z) {
  const d = new THREE.Vector2(dx, dy).normalize();
  return v(from.x + d.x * len, from.y + d.y * len, z);
}

/**
 * Buis tussen a en b met een (aero)profiel.
 * chord = diepte van het profiel in het fietsvlak, width = breedte (z).
 * front = richting waar de 'neus' van het profiel naar wijst (wordt loodrecht op de buis gezet).
 */
export function aeroTube(
  a: THREE.Vector3,
  b: THREE.Vector3,
  chord: number,
  width: number,
  front: THREE.Vector3 = v(1, 0, 0),
  teardrop = 0.55,
  radial = 28,
): THREE.BufferGeometry {
  const dir = b.clone().sub(a);
  const len = dir.length();
  dir.normalize();
  const geo = new THREE.CylinderGeometry(0.5, 0.5, len, radial, 1, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const taper = x < 0 ? 1 + 2 * x * teardrop : 1; // spitse achterrand
    pos.setX(i, x * chord);
    pos.setZ(i, z * width * taper);
  }
  geo.computeVertexNormals();
  const X = front.clone().sub(dir.clone().multiplyScalar(front.dot(dir)));
  if (X.lengthSq() < 1e-8) X.set(0, 0, 1);
  X.normalize();
  const Z = new THREE.Vector3().crossVectors(X, dir).normalize();
  const m = new THREE.Matrix4().makeBasis(X, dir, Z);
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  geo.applyMatrix4(m);
  return geo;
}

export function roundTube(a: THREE.Vector3, b: THREE.Vector3, r: number, radial = 16) {
  return aeroTube(a, b, r * 2, r * 2, v(1, 0, 0), 0, radial);
}

/** Buis langs een vloeiende curve door de punten. */
export function pathTube(points: THREE.Vector3[], r: number, closed = false, segments = 120, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.TubeGeometry(curve, segments, r, radial, closed);
}

/** Platte ring (kettingblad, remschijf) in het xy-vlak, gecentreerd op z = 0. */
export function annulus(rOuter: number, rInner: number, thickness: number, segments = 96) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOuter, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rInner, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: segments });
  geo.translate(0, 0, -thickness / 2);
  return geo;
}

/** Schijf (tandwiel) in het xy-vlak. */
export function disc(r: number, thickness: number, segments = 64) {
  const geo = new THREE.CylinderGeometry(r, r, thickness, segments);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/** Afgeronde balk (behuizingen van derailleurs, hendels). */
export function roundedBox(w: number, h: number, d: number, r = Math.min(w, h, d) * 0.25) {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const bevel = Math.min(r, d / 2) * 0.9;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(d - bevel * 2, 0.0005),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.6,
    bevelSegments: 3,
    curveSegments: 6,
  });
  geo.translate(0, 0, -(d - bevel * 2) / 2);
  return geo;
}

/** Plaats een geometrie met een rotatie (graden) en positie. */
export function place(geo: THREE.BufferGeometry, pos: THREE.Vector3, rotDeg: [number, number, number] = [0, 0, 0]) {
  const e = new THREE.Euler(...rotDeg.map(THREE.MathUtils.degToRad) as [number, number, number]);
  geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e).setPosition(pos));
  return geo;
}
