// Draws a 3D race: the world, the cars (the garage's 3D models), power-ups in flight,
// effects, and a chase camera behind your car.
import * as THREE from 'three';
import { carModel } from './cars.js';
import { World, themeOf } from './world.js';
import { DRIFT_MIN } from './car.js';

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    let renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch {
      /* no WebGL */
    }
    this.renderer = renderer;
    if (!renderer) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 900);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  get ok() {
    return !!this.renderer;
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // a narrow portrait screen needs a wider view to see the road ahead
    this.baseFov = w < h ? 78 : 62;
    this.camera.updateProjectionMatrix();
  }

  /** Build the scene for a race. */
  load(race) {
    this.race = race;
    const track = race.track;
    const theme = themeOf(track.map.id);
    const scene = (this.scene = new THREE.Scene());
    this.world = new World(track);
    scene.add(this.world.group);
    scene.background = this.world.skyTexture();
    scene.fog = new THREE.Fog(theme.fog[0], theme.fog[1], theme.fog[2]);
    // sky light from above, the ground's colour bounced from below; a warm sun
    scene.add(new THREE.HemisphereLight(new THREE.Color(theme.sky[0]).lerp(new THREE.Color(0xffffff), 0.55), new THREE.Color(theme.grass[1]).multiplyScalar(0.8), 1.7));
    const sun = (this.sun = new THREE.DirectionalLight(theme.fog[1] < 100 ? 0xf0f4ff : 0xffefd2, theme.fog[1] < 100 ? 1.6 : 2.4));
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 });
    sun.shadow.bias = -0.0008;
    scene.add(sun, sun.target);

    this.cars = race.cars.map((car) => {
      const model = carModel(car.vehicle.id, car.skin).clone();
      model.traverse((o) => (o.castShadow = true));
      const holder = new THREE.Group(); // yaw + pitch; the model inside rolls/spins
      holder.add(model);
      const shield = new THREE.Mesh(new THREE.SphereGeometry(Math.max(2.2, model.userData.length * 0.62), 20, 14), new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.28, depthWrite: false }));
      shield.position.y = 1;
      holder.add(shield);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.2, 10), new THREE.MeshBasicMaterial({ color: 0x66c8ff, transparent: true, opacity: 0.85 }));
      flame.rotation.z = Math.PI / 2;
      flame.position.set(-model.userData.length / 2 - 0.9, 0.5, 0);
      holder.add(flame);
      scene.add(holder);
      const wheels = [];
      model.traverse((o) => o.name === 'wheel' && wheels.push(o));
      for (const w of wheels) w.rotation.order = 'YXZ'; // steer, then spin
      return { car, holder, model, shield, flame, wheels, lastSpin: 0 };
    });

    this.hazardMeshes = new Map();
    this.camPos = null;
    this.shake = 0;
    this.particles = [];
    this.puffGeo = new THREE.SphereGeometry(0.5, 6, 4);
    this.sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    this.mats = {
      smoke: basic(0xdedede, 0.5),
      dust: basic(0xb89870, 0.55),
      splash: basic(0xe6f4fa, 0.7),
      spark: basic(0xffb347),
      blue: basic(0x5ad1ff),
      orange: basic(0xff8a2a),
      boom: basic(0xff9a30, 0.8),
    };
  }

  // a short-lived particle: kind picks the look; vel in world m/s
  emit(kind, pos, vel, life, size = 1, grow = 2) {
    if (this.particles.length > 260) return;
    const spark = kind === 'spark' || kind === 'blue' || kind === 'orange';
    const m = new THREE.Mesh(spark ? this.sparkGeo : this.puffGeo, this.mats[kind]);
    m.position.copy(pos);
    m.scale.setScalar(size);
    this.scene.add(m);
    this.particles.push({ m, vel, life, max: life, size, grow, gravity: spark ? 14 : -1 });
  }

  // world placement of a car (or anything at road place s, d, height y)
  place(obj, s, d, y, yaw, pitch = 0) {
    const p = this.race.track.point(s, d);
    obj.position.set(p.x, y, p.z);
    obj.rotation.set(0, -(p.heading + yaw), pitch, 'YZX');
    return p;
  }

  draw(dt) {
    if (!this.ok || !this.race) return;
    const race = this.race;
    const time = performance.now() / 1000;
    for (const v of this.cars) {
      const c = v.car;
      this.place(v.holder, c.s, c.d, c.y, c.psi, c.pitch);
      v.model.rotation.set(-Math.sign(c.phi - c.psi) * Math.min(0.08, c.drift * 0.1), c.spinAngle, 0); // lean into slides, spin when hit
      v.shield.visible = c.shield > 0;
      v.flame.visible = c.boost > 0;
      v.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
      for (const w of v.wheels) {
        w.rotation.z -= (c.v / (w.userData.r || 0.35)) * dt;
        if (w.userData.front) w.rotation.y = (c === this.race.player ? this.steer ?? 0 : 0) * 0.4;
      }
      this.effects(v, c, dt);
    }
    this.drawHazards(time);
    this.drawParticles(dt);
    this.world.updatePickups(race, time);
    this.chase(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // smoke, dust, splashes, sparks and bangs around a car
  effects(v, c, dt) {
    if (dt <= 0) return;
    const at = (x, y, z) => new THREE.Vector3(x, y, z).applyEuler(v.holder.rotation).add(v.holder.position);
    const rnd = (k) => (Math.random() - 0.5) * k;
    const speed = Math.abs(c.v);
    const t = this.race.track;
    const back = -v.model.userData.length / 2 + 0.3;
    if (c.grounded && speed > 10) {
      if (Math.abs(c.d) > 7 && Math.random() < 0.6) this.emit('dust', at(back, 0.3, rnd(1.4)), new THREE.Vector3(rnd(2), 1.5, rnd(2)), 0.8, 0.8, 3);
      const ford = t.inFord(c.s);
      if ((ford && c.y < ford.level + 0.3) || c.splash) for (let i = 0; i < 3; i++) this.emit('splash', at(rnd(2), 0.3, rnd(1.6)), new THREE.Vector3(rnd(4), 3 + Math.random() * 3, rnd(4)), 0.6, 0.5, 1.5);
      if (c.drift > 0.35 && Math.random() < 0.5) this.emit('smoke', at(back, 0.3, rnd(1.4)), new THREE.Vector3(0, 1, 0), 0.6, 1, 3);
      if (c.driftCharge > DRIFT_MIN) for (const side of [-0.7, 0.7]) this.emit(c.driftCharge > 1.5 ? 'orange' : 'blue', at(back, 0.15, side), new THREE.Vector3(rnd(3), 2 + Math.random() * 2, rnd(3)), 0.3, 1, 0);
    }
    c.splash = 0;
    if (c.crash > 0.3 || c.bump > 0.2) {
      for (let i = 0; i < 6; i++) this.emit('spark', at(v.model.userData.length / 2 * (c.bump > 0.2 ? 0 : 1), 0.6, Math.sign(c.d) * (c.bump > 0.2 ? 0.9 : 0)), new THREE.Vector3(rnd(8), 3 + Math.random() * 4, rnd(8)), 0.5);
      if (c === this.race.player) this.shake = Math.max(this.shake, Math.max(c.crash, c.bump) * 0.6);
    }
    if (c === this.race.player && c.jolt > 0.2) this.shake = Math.max(this.shake, c.jolt * 0.35);
    // a power-up hit: a bang
    if (c.spin > v.lastSpin + 0.3 && c.crash < 0.3) {
      this.emit('boom', at(0, 1, 0), new THREE.Vector3(0, 1, 0), 0.5, 1.2, 9);
      for (let i = 0; i < 10; i++) this.emit('spark', at(0, 1, 0), new THREE.Vector3(rnd(14), 4 + Math.random() * 6, rnd(14)), 0.7);
      if (c === this.race.player) this.shake = Math.max(this.shake, 0.7);
    }
    v.lastSpin = c.spin;
  }

  drawParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.vel.y -= p.gravity * dt;
      p.m.position.addScaledVector(p.vel, dt);
      p.m.scale.setScalar(p.size * (1 + (1 - p.life / p.max) * p.grow));
      if (p.life <= 0) this.scene.remove(p.m);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  drawHazards(time) {
    const seen = new Set();
    for (const h of this.race.hazards) {
      seen.add(h);
      let m = this.hazardMeshes.get(h);
      if (!m) {
        m = this.hazardMesh(h.kind);
        this.hazardMeshes.set(h, m);
        this.scene.add(m);
      }
      this.place(m, h.s, h.d, h.y, 0);
      if (h.kind === 'coconut') m.rotation.x = time * 8;
      if (h.kind === 'rocket') m.children[2].scale.y = 0.8 + Math.random() * 0.6; // flickering exhaust
    }
    for (const [h, m] of this.hazardMeshes) {
      if (!seen.has(h)) {
        this.scene.remove(m);
        this.hazardMeshes.delete(h);
      }
    }
  }

  hazardMesh(kind) {
    const g = new THREE.Group();
    if (kind === 'rocket') {
      // a Vesak firework rocket: red body, gold cone, flame
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.4, 10).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd62828 }));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 10).rotateZ(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf2c230 }));
      tip.position.x = 1;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.4, 8).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
      flame.position.x = -1.3;
      g.add(body, tip, flame);
    } else if (kind === 'coconut') {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshLambertMaterial({ color: 0x6b4a2a })));
    } else if (kind === 'oil') {
      const slick = new THREE.Mesh(new THREE.CircleGeometry(1.9, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x15131a, transparent: true, opacity: 0.85 }));
      slick.position.y = 0.06;
      slick.scale.set(1.4, 1, 1);
      g.add(slick);
    }
    return g;
  }

  // the camera trails behind and above your car, looking a little ahead; wider when boosting
  chase(dt) {
    const v = this.cars.find((x) => x.car === this.race.player) ?? this.cars[0];
    const c = v.car;
    const t = this.race.track;
    const yaw = t.headingAt(c.s) + c.psi * 0.6;
    const behind = 7.5 + Math.min(3, Math.abs(c.v) * 0.06);
    const target = new THREE.Vector3().copy(v.holder.position);
    const want = target.clone().add(new THREE.Vector3(-Math.cos(yaw) * behind, 3.4 + Math.min(1.5, Math.abs(c.v) * 0.03), -Math.sin(yaw) * behind));
    // never dip under the ground behind (on climbs and in valleys)
    const ground = this.world.groundAt(want.x, want.z);
    want.y = Math.max(want.y, ground + 1.5, t.heightAt(Math.max(0, c.s - behind)) + 2);
    if (!this.camPos) this.camPos = want.clone();
    this.camPos.lerp(want, 1 - Math.pow(0.002, dt));
    this.camera.position.copy(this.camPos);
    // shake after crashes, pothole jolts and hard landings
    this.shake = Math.max(0, this.shake - dt * 2.5);
    if (this.shake > 0) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake));
    const look = target.clone().add(new THREE.Vector3(Math.cos(yaw) * 6, 1.2, Math.sin(yaw) * 6));
    this.camera.lookAt(look);
    const fov = this.baseFov + (c.boost > 0 ? 10 : 0) + Math.min(6, Math.abs(c.v) * 0.12);
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
    // the sun's shadow follows the action; the sun itself hangs far off in that direction
    this.sun.position.copy(target).add(new THREE.Vector3(30, 60, 20));
    this.sun.target.position.copy(target);
    this.world.sun.position.copy(this.camera.position).add(new THREE.Vector3(30, 60, 20).normalize().multiplyScalar(650));
  }
}
