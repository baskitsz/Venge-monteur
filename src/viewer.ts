// 3D-viewer: scène, camera, hover/selectie en camerafocus per onderdeel.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildBike, FOCUS_VIEW, type PartId } from './bike/model';

export type HoverDetail = { id: PartId | null; x: number; y: number };

const HOME_DIR = new THREE.Vector3(0.55, 0.28, 1).normalize();
const HOME_TARGET = new THREE.Vector3(0, 0.5, 0);

export class BikeViewer extends EventTarget {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private parts: Map<PartId, THREE.Group>;
  private hovered: PartId | null = null;
  private selected: PartId | null = null;
  private tints = new Map<PartId, THREE.Color>();
  private accent = new THREE.Color('#ff7a1a');
  private tween: { t0: number; dur: number; fromPos: THREE.Vector3; toPos: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3 } | null = null;
  private dirty = true;
  private downAt: { x: number; y: number; t: number } | null = null;
  private userMoved = false;
  private reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(private container: HTMLElement) {
    super();
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    r.domElement.setAttribute('aria-label', '3D-model van de fiets. Klik op een onderdeel voor onderhoudsinstructies.');
    r.domElement.setAttribute('role', 'img');

    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.85;

    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(1.5, 3, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -1.2, right: 1.2, top: 1.2, bottom: -1.2, near: 0.5, far: 8 });
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 6;
    this.scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x444444, 0.5));

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.22 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const bike = buildBike();
    this.parts = bike.parts;
    this.scene.add(bike.root);

    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, {
      enableDamping: true, dampingFactor: 0.08, minDistance: 0.2, maxDistance: 10,
      maxPolarAngle: Math.PI * 0.52, enablePan: true, screenSpacePanning: true,
    });
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.controls.addEventListener('start', () => {
      this.tween = null;
      this.userMoved = true;
    });
    this.home(false);

    r.domElement.addEventListener('pointermove', (e) => this.onMove(e));
    r.domElement.addEventListener('pointerleave', () => this.setHover(null, 0, 0));
    r.domElement.addEventListener('pointerdown', (e) => (this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() }));
    r.domElement.addEventListener('pointerup', (e) => this.onUp(e));

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    const loop = () => {
      requestAnimationFrame(loop);
      this.step();
    };
    loop();
  }

  get partIds() {
    return [...this.parts.keys()];
  }

  setAccent(color: string) {
    this.accent.set(color);
    this.applyHighlights();
  }

  /** Kleur per onderdeel (statusweergave). null = geen kleur. */
  setTints(tints: Map<PartId, string | null>) {
    this.tints.clear();
    for (const [id, c] of tints) if (c) this.tints.set(id, new THREE.Color(c));
    this.applyHighlights();
  }

  select(id: PartId | null, focus = true) {
    this.selected = id;
    this.applyHighlights();
    if (id && focus) this.focus(id);
    this.dispatchEvent(new CustomEvent('select', { detail: id }));
  }

  focus(id: PartId) {
    const g = this.parts.get(id);
    if (!g) return;
    const box = new THREE.Box3();
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.material as THREE.Material).visible !== false) box.expandByObject(o);
    });
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dir = (FOCUS_VIEW[id]?.clone() ?? this.camera.position.clone().sub(this.controls.target)).normalize();
    const fit = sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const aspectFix = this.camera.aspect < 1 ? 1 / this.camera.aspect : 1;
    const dist = THREE.MathUtils.clamp(fit * 1.5 * aspectFix, 0.65, 3.5);
    this.animateTo(sphere.center.clone().add(dir.multiplyScalar(dist)), sphere.center);
  }

  home(animate = true) {
    // zo ver weg dat de hele fiets (~1,6 x 1,05 m) in beeld past, ook in staand formaat
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const dist = Math.max(0.78 / Math.tan(hHalf), 0.6 / Math.tan(vHalf)) * 1.06;
    const pos = HOME_TARGET.clone().add(HOME_DIR.clone().multiplyScalar(dist));
    if (animate) this.animateTo(pos, HOME_TARGET.clone());
    else {
      this.camera.position.copy(pos);
      this.controls.target.copy(HOME_TARGET);
      this.controls.update();
    }
  }

  /** Schermpositie van het midden van een onderdeel (voor labels). */
  screenPos(id: PartId) {
    const g = this.parts.get(id);
    if (!g) return null;
    const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3()).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: ((c.x + 1) / 2) * rect.width, y: ((1 - c.y) / 2) * rect.height };
  }

  private animateTo(pos: THREE.Vector3, target: THREE.Vector3) {
    this.tween = {
      t0: performance.now(), dur: this.reduceMotion ? 1 : 750,
      fromPos: this.camera.position.clone(), toPos: pos, fromT: this.controls.target.clone(), toT: target,
    };
  }

  private step() {
    if (this.tween) {
      const { t0, dur, fromPos, toPos, fromT, toT } = this.tween;
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      this.camera.position.lerpVectors(fromPos, toPos, e);
      this.controls.target.lerpVectors(fromT, toT, e);
      if (k >= 1) this.tween = null;
      this.dirty = true;
    }
    this.controls.update();
    if (this.dirty) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
      this.dispatchEvent(new Event('render'));
    }
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.userMoved && !this.selected) this.home(false);
    this.dirty = true;
  }

  private pick(e: PointerEvent): PartId | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.parts.values()], true);
    return (hits[0]?.object.userData.partId as PartId) ?? null;
  }

  private onMove(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.setHover(this.pick(e), e.clientX - rect.left, e.clientY - rect.top);
  }

  private onUp(e: PointerEvent) {
    const d = this.downAt;
    this.downAt = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 600) return; // was slepen
    const id = this.pick(e);
    if (id) this.select(id);
    else if (this.selected) this.select(null, false);
  }

  private setHover(id: PartId | null, x: number, y: number) {
    if (id !== this.hovered) {
      this.hovered = id;
      this.renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
      this.applyHighlights();
    }
    this.dispatchEvent(new CustomEvent<HoverDetail>('hover', { detail: { id, x, y } }));
  }

  private applyHighlights() {
    for (const [id, g] of this.parts) {
      let color = new THREE.Color(0, 0, 0);
      let intensity = 0;
      const tint = this.tints.get(id);
      if (tint) [color, intensity] = [tint, 0.55];
      if (id === this.hovered) [color, intensity] = [this.accent, 0.45];
      if (id === this.selected) [color, intensity] = [this.accent, 0.8];
      g.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mat = o.material as THREE.MeshPhysicalMaterial;
        if (!('emissive' in mat) || mat.userData.keepEmissive) return;
        if (mat.userData.baseEmissive === undefined) {
          mat.userData.baseEmissive = mat.emissive.clone();
          mat.userData.baseIntensity = mat.emissiveIntensity;
          if (mat.emissiveIntensity > 0 && mat.emissive.getHex() !== 0) mat.userData.keepEmissive = true;
        }
        if (mat.userData.keepEmissive) return;
        mat.emissive.copy(color);
        mat.emissiveIntensity = intensity * 0.35;
      });
    }
    this.dirty = true;
  }
}
