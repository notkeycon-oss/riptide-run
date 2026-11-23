// Go Fast Rally — particle effects (dust trails, gravel, smoke, sparks, flames) and tyre marks.
(function () {
  const G = window.G;

  const VS = `
    attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
    uniform float uScale;
    varying float vA; varying vec3 vC; varying float vDepth;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 0.0, 900.0);
      vA = aAlpha; vC = aColor; vDepth = -mv.z;
    }`;
  const FS = `
    uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform vec3 uTint; uniform float uSoft;
    varying float vA; varying vec3 vC; varying float vDepth;
    void main(){
      vec2 d = gl_PointCoord - 0.5;
      float r = dot(d, d) * 4.0;
      if (r > 1.0) discard;
      float a = vA * mix(1.0 - r, (1.0 - r) * (1.0 - r), uSoft);
      vec3 c = vC * uTint;
      float f = smoothstep(uFogNear, uFogFar, vDepth);
      c = mix(c, uFogColor, f);
      // fade particles right in front of the camera so the car stays visible
      float nearFade = smoothstep(2.0, 9.0, vDepth);
      gl_FragColor = vec4(c, a * (1.0 - f * 0.7) * nearFade);
    }`;

  class Particles {
    constructor(scene, max, additive) {
      this.max = max;
      this.n = 0;
      this.head = 0;
      this.p = new Float32Array(max * 3);
      this.v = new Float32Array(max * 3);
      this.life = new Float32Array(max);
      this.maxLife = new Float32Array(max);
      this.s0 = new Float32Array(max);
      this.s1 = new Float32Array(max);
      this.a0 = new Float32Array(max);
      this.drag = new Float32Array(max);
      this.grav = new Float32Array(max);
      this.col = new Float32Array(max * 3);
      const g = new THREE.BufferGeometry();
      this.posAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
      this.sizeAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
      this.alphaAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
      this.colAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.posAttr);
      g.setAttribute('aSize', this.sizeAttr);
      g.setAttribute('aAlpha', this.alphaAttr);
      g.setAttribute('aColor', this.colAttr);
      g.setDrawRange(0, 0);
      this.mat = new THREE.ShaderMaterial({
        uniforms: {
          uScale: { value: 600 },
          uFogColor: { value: new THREE.Color(0xffffff) },
          uFogNear: { value: 100 },
          uFogFar: { value: 600 },
          uTint: { value: new THREE.Color(1, 1, 1) },
          uSoft: { value: additive ? 1 : 0.4 },
        },
        vertexShader: VS,
        fragmentShader: FS,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.points = new THREE.Points(g, this.mat);
      this.points.frustumCulled = false;
      this.points.renderOrder = additive ? 3 : 2;
      scene.add(this.points);
      this.alive = new Uint8Array(max);
    }
    spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag, grav) {
      const i = this.head;
      this.head = (this.head + 1) % this.max;
      if (i >= this.n) this.n = i + 1;
      this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
      this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
      this.life[i] = 0; this.maxLife[i] = life;
      this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a;
      this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
      this.drag[i] = drag; this.grav[i] = grav;
      this.alive[i] = 1;
    }
    update(dt) {
      const P = this.posAttr.array, Sz = this.sizeAttr.array, A = this.alphaAttr.array, C = this.colAttr.array;
      for (let i = 0; i < this.n; i++) {
        if (!this.alive[i]) { A[i] = 0; Sz[i] = 0; continue; }
        const l = (this.life[i] += dt);
        const ml = this.maxLife[i];
        if (l >= ml) { this.alive[i] = 0; A[i] = 0; Sz[i] = 0; continue; }
        const t = l / ml;
        const dr = Math.exp(-this.drag[i] * dt);
        this.v[i * 3] *= dr;
        this.v[i * 3 + 1] = this.v[i * 3 + 1] * dr - this.grav[i] * dt;
        this.v[i * 3 + 2] *= dr;
        this.p[i * 3] += this.v[i * 3] * dt;
        this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
        this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
        P[i * 3] = this.p[i * 3]; P[i * 3 + 1] = this.p[i * 3 + 1]; P[i * 3 + 2] = this.p[i * 3 + 2];
        Sz[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
        A[i] = this.a0[i] * (t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92);
        C[i * 3] = this.col[i * 3]; C[i * 3 + 1] = this.col[i * 3 + 1]; C[i * 3 + 2] = this.col[i * 3 + 2];
      }
      this.points.geometry.setDrawRange(0, this.n);
      this.posAttr.needsUpdate = true;
      this.sizeAttr.needsUpdate = true;
      this.alphaAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
    }
    clear() {
      this.alive.fill(0);
      this.n = 0;
      this.head = 0;
    }
    dispose() {
      this.points.parent && this.points.parent.remove(this.points);
      this.points.geometry.dispose();
      this.mat.dispose();
    }
  }

  class Skids {
    constructor(scene, cap) {
      this.cap = cap;
      this.head = 0;
      const g = new THREE.BufferGeometry();
      this.pos = new Float32Array(cap * 4 * 3);
      this.col = new Float32Array(cap * 4 * 4);
      const idx = new Uint32Array(cap * 6);
      for (let i = 0; i < cap; i++) {
        idx[i * 6] = i * 4; idx[i * 6 + 1] = i * 4 + 1; idx[i * 6 + 2] = i * 4 + 2;
        idx[i * 6 + 3] = i * 4 + 2; idx[i * 6 + 4] = i * 4 + 1; idx[i * 6 + 5] = i * 4 + 3;
      }
      this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
      this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.posAttr);
      g.setAttribute('color', this.colAttr);
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      const nrm = new Float32Array(cap * 4 * 3);
      for (let i = 0; i < cap * 4; i++) nrm[i * 3 + 1] = 1;
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -8, side: THREE.DoubleSide });
      this.mesh = new THREE.Mesh(g, this.mat);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 1;
      scene.add(this.mesh);
      this.last = [null, null, null, null];
      this.dirty = false;
      this.minIdx = cap;
      this.maxIdx = -1;
    }
    // add a segment for wheel w at world point (x,y,z), direction-right vector (rx,rz), intensity 0..1
    add(w, x, y, z, rx, rz, width, rgba, amt) {
      const L = this.last[w];
      if (!L) {
        this.last[w] = { x, y, z, rx, rz };
        return;
      }
      const dx = x - L.x, dz = z - L.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.35 * 0.35) return;
      if (d2 > 9) {
        this.last[w] = { x, y, z, rx, rz };
        return;
      }
      const i = this.head;
      this.head = (this.head + 1) % this.cap;
      const hw = width / 2;
      const P = this.pos, C = this.col;
      const o = i * 12;
      P[o] = L.x - L.rx * hw; P[o + 1] = L.y; P[o + 2] = L.z - L.rz * hw;
      P[o + 3] = L.x + L.rx * hw; P[o + 4] = L.y; P[o + 5] = L.z + L.rz * hw;
      P[o + 6] = x - rx * hw; P[o + 7] = y; P[o + 8] = z - rz * hw;
      P[o + 9] = x + rx * hw; P[o + 10] = y; P[o + 11] = z + rz * hw;
      const a = rgba[3] * amt;
      for (let k = 0; k < 4; k++) {
        C[i * 16 + k * 4] = rgba[0];
        C[i * 16 + k * 4 + 1] = rgba[1];
        C[i * 16 + k * 4 + 2] = rgba[2];
        C[i * 16 + k * 4 + 3] = k < 2 ? L.a == null ? a : L.a : a;
      }
      L.x = x; L.y = y; L.z = z; L.rx = rx; L.rz = rz; L.a = a;
      this.dirty = true;
      this.minIdx = Math.min(this.minIdx, i);
      this.maxIdx = Math.max(this.maxIdx, i);
    }
    lift(w) {
      this.last[w] = null;
    }
    flush() {
      if (!this.dirty) return;
      this.dirty = false;
      // upload the touched range only
      const a = this.minIdx, b = this.maxIdx;
      this.posAttr.updateRange.offset = a * 12;
      this.posAttr.updateRange.count = (b - a + 1) * 12;
      this.colAttr.updateRange.offset = a * 16;
      this.colAttr.updateRange.count = (b - a + 1) * 16;
      this.posAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
      this.minIdx = this.cap;
      this.maxIdx = -1;
    }
    clear() {
      this.pos.fill(0);
      this.col.fill(0);
      this.posAttr.updateRange.offset = 0;
      this.posAttr.updateRange.count = -1;
      this.colAttr.updateRange.offset = 0;
      this.colAttr.updateRange.count = -1;
      this.posAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
      this.last = [null, null, null, null];
      this.head = 0;
    }
    dispose() {
      this.mesh.parent && this.mesh.parent.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mat.dispose();
    }
  }

  // High level effects driver for one car
  class FX {
    constructor(scene, quality) {
      this.scene = scene;
      this.q = quality;
      this.dust = new Particles(scene, quality.particles, false);
      this.glow = new Particles(scene, Math.floor(quality.particles / 4), true);
      this.skids = new Skids(scene, quality.skids);
      this.acc = [0, 0, 0, 0];
      this.gacc = [0, 0, 0, 0];
      this.smokeAcc = 0;
      this.r = G.rng(77);
      this.tmp = new THREE.Vector3();
    }
    setEnv(world, camera, renderer) {
      const fog = world.scene.fog;
      for (const p of [this.dust, this.glow]) {
        p.mat.uniforms.uFogColor.value.copy(fog.color);
        p.mat.uniforms.uFogNear.value = fog.near;
        p.mat.uniforms.uFogFar.value = fog.far;
      }
      const T = world.time;
      const tint = T.night ? 0.32 : T.name === 'Sunset' ? 0.85 : 1.0;
      this.dust.mat.uniforms.uTint.value.setRGB(tint, tint * (T.name === 'Sunset' ? 0.92 : 1), tint * (T.name === 'Sunset' ? 0.85 : 1));
      this.world = world;
      this.wetMul = world.wet ? 0.25 : 1;
      this.resize(camera, renderer);
    }
    resize(camera, renderer) {
      const h = renderer.domElement.height;
      const s = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
      this.dust.mat.uniforms.uScale.value = s;
      this.glow.mat.uniforms.uScale.value = s;
    }

    // per-frame car effects
    car(ph, model, dt, ghostMode) {
      const r = this.r;
      const theme = this.world.theme;
      const dustC = theme.dust;
      const speed = ph.speed;
      const vel = ph.vel;
      const rain = this.world.wet;
      for (let i = 0; i < 4; i++) {
        const w = ph.wheels[i];
        if (!w.contact) {
          this.skids.lift(i);
          continue;
        }
        const surf = G.SURF[w.surf] || G.SURF.gravel;
        const slip = Math.min(3, w.slip);
        // dust trail: thrown constantly on loose dry surfaces, more when sliding
        const loose = surf.dust * this.wetMul * (rain && surf.loose ? 0.6 : 1);
        let rate = loose * (Math.max(0, speed - 4) * 0.32 + Math.max(0, slip - 0.6) * 7) * (w.front ? 0.25 : 1);
        if (w.surf === 'tarmac' || w.surf === 'ice') rate = slip > 1.15 ? (slip - 1.1) * 28 : 0;
        this.acc[i] += rate * dt * this.q.fxMul;
        const cp = w.cp;
        while (this.acc[i] >= 1) {
          this.acc[i] -= 1;
          const tarmac = w.surf === 'tarmac' || w.surf === 'ice';
          let cr = dustC[0], cg = dustC[1], cb = dustC[2];
          if (tarmac) { cr = cg = cb = 0.85; }
          else if (w.road < 1 && !theme.snowbanks) { cr *= 0.9; cg *= 0.88; cb *= 0.82; }
          const j = 0.92 + r() * 0.16;
          const bk = ph.fwd;
          this.dust.spawn(
            cp.x - bk.x * 0.6 + (r() - 0.5) * 0.4, cp.y + 0.15, cp.z - bk.z * 0.6 + (r() - 0.5) * 0.4,
            vel.x * 0.25 + (r() - 0.5) * 2.2, 0.6 + r() * 1.8, vel.z * 0.25 + (r() - 0.5) * 2.2,
            tarmac ? 1.8 + r() : 2.6 + r() * 2.4,
            0.5, tarmac ? 3.2 : 3.6 + r() * 2.6,
            cr * j, cg * j, cb * j,
            tarmac ? 0.26 : 0.13 + Math.min(0.07, speed * 0.002),
            1.1, -0.12,
          );
        }
        // gravel/snow chunks when wheels slide or spin
        if (surf.loose && slip > 0.85 && speed > 2) {
          this.gacc[i] += (slip - 0.85) * 26 * dt * this.q.fxMul;
          while (this.gacc[i] >= 1) {
            this.gacc[i] -= 1;
            const back = ph.fwd;
            const k = theme.snowbanks ? 1.0 : 0.35;
            this.dust.spawn(
              cp.x, cp.y + 0.1, cp.z,
              vel.x * 0.5 - back.x * (3 + r() * 4) + (r() - 0.5) * 3, 1.5 + r() * 3, vel.z * 0.5 - back.z * (3 + r() * 4) + (r() - 0.5) * 3,
              0.5 + r() * 0.4, 0.09, 0.07,
              dustC[0] * k, dustC[1] * k, dustC[2] * k, 0.95, 0.4, 9.8,
            );
          }
        }
        // rain spray
        if (rain && speed > 8 && r() < speed * 0.012 * this.q.fxMul) {
          this.dust.spawn(cp.x, cp.y + 0.2, cp.z, vel.x * 0.5 + (r() - 0.5) * 2, 1 + r(), vel.z * 0.5 + (r() - 0.5) * 2, 0.8, 0.4, 2.2, 0.82, 0.86, 0.9, 0.22, 1.5, 1);
        }
        // tyre marks
        if (!ghostMode) {
          const mark = surf.loose ? Math.min(1, 0.35 + slip * 0.35) : G.clamp((slip - 0.75) * 1.2, 0, 1);
          if (mark > 0.05 && speed > 1.5) {
            const rx = ph.right.x, rz = ph.right.z;
            const n = w.n;
            this.skids.add(i, cp.x + n.x * 0.03, cp.y + 0.03, cp.z + n.z * 0.03, rx, rz, 0.24, surf.skid, mark);
          } else this.skids.lift(i);
        }
      }
      // engine damage smoke
      const dmg = ph.damage.engine + ph.damage.radiator * 0.5;
      if (dmg > 0.45) {
        this.smokeAcc += (dmg - 0.4) * 18 * dt;
        while (this.smokeAcc >= 1) {
          this.smokeAcc -= 1;
          const p = this.tmp.set(0, 0.3, -ph.L * 0.4).applyQuaternion(ph.q).add(ph.pos);
          const k = dmg > 0.8 ? 0.25 : 0.6;
          this.dust.spawn(p.x, p.y, p.z, vel.x * 0.6, 1.2, vel.z * 0.6, 1.6, 0.4, 2.4, k, k, k, 0.35, 1.2, -0.3);
        }
      }
    }

    // exhaust backfire
    flame(model, ph) {
      const p = model.exhaustWorld(this.tmp);
      const r = this.r;
      const b = ph.fwd;
      for (let i = 0; i < 6; i++) {
        this.glow.spawn(p.x, p.y, p.z, ph.vel.x - b.x * (4 + r() * 3), ph.vel.y + r(), ph.vel.z - b.z * (4 + r() * 3), 0.09 + r() * 0.06, 0.35, 0.05, 1.0, 0.55 + r() * 0.3, 0.15, 0.9, 2, 0);
      }
    }
    sparks(pos, vel, n) {
      const r = this.r;
      for (let i = 0; i < n; i++) {
        this.glow.spawn(pos.x, pos.y, pos.z, vel.x * 0.4 + (r() - 0.5) * 8, r() * 5, vel.z * 0.4 + (r() - 0.5) * 8, 0.3 + r() * 0.4, 0.12, 0.04, 1, 0.8, 0.35, 1, 0.8, 9);
      }
    }
    burst(pos, n, color, size) {
      const r = this.r;
      const c = color || this.world.theme.dust;
      for (let i = 0; i < n; i++) {
        const a = r() * 6.28, s = 2 + r() * 4;
        this.dust.spawn(pos.x, pos.y + 0.2, pos.z, Math.cos(a) * s, 0.5 + r() * 2, Math.sin(a) * s, 2 + r() * 1.5, 1, size || 5, c[0], c[1], c[2], 0.32, 1.4, -0.1);
      }
    }

    update(dt) {
      this.dust.update(dt);
      this.glow.update(dt);
      this.skids.flush();
    }
    clear() {
      this.dust.clear();
      this.glow.clear();
      this.skids.clear();
    }
    dispose() {
      this.dust.dispose();
      this.glow.dispose();
      this.skids.dispose();
    }
  }

  G.FX = FX;
})();
