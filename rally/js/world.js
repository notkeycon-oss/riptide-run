// Go Fast Rally — the world: streamed terrain chunks, road ribbon, scenery, sky, weather.
(function () {
  const G = window.G;
  const CH = 128; // chunk size (m)
  const GS = 2; // terrain grid spacing (m)
  const NC = CH / GS;
  const LOD_STEP = [1, 2, 4];
  const SEC = 60; // road section length in points
  const COLCELL = 16;

  function ckey(cx, cz) {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  class World {
    constructor(o) {
      this.scene = o.scene;
      this.track = o.track;
      this.theme = o.track.theme;
      this.themeKey = o.track.themeKey;
      this.time = G.TIMES[o.time] || G.TIMES.noon;
      this.weather = G.WEATHER[o.weather] || G.WEATHER.clear;
      this.weatherKey = o.weather;
      this.q = o.quality;
      this.wet = !!this.weather.rain;
      this.night = !!this.time.night;
      this.root = new THREE.Group();
      this.scene.add(this.root);
      this.hc = new Map();
      this.dc = new Map();
      this.chunks = new Map();
      this.queue = [];
      this.sections = new Map();
      this.colGrid = new Map();
      this.tq = {};
      this.tp = {};
      this.blend = this.themeKey === 'canyon' ? 15 : 21;
      this._planT = 0;
      this.instDirty = true;
      this.peopleDirty = true;
      this.waterZones = [];
      this.focus = new THREE.Vector3();
      this.elapsed = 0;
      this.initMaterials();
      this.initLights();
      this.initSky();
      this.initInstancing();
      this.initWeather();
      if (this.theme.sea) this.initSea();
      const shoulder = { gravel: 'gravel', dirt: 'dirt', snow: 'snow', tarmac: 'dirt' };
      this.shoulderSurf = shoulder[this.track.surface] || 'gravel';
    }

    // ---------- setup ----------
    initMaterials() {
      const gk = this.theme.snowbanks ? 'snow' : this.themeKey === 'canyon' ? 'sand' : 'grass';
      this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: G.geo.groundTexture(gk) });
      const rk = this.track.surface === 'tarmac' ? 'tarmac' : this.track.surface === 'snow' ? 'snow' : 'gravel';
      const roadOpts = { vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, map: G.geo.roadTexture(rk) };
      this.roadMat = this.wet || this.track.surface === 'ice'
        ? new THREE.MeshPhongMaterial(Object.assign({ shininess: 70, specular: new THREE.Color(this.wet ? 0x3a3f46 : 0x222222) }, roadOpts))
        : new THREE.MeshLambertMaterial(roadOpts);
      this.propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    }

    initLights() {
      const T = this.time;
      const el = (T.sunEl * Math.PI) / 180, az = (T.sunAz * Math.PI) / 180;
      this.sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
      let skyC = new THREE.Color(T.hemiSky), gC = new THREE.Color(T.hemiGround);
      let hemiI = T.hemiI;
      let sunI = T.sunI;
      if (this.weatherKey === 'fog' || this.weatherKey === 'rain' || this.weatherKey === 'snow') {
        sunI *= 0.45;
        hemiI *= 1.25;
      }
      this.hemi = new THREE.HemisphereLight(skyC, gC, hemiI);
      this.root.add(this.hemi);
      this.sun = new THREE.DirectionalLight(new THREE.Color(T.sun), sunI);
      this.sun.position.copy(this.sunDir).multiplyScalar(150);
      this.root.add(this.sun);
      this.root.add(this.sun.target);
      if (this.q.shadows) {
        this.sun.castShadow = true;
        const s = this.sun.shadow;
        s.mapSize.set(this.q.shadowSize, this.q.shadowSize);
        s.camera.left = -42; s.camera.right = 42; s.camera.top = 42; s.camera.bottom = -42;
        s.camera.near = 10; s.camera.far = 320;
        s.bias = -0.0006;
        s.normalBias = 0.03;
      }
      if (this.night) {
        this.ambient = new THREE.AmbientLight(0x3a4a70, 0.22);
        this.root.add(this.ambient);
      }
    }

    initSky() {
      const T = this.time, Wt = this.weather;
      let top = new THREE.Color(T.skyTop), hor = new THREE.Color(T.skyHor);
      if (this.weatherKey !== 'clear') {
        const grey = new THREE.Color(this.night ? 0x1a2130 : 0xaeb7bf);
        top.lerp(grey, this.weatherKey === 'fog' ? 0.85 : 0.65);
        hor.lerp(grey, this.weatherKey === 'fog' ? 0.9 : 0.7);
      }
      this.horizon = hor.clone();
      const bot = hor.clone().multiplyScalar(0.8);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          top: { value: top }, hor: { value: hor }, bot: { value: bot },
          sunDir: { value: this.sunDir.clone() }, sunCol: { value: new THREE.Color(T.sun) },
          sunAmt: { value: this.weatherKey === 'clear' ? (this.night ? 0.4 : 1.0) : 0.15 },
          cloudAmt: { value: this.weatherKey === 'clear' ? 0.85 : 0.5 },
          cloudCol: { value: this.night ? new THREE.Color(0x2a3550) : T.name === 'Sunset' ? new THREE.Color(0xffd2b8) : new THREE.Color(0xffffff) },
          time: { value: 0 },
        },
        vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
        fragmentShader:
          'uniform vec3 top,hor,bot,sunCol,sunDir,cloudCol; uniform float sunAmt,cloudAmt,time; varying vec3 vD;' +
          'float hsh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}' +
          'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x),mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x),f.y);}' +
          'float fbm(vec2 p){float s=0.0,a=0.5;for(int k=0;k<5;k++){s+=a*vn(p);p*=2.03;a*=0.5;}return s;}' +
          'void main(){ vec3 d=normalize(vD); float h=d.y; vec3 c=mix(hor,top,smoothstep(0.0,0.5,h)); c=mix(c,bot,smoothstep(0.0,-0.25,h));' +
          'float sd=max(dot(d,sunDir),0.0); c+=sunCol*(pow(sd,900.0)*3.0+pow(sd,12.0)*0.22+pow(sd,3.0)*0.06)*sunAmt;' +
          'if(h>0.0){ vec2 uv=d.xz/(h+0.12)*1.6+vec2(time*0.004,time*0.0015); float n=fbm(uv); float cl=smoothstep(0.5,0.78,n)*cloudAmt*smoothstep(0.0,0.18,h);' +
          ' vec3 cc=mix(cloudCol*0.82,cloudCol,smoothstep(0.5,0.9,n))+sunCol*pow(sd,6.0)*0.25*cloudAmt; c=mix(c,cc,cl); }' +
          'gl_FragColor=vec4(c,1.0);}',
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      });
      this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), mat);
      this.sky.frustumCulled = false;
      this.sky.renderOrder = -10;
      this.root.add(this.sky);
      if (this.night) {
        const n = 1400, p = new Float32Array(n * 3);
        const r = G.rng(99);
        for (let i = 0; i < n; i++) {
          const u = r() * 2 - 1, th = r() * Math.PI * 2, y = Math.abs(u);
          const s = Math.sqrt(1 - y * y);
          p[i * 3] = Math.cos(th) * s * 450;
          p[i * 3 + 1] = y * 450 + 10;
          p[i * 3 + 2] = Math.sin(th) * s * 450;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(p, 3));
        this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: this.weatherKey === 'clear' ? 0.9 : 0.15, depthWrite: false }));
        this.stars.frustumCulled = false;
        this.stars.renderOrder = -9;
        this.root.add(this.stars);
      }
      const fogFar = (Math.min(this.q.view, 1100) * (this.theme.fogMul > 1 ? 1 : this.theme.fogMul)) / Wt.fog;
      this.fogFar = Math.max(140, fogFar);
      const near = this.weatherKey === 'fog' ? 6 : this.fogFar * 0.18;
      this.scene.fog = new THREE.Fog(hor.clone(), near, this.fogFar);
      this.scene.background = hor.clone();
      this.viewDist = Math.min(this.q.view, this.fogFar * 1.05);
    }

    initInstancing() {
      const T = this.theme;
      this.treeTypes = Object.keys(T.trees).concat(['rock', 'bush']);
      this.inst = {};
      for (const t of this.treeTypes) {
        const g = G.geo.tree(t, T);
        const cap = t === 'rock' || t === 'bush' ? 2500 : 7000;
        const m = new THREE.InstancedMesh(g, this.propMat, cap);
        m.count = 0;
        m.frustumCulled = false;
        m.castShadow = !!(this.q.shadows && this.q.treeShadows && t !== 'bush');
        m.receiveShadow = false;
        this.root.add(m);
        this.inst[t] = m;
      }
      // grass tufts along the road edges
      if (!this.theme.snowbanks) {
        const gm = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
        this.grassMesh = new THREE.InstancedMesh(G.geo.grassTuft(), gm, 9000);
        this.grassMesh.count = 0;
        this.grassMesh.frustumCulled = false;
        this.root.add(this.grassMesh);
        this.grassCol = new THREE.Color(this.themeKey === 'canyon' ? '#b39a5c' : this.themeKey === 'coast' ? '#7f9c46' : '#5e8f38');
      }
      const P = G.geo.person();
      this.peopleBody = new THREE.InstancedMesh(P.body, this.propMat, 900);
      this.peopleRest = new THREE.InstancedMesh(P.rest, this.propMat, 900);
      for (const m of [this.peopleBody, this.peopleRest]) {
        m.count = 0;
        m.frustumCulled = false;
        this.root.add(m);
      }
      this.people = [];
    }

    initWeather() {
      const Wt = this.weather;
      if (Wt.rain) {
        const n = 1400;
        const p = new Float32Array(n * 6);
        const r = G.rng(5);
        this.rainSeeds = [];
        for (let i = 0; i < n; i++) this.rainSeeds.push(r() * 60 - 30, r() * 26, r() * 60 - 30);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(p, 3));
        this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xb8c4d4, transparent: true, opacity: 0.42, depthWrite: false }));
        this.rain.frustumCulled = false;
        this.root.add(this.rain);
      }
      if (Wt.snow) {
        const n = 1800;
        const p = new Float32Array(n * 3);
        const r = G.rng(6);
        this.snowSeeds = [];
        for (let i = 0; i < n; i++) this.snowSeeds.push(r() * 60 - 30, r() * 24, r() * 60 - 30, r() * 6.28);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(p, 3));
        this.snowP = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.13, transparent: true, opacity: 0.9, depthWrite: false }));
        this.snowP.frustumCulled = false;
        this.root.add(this.snowP);
      }
    }

    initSea() {
      const g = new THREE.PlaneGeometry(5000, 5000, 1, 1);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.MeshPhongMaterial({ color: this.night ? 0x0b2234 : 0x2a6f93, shininess: 90, specular: 0x7fb3c8 });
      this.sea = new THREE.Mesh(g, m);
      this.sea.position.y = 0;
      this.root.add(this.sea);
    }

    // ---------- terrain height ----------
    _sec(d, cy, bank, hw, nat) {
      const ad = Math.abs(d), edge = hw * 1.24;
      if (ad <= edge) {
        this._infl = 1;
        this._road = true;
        return G.Track.crossY(cy, bank, hw, d) - 0.09;
      }
      this._road = false;
      const yEdge = G.Track.crossY(cy, bank, hw, d > 0 ? edge : -edge);
      const w = G.smoothstep(0, this.blend, ad - edge);
      let h = yEdge + (nat - yEdge) * w;
      if (this.theme.snowbanks) {
        const u = (ad - edge - 1.2) / 1.35;
        if (u > -1 && u < 1) h += 0.95 * (1 - u * u);
      }
      this._infl = 1 - w;
      return h;
    }

    // nearest road using a prepared list of candidate point indices (fast path for chunk builds).
    // Same result as track.nearest(...) for anything within R.
    _nearestList(x, z, list, R, out) {
      const tr = this.track;
      let best = -1, bd = R * R;
      for (let q = 0; q < list.length; q++) {
        const i = list[q];
        const dx = tr.px[i] - x, dz = tr.pz[i] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; best = i; }
      }
      if (best < 0) { out.i = -1; return out; }
      tr._project(x, z, best, out);
      out.i2 = -1;
      let b2 = -1, bd2 = R * R;
      for (let q = 0; q < list.length; q++) {
        const i = list[q];
        if (Math.abs(i - best) < 30) continue;
        const dx = tr.px[i] - x, dz = tr.pz[i] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bd2) { bd2 = d2; b2 = i; }
      }
      if (b2 >= 0) {
        const o2 = this._o2 || (this._o2 = {});
        tr._project(x, z, b2, o2);
        out.i2 = b2;
        out.d2 = o2.d;
        out.y2 = o2.cy;
        out.hw2 = o2.hw;
        out.bank2 = o2.bank;
      }
      return out;
    }

    // road points that could influence terrain inside a chunk (+ margin)
    _chunkList(cx, cz, margin) {
      const tr = this.track;
      const x0 = cx * CH - margin, x1 = (cx + 1) * CH + margin, z0 = cz * CH - margin, z1 = (cz + 1) * CH + margin;
      const out = [];
      const n = tr.n - 1;
      for (let gx = Math.floor(x0 / 16); gx <= Math.floor(x1 / 16); gx++)
        for (let gz = Math.floor(z0 / 16); gz <= Math.floor(z1 / 16); gz++) {
          const cell = tr.grid.get((gx + 32768) * 65536 + (gz + 32768));
          if (!cell) continue;
          for (let q = 0; q < cell.length; q++) if (cell[q] < n) out.push(cell[q]);
        }
      return out;
    }

    terrainH(x, z, list) {
      const tr = this.track;
      const nat = tr.natural(x, z);
      const q = list ? this._nearestList(x, z, list, 30, this.tq) : tr.nearest(x, z, 30, this.tq, true);
      if (q.i < 0) {
        this._lastD = 999;
        return nat;
      }
      this._lastD = q.dist;
      const hA = this._sec(q.d, q.cy, q.bank, q.hw, nat);
      if (this._road) return hA;
      const iA = this._infl;
      if (q.i2 >= 0) {
        const hB = this._sec(q.d2, q.y2, q.bank2, q.hw2, nat);
        if (this._road) {
          this._lastD = Math.abs(q.d2);
          return hB;
        }
        const iB = this._infl;
        const wa = iA * iA * iA * iA + 1e-6, wb = iB * iB * iB * iB;
        return (hA * wa + hB * wb) / (wa + wb);
      }
      return hA;
    }

    vh(ix, iz, list) {
      const k = (ix + 60000) * 120000 + (iz + 60000);
      let h = this.hc.get(k);
      if (h === undefined) {
        h = this.terrainH(ix * GS, iz * GS, list);
        if (this.hc.size > 450000) {
          this.hc.clear();
          this.dc.clear();
        }
        this.hc.set(k, h);
        this.dc.set(k, this._lastD);
      } else this._lastD = this.dc.get(k);
      return h;
    }

    // terrain triangle (matches the mesh exactly)
    terrainTri(x, z, out) {
      const gx = x / GS, gz = z / GS;
      const ix = Math.floor(gx), iz = Math.floor(gz);
      const fx = gx - ix, fz = gz - iz;
      const h00 = this.vh(ix, iz), h11 = this.vh(ix + 1, iz + 1);
      let y, dhx, dhz;
      if (fz > fx) {
        const h01 = this.vh(ix, iz + 1);
        dhx = h11 - h01;
        dhz = h01 - h00;
      } else {
        const h10 = this.vh(ix + 1, iz);
        dhx = h10 - h00;
        dhz = h11 - h10;
      }
      y = h00 + dhx * fx + dhz * fz;
      // normal of plane y = a x + b z: (-a, 1, -b)
      const nx = -dhx / GS, nz = -dhz / GS;
      const l = Math.sqrt(nx * nx + 1 + nz * nz);
      out.y = y;
      out.nx = nx / l;
      out.ny = 1 / l;
      out.nz = nz / l;
      return out;
    }

    // Physics ground query.
    groundAt(x, z, out) {
      const tr = this.track;
      const q = tr.nearest(x, z, 17, this.tp, false);
      if (q.i >= 0 && q.dist <= q.hw * 1.24) {
        const d = q.d, ad = q.dist, hw = q.hw;
        out.y = G.Track.crossY(q.cy, q.bank, hw, d);
        const grade = (tr.y[q.i + 1] - tr.y[q.i]) / tr.DS;
        const sg = d >= 0 ? 1 : -1;
        let lat = -0.012 * sg;
        if (ad <= hw) lat -= q.bank;
        else lat -= (0.16 / (hw * 0.24)) * sg;
        const gx = q.dx * grade + -q.dz * lat;
        const gz = q.dz * grade + q.dx * lat;
        const l = Math.sqrt(gx * gx + 1 + gz * gz);
        out.nx = -gx / l;
        out.ny = 1 / l;
        out.nz = -gz / l;
        if (ad <= hw) {
          out.surf = q.ice > 0.5 ? 'ice' : tr.surface;
          out.road = 1;
        } else {
          out.surf = this.shoulderSurf;
          out.road = 0.5;
        }
        out.d = d;
      } else {
        this.terrainTri(x, z, out);
        out.surf = this.theme.off;
        if (out.ny < 0.8 && !this.theme.snowbanks) out.surf = 'rock';
        out.road = 0;
        out.d = q.i >= 0 ? q.d : 999;
      }
      out.water = !!(this.theme.sea && out.y < 0.2);
      return out;
    }

    // water surface height at x,z, or null when not over a splash pool
    waterAt(x, z) {
      for (const w of this.waterZones) {
        const dx = x - w.x, dz = z - w.z;
        const along = dx * Math.cos(w.h) + dz * Math.sin(w.h);
        const across = -dx * Math.sin(w.h) + dz * Math.cos(w.h);
        if (Math.abs(along) < w.halfL && Math.abs(across) < w.halfW) return w.y;
      }
      return null;
    }

    heightAt(x, z) {
      return this.groundAt(x, z, this._hq || (this._hq = {})).y;
    }

    // ---------- streaming ----------
    update(dt, fx, fz, camera, carPos) {
      this.elapsed += dt;
      this.focus.set(fx, 0, fz);
      this._planT -= dt;
      if (this._planT <= 0) {
        this._planT = 0.3;
        this._plan(fx, fz);
      }
      this.buildSome(3.2);
      if (this._instFocus && Math.hypot(this._instFocus.x - fx, this._instFocus.z - fz) > 70) this.instDirty = true;
      if (this.instDirty) this._rebuildInstances(fx, fz);
      if (this.peopleDirty) this._rebuildPeople();
      if (this.grassDirty) this._rebuildGrass();
      this._animatePeople(dt, carPos || this.focus);
      this._weather(dt, camera);
      this.sky.position.copy(camera.position);
      this.sky.material.uniforms.time.value = this.elapsed;
      if (this.stars) this.stars.position.copy(camera.position);
      if (this.sea) this.sea.position.set(camera.position.x, 0, camera.position.z);
      const c = carPos || this.focus;
      this.sun.target.position.set(c.x, c.y || 0, c.z);
      this.sun.position.set(c.x + this.sunDir.x * 150, (c.y || 0) + this.sunDir.y * 150, c.z + this.sunDir.z * 150);
    }

    // Build everything needed around a point right now (loading screen).
    prime(fx, fz, onProgress) {
      this._plan(fx, fz);
      const total = this.queue.length + this.secQueue.length;
      return new Promise((resolve) => {
        const step = () => {
          this.buildSome(28);
          const left = this.queue.length + this.secQueue.length + (this.job ? 1 : 0);
          if (onProgress) onProgress(1 - left / Math.max(1, total));
          if (left > 0) requestAnimationFrame(step);
          else {
            this._rebuildInstances(fx, fz);
            this._rebuildPeople();
            this._rebuildGrass();
            resolve();
          }
        };
        step();
      });
    }

    _plan(fx, fz) {
      const R = this.viewDist;
      const cr = Math.ceil(R / CH) + 1;
      const ccx = Math.floor(fx / CH), ccz = Math.floor(fz / CH);
      const want = new Map();
      const jobs = [];
      for (let a = -cr; a <= cr; a++)
        for (let b = -cr; b <= cr; b++) {
          const cx = ccx + a, cz = ccz + b;
          const x0 = cx * CH, z0 = cz * CH;
          const dx = Math.max(x0 - fx, 0, fx - (x0 + CH));
          const dz = Math.max(z0 - fz, 0, fz - (z0 + CH));
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > R) continue;
          let lod = d < this.q.hi ? 0 : d < this.q.mid ? 1 : 2;
          const k = ckey(cx, cz);
          const c = this.chunks.get(k);
          // hysteresis: keep a finer lod a little longer
          if (c && c.lod < lod && d < (lod === 1 ? this.q.hi : this.q.mid) + 30) lod = c.lod;
          want.set(k, lod);
          if (!c || c.lod !== lod) jobs.push({ k, cx, cz, lod, d });
        }
      for (const [k, c] of this.chunks) if (!want.has(k)) this._disposeChunk(k, c);
      if (this.job && !want.has(this.job.k)) this.job = null;
      jobs.sort((p, q) => p.lod - q.lod || p.d - q.d);
      this.queue = jobs;
      // road sections
      const tr = this.track;
      const nSec = Math.floor((tr.n - 3) / SEC);
      const sq = [];
      const tmp = {};
      for (let k = 0; k < nSec; k++) {
        const mid = Math.min(tr.n - 2, k * SEC + SEC / 2);
        const dx = tr.px[mid] - fx, dz = tr.pz[mid] - fz;
        const d = Math.sqrt(dx * dx + dz * dz);
        const ok = d < this.viewDist * 0.95 + 80;
        const have = this.sections.has(k);
        if (ok && !have) sq.push({ k, d });
        else if (!ok && have && d > this.viewDist + 200) this._disposeSection(k);
      }
      sq.sort((a, b) => a.d - b.d);
      this.secQueue = sq;
    }

    buildSome(budgetMs) {
      const t0 = performance.now();
      const deadline = t0 + budgetMs;
      while (true) {
        if (this.job) {
          if (!this._runJob(this.job, deadline)) return; // out of time, resume next frame
          this.job = null;
        } else if (this.secQueue && this.secQueue.length) {
          const j = this.secQueue.shift();
          if (!this.sections.has(j.k)) this._buildSection(j.k);
        } else if (this.queue.length) {
          const j = this.queue.shift();
          const c = this.chunks.get(j.k);
          if (c && c.lod === j.lod) continue;
          this.job = j;
          continue;
        } else return;
        if (performance.now() > deadline) return;
      }
    }

    _triColor(xc, zc, yc, ny, dist, out) {
      const C = this.colorsC;
      const N = this.track.noise;
      const n1 = N.n2(xc / 46, zc / 46);
      out.copy(C.ground).lerp(C.ground2, n1 * 0.5 + 0.5);
      const dry = N.n2(xc / 170 + 3, zc / 170 - 7);
      if (dry > 0.25) out.lerp(C.dry, G.smoothstep(0.25, 0.7, dry) * 0.7);
      if (this.theme.snowbanks) {
        out.copy(C.ground).lerp(C.ground2, n1 * 0.5 + 0.5);
      } else if (yc > 85 && this.themeKey !== 'canyon') {
        out.lerp(C.snowc, G.smoothstep(85, 110, yc));
      }
      if (dist < 9 && !this.theme.snowbanks) out.lerp(C.dirt, (1 - G.smoothstep(4.5, 9, dist)) * 0.75);
      if (ny < 0.83) out.lerp(C.rock, G.smoothstep(0.83, 0.68, ny));
      if (this.theme.sea && yc < 2.5) out.copy(C.sand);
      const j = 0.94 + 0.12 * G.hash2(Math.floor(xc * 3), Math.floor(zc * 3), 7);
      out.multiplyScalar(j);
      return out;
    }

    _ensureColors() {
      if (this.colorsC) return;
      const C = this.theme.colors;
      const wetMul = this.wet ? 0.82 : 1;
      const mk = (h) => new THREE.Color(h).multiplyScalar(wetMul);
      this.colorsC = {
        ground: mk(C.ground), ground2: mk(C.ground2), dry: mk(C.dry), rock: mk(C.rock), dirt: mk(C.dirt),
        snowc: new THREE.Color('#f2f5f8'), sand: mk('#d6c38e'),
      };
    }

    // Terrain chunks are built in small slices across frames so streaming never stalls a frame.
    _runJob(job, deadline) {
      this._ensureColors();
      if (!job.phase) {
        job.step = LOD_STEP[job.lod];
        job.N = NC / job.step;
        job.W1 = job.N + 1;
        job.H = new Float32Array(job.W1 * job.W1);
        job.D = new Float32Array(job.W1 * job.W1);
        job.list = this._chunkList(job.cx, job.cz, 32);
        job.row = 0;
        job.phase = 1;
      }
      const N = job.N, W1 = job.W1, step = job.step, H = job.H, D = job.D;
      const ix0 = job.cx * NC, iz0 = job.cz * NC;
      if (job.phase === 1) {
        while (job.row <= N) {
          const j = job.row;
          for (let i = 0; i <= N; i++) {
            H[j * W1 + i] = this.vh(ix0 + i * step, iz0 + j * step, job.list);
            D[j * W1 + i] = this._lastD;
          }
          job.row++;
          if (performance.now() > deadline) return false;
        }
        const tris = N * N * 2 + N * 8;
        job.pos = new Float32Array(tris * 9);
        job.col = new Float32Array(tris * 9);
        job.nrm = new Float32Array(tris * 9);
        job.uv = new Float32Array(tris * 6);
        job.o = 0;
        job.trow = 0;
        job.phase = 2;
      }
      const cs = GS * step;
      const x0 = ix0 * GS, z0 = iz0 * GS;
      const pos = job.pos, col = job.col, nrm = job.nrm, uvA = job.uv;
      const c = this._tc || (this._tc = new THREE.Color());
      const put = (ax, ay, az, bx, by, bz, cx2, cy2, cz2, dist) => {
        const o = job.o;
        pos[o] = ax; pos[o + 1] = ay; pos[o + 2] = az;
        pos[o + 3] = bx; pos[o + 4] = by; pos[o + 5] = bz;
        pos[o + 6] = cx2; pos[o + 7] = cy2; pos[o + 8] = cz2;
        const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx2 - ax, vy = cy2 - ay, vz = cz2 - az;
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= l; ny /= l; nz /= l;
        this._triColor((ax + bx + cx2) / 3, (az + bz + cz2) / 3, (ay + by + cy2) / 3, Math.abs(ny), dist, c);
        for (let k = 0; k < 3; k++) {
          col[o + k * 3] = c.r; col[o + k * 3 + 1] = c.g; col[o + k * 3 + 2] = c.b;
          nrm[o + k * 3] = nx; nrm[o + k * 3 + 1] = ny; nrm[o + k * 3 + 2] = nz;
          uvA[(o / 3 + k) * 2] = pos[o + k * 3] / 5;
          uvA[(o / 3 + k) * 2 + 1] = pos[o + k * 3 + 2] / 5;
        }
        job.o += 9;
      };
      if (job.phase === 2) {
        while (job.trow < N) {
          const j = job.trow;
          for (let i = 0; i < N; i++) {
            const xa = x0 + i * cs, xb = xa + cs, za = z0 + j * cs, zb = za + cs;
            const h00 = H[j * W1 + i], h10 = H[j * W1 + i + 1], h01 = H[(j + 1) * W1 + i], h11 = H[(j + 1) * W1 + i + 1];
            const d = Math.min(D[j * W1 + i], D[(j + 1) * W1 + i + 1]);
            put(xa, h00, za, xa, h01, zb, xb, h11, zb, Math.min(d, D[(j + 1) * W1 + i]));
            put(xa, h00, za, xb, h11, zb, xb, h10, za, Math.min(d, D[j * W1 + i + 1]));
          }
          job.trow++;
          if (performance.now() > deadline) return false;
        }
        // skirts hide cracks between detail levels
        const sk = 5;
        for (let i = 0; i < N; i++) {
          const xa = x0 + i * cs, xb = xa + cs;
          let ha = H[i], hb = H[i + 1];
          put(xa, ha, z0, xb, hb, z0, xb, hb - sk, z0, 99);
          put(xa, ha, z0, xb, hb - sk, z0, xa, ha - sk, z0, 99);
          const zN = z0 + N * cs;
          ha = H[N * W1 + i]; hb = H[N * W1 + i + 1];
          put(xa, ha, zN, xb, hb - sk, zN, xb, hb, zN, 99);
          put(xa, ha, zN, xa, ha - sk, zN, xb, hb - sk, zN, 99);
          const za = z0 + i * cs, zb = za + cs;
          ha = H[i * W1]; hb = H[(i + 1) * W1];
          put(x0, ha, za, x0, hb - sk, zb, x0, hb, zb, 99);
          put(x0, ha, za, x0, ha - sk, za, x0, hb - sk, zb, 99);
          const xN = x0 + N * cs;
          ha = H[i * W1 + N]; hb = H[(i + 1) * W1 + N];
          put(xN, ha, za, xN, hb, zb, xN, hb - sk, zb, 99);
          put(xN, ha, za, xN, hb - sk, zb, xN, ha - sk, za, 99);
        }
        job.phase = 3;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.terrainMat);
      mesh.receiveShadow = !!(this.q.shadows && job.lod === 0);
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
      let ch = this.chunks.get(job.k);
      if (ch) {
        this.root.remove(ch.mesh);
        ch.mesh.geometry.dispose();
        ch.mesh = mesh;
        ch.lod = job.lod;
      } else {
        ch = { cx: job.cx, cz: job.cz, lod: job.lod, mesh, scatter: null, cols: [] };
        this.chunks.set(job.k, ch);
        this._scatter(ch, job.list);
        this.instDirty = true;
      }
      return true;
    }

    _disposeChunk(k, c) {
      this.root.remove(c.mesh);
      c.mesh.geometry.dispose();
      this._removeCols(c.cols);
      this.chunks.delete(k);
      this.instDirty = true;
    }

    _scatter(ch, list) {
      const T = this.theme, tr = this.track;
      const r = G.rng((G.hash2(ch.cx, ch.cz, tr.seed) * 4294967296) >>> 0);
      const out = {};
      for (const t of this.treeTypes) out[t] = [];
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      const sp = 6.5;
      const n = Math.floor(CH / sp);
      const dens = T.treeDensity * this.q.treeDensity;
      const nq = {};
      const gq = {};
      const treeKeys = Object.keys(T.trees);
      const x0 = ch.cx * CH, z0 = ch.cz * CH;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = x0 + (i + r()) * sp, z = z0 + (j + r()) * sp;
          const roll = r();
          const nr = list ? this._nearestList(x, z, list, 32, nq) : tr.nearest(x, z, 32, nq, false);
          const d = nr.i >= 0 ? nr.dist : 999;
          const hw = nr.i >= 0 ? nr.hw : 3.3;
          if (d < hw * 1.24 + 2.6) continue;
          // keep the inside of the start area and spectator spots clear
          if (nr.i >= 0 && Math.abs(nr.s - tr.START) < 30 && d < 14) continue;
          const mask = G.smoothstep(-0.35, 0.35, tr.noise.n2(x / 190 + 11, z / 190 - 4));
          const roadside = d < 32 ? 1 : 0.6;
          const pTree = dens * (0.2 + 0.8 * mask) * roadside * 0.5;
          let type = null, sc = 1, colR = 0, colH = 0;
          if (roll < pTree) {
            type = r.weighted(T.trees);
            sc = r.range(0.75, 1.35);
            colR = type === 'cactus' ? 0.4 : type === 'juniper' ? 0.5 : 0.32 * sc;
            colH = 8;
          } else if (roll < pTree + T.rocks * 0.07) {
            type = 'rock';
            sc = r.range(0.5, 2.0) * (d < 15 ? 0.7 : 1);
            colR = sc * 1.05;
            colH = sc * 0.9;
          } else if (roll < pTree + T.rocks * 0.07 + T.bushes * 0.12) {
            type = 'bush';
            sc = r.range(0.6, 1.4);
          } else continue;
          this.terrainTri(x, z, gq);
          if (this.theme.sea && gq.y < 1.2) continue;
          if (type !== 'rock' && gq.ny < 0.78) continue;
          const y = gq.y - (type === 'rock' ? 0.2 * sc : 0.05);
          q.setFromAxisAngle(up, r() * Math.PI * 2);
          if (type === 'rock') {
            const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5));
            q.multiply(tilt);
          }
          s.set(sc, sc * (type === 'rock' ? r.range(0.7, 1.2) : r.range(0.9, 1.15)), sc);
          v.set(x, y, z);
          m.compose(v, q, s);
          out[type].push(...m.elements);
          if (colR > 0 && d < 45) {
            const c = { x, z, r: colR, h: colH, y0: gq.y, kind: type === 'rock' ? 'rock' : 'tree' };
            ch.cols.push(c);
            this._addCol(c);
          }
        }
      for (const t of this.treeTypes) out[t] = new Float32Array(out[t]);
      ch.scatter = out;
      void treeKeys;
    }

    _rebuildInstances(fx, fz) {
      this.instDirty = false;
      const lim = this.q.treeDist;
      const lim2 = (lim + CH) * (lim + CH);
      const counts = {};
      for (const t of this.treeTypes) counts[t] = 0;
      const list = [];
      for (const c of this.chunks.values()) {
        const dx = (c.cx + 0.5) * CH - fx, dz = (c.cz + 0.5) * CH - fz;
        const d2 = dx * dx + dz * dz;
        if (d2 > lim2) continue;
        list.push([d2, c]);
      }
      list.sort((a, b) => a[0] - b[0]);
      for (const [, c] of list) {
        for (const t of this.treeTypes) {
          const arr = c.scatter[t];
          const m = this.inst[t];
          const cap = m.instanceMatrix.count;
          const k = arr.length / 16;
          const room = Math.min(k, cap - counts[t]);
          if (room <= 0) continue;
          m.instanceMatrix.array.set(room === k ? arr : arr.subarray(0, room * 16), counts[t] * 16);
          counts[t] += room;
        }
      }
      for (const t of this.treeTypes) {
        const m = this.inst[t];
        m.count = counts[t];
        m.instanceMatrix.needsUpdate = true;
      }
      this._instFocus = { x: fx, z: fz };
    }

    // ---------- road sections ----------
    _buildSection(k) {
      const tr = this.track, T = this.theme, C = T.colors;
      const i0 = k * SEC, i1 = Math.min(i0 + SEC, tr.n - 2);
      const tarmac = tr.surface === 'tarmac';
      let L, cols;
      const wetMul = this.wet ? 0.7 : 1;
      const cc = (h) => new THREE.Color(h).multiplyScalar(wetMul);
      const sh = cc(C.shoulder), rd = cc(C.road), dk = cc(C.roadDark), lt = cc(C.roadLight), wh = new THREE.Color(0xe8e8e2).multiplyScalar(this.wet ? 0.85 : 1);
      if (tarmac) {
        L = [-1.24, -1.0, -0.955, -0.95, -0.915, -0.91, -0.32, 0, 0.32, 0.91, 0.915, 0.95, 0.955, 1.0, 1.24];
        cols = [sh, rd, rd, wh, wh, rd, dk, lt, dk, rd, wh, wh, rd, rd, sh];
      } else {
        L = [-1.24, -1.0, -0.82, -0.5, -0.3, -0.12, 0, 0.12, 0.3, 0.5, 0.82, 1.0, 1.24];
        cols = [sh, lt, rd, dk, dk, rd, lt, rd, dk, dk, rd, lt, sh];
      }
      const nl = L.length;
      const rows = i1 - i0 + 1;
      const pos = new Float32Array(rows * nl * 3);
      const uvR = new Float32Array(rows * nl * 2);
      const col = new Float32Array(rows * nl * 3);
      const c = new THREE.Color();
      const ice = new THREE.Color(0xbfd9ea);
      for (let r = 0; r < rows; r++) {
        const i = i0 + r;
        const h = tr.hd[i];
        const rx = -Math.sin(h), rz = Math.cos(h);
        const hw = tr.hw[i];
        const nv = 0.93 + 0.1 * tr.noise.n2(i * 0.07, 3.3);
        for (let j = 0; j < nl; j++) {
          const d = L[j] * hw;
          const o = (r * nl + j) * 3;
          pos[o] = tr.px[i] + rx * d;
          pos[o + 1] = G.Track.crossY(tr.y[i], tr.bank[i], hw, d) + 0.015;
          pos[o + 2] = tr.pz[i] + rz * d;
          c.copy(cols[j]).multiplyScalar(nv);
          if (tr.ice[i] > 0.5 && Math.abs(L[j]) < 1) c.lerp(ice, 0.6);
          col[o] = c.r;
          col[o + 1] = c.g;
          col[o + 2] = c.b;
          uvR[(r * nl + j) * 2] = (L[j] + 1.24) / 2.48;
          uvR[(r * nl + j) * 2 + 1] = (i * tr.DS) / 9;
        }
      }
      const idx = [];
      for (let r = 0; r < rows - 1; r++)
        for (let j = 0; j < nl - 1; j++) {
          const a = r * nl + j, b = r * nl + j + 1, cI = (r + 1) * nl + j, d = (r + 1) * nl + j + 1;
          idx.push(a, b, cI, b, d, cI);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uvR, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.roadMat);
      mesh.receiveShadow = !!this.q.shadows;
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
      const sec = { mesh, props: null, extra: [], cols: [], people: [] };
      this._buildProps(sec, i0, i1);
      this.sections.set(k, sec);
    }

    _buildProps(sec, i0, i1) {
      const tr = this.track, T = this.theme;
      const parts = [];
      const glow = [];
      const s0 = i0 * tr.DS, s1 = i1 * tr.DS;
      const P = {};
      const at = (s, d) => {
        tr.pointAt(s, P);
        const rx = -Math.sin(P.h), rz = Math.cos(P.h);
        const x = P.x + rx * d, z = P.z + rz * d;
        return { x, z, y: this.heightAt(x, z), h: P.h, hw: P.hw };
      };
      const yawOf = (h) => -h + Math.PI / 2; // object facing along road direction (local -Z toward +dir? see below)
      // marker posts
      for (let i = i0; i < i1; i++) {
        if (i % 20 !== 0) continue;
        for (const side of [-1, 1]) {
          const p = at(i * tr.DS, side * (tr.hw[i] * 1.24 + 0.55));
          const ry = yawOf(p.h);
          parts.push({ g: new THREE.BoxGeometry(0.12, 1.0, 0.12), c: '#f2f2f2', m: G.geo.mat(p.x, p.y + 0.5, p.z, 0, ry, 0) });
          parts.push({ g: new THREE.BoxGeometry(0.13, 0.2, 0.13), c: '#1a1a1a', m: G.geo.mat(p.x, p.y + 0.85, p.z, 0, ry, 0) });
          glow.push({ g: new THREE.BoxGeometry(0.08, 0.14, 0.14), c: side > 0 ? '#ff3b2e' : '#ffffff', m: G.geo.mat(p.x, p.y + 0.66, p.z, 0, ry, 0) });
        }
      }
      // chevrons on the outside of slow corners
      for (const sg of tr.segs) {
        if (sg.kind !== 'turn' || sg.s1 < s0 || sg.s0 > s1) continue;
        if (!(sg.sev === 'hp' || sg.sev === '1' || sg.sev === '2')) continue;
        const apex = (sg.s0 + sg.s1) / 2;
        if (apex < s0 || apex >= s1) continue;
        const out = -sg.dir;
        for (let b = -1; b <= 1; b++) {
          const s = apex + b * 7;
          const p = at(s, out * (tr.hw[Math.floor(s / tr.DS)] * 1.24 + 1.4));
          const ry = yawOf(p.h);
          // local +Z points along the road, local +X points to the driver's left
          const m = G.geo.mat(p.x, p.y + 0.9, p.z, 0, ry, 0);
          parts.push({ g: new THREE.BoxGeometry(1.3, 0.7, 0.08), c: '#ffd21e', m });
          const pd = -sg.dir;
          for (let k = -1; k <= 1; k += 2) {
            const mm = m.clone().multiply(G.geo.mat(0, k * 0.12, -0.06, 0, 0, -k * 0.6 * pd));
            parts.push({ g: new THREE.BoxGeometry(0.5, 0.12, 0.04), c: '#111111', m: mm });
          }
          parts.push({ g: new THREE.BoxGeometry(0.1, 0.9, 0.1), c: '#555555', m: G.geo.mat(p.x, p.y + 0.3, p.z, 0, ry, 0) });
        }
      }
      // "don't cut" rocks
      for (const hz of tr.hazards) {
        if (hz.s < s0 || hz.s >= s1) continue;
        const i = Math.floor(hz.s / tr.DS);
        const d = hz.side * (tr.hw[i] + hz.d);
        const p = at(hz.s, d);
        const rg = G.geo.jitter(new THREE.DodecahedronGeometry(hz.r, 0), 0.4, Math.floor(hz.s));
        parts.push({ g: rg, c: T.colors.rock, m: G.geo.mat(p.x, p.y + hz.r * 0.35, p.z, 0.3, hz.s, 0.2, 1, 0.75, 1) });
        const cc = { x: p.x, z: p.z, r: hz.r * 0.95, h: hz.r * 1.0, y0: p.y, kind: 'rock' };
        sec.cols.push(cc);
        this._addCol(cc);
      }
      // water splashes: a shallow pool sitting in the dip
      for (const F of tr.features) {
        if (!F.water || F.s < s0 || F.s >= s1) continue;
        const i = Math.floor(F.s / tr.DS);
        const c = at(F.s, 0);
        const y = tr.y[i] + 0.32;
        const halfL = F.L * 0.6, halfW = tr.hw[i] * 1.24 + 0.6;
        const wg = new THREE.PlaneGeometry(halfW * 2, halfL * 2, 1, 1);
        wg.rotateX(-Math.PI / 2);
        if (!this.waterMat) this.waterMat = new THREE.MeshPhongMaterial({ color: this.night ? 0x1d3346 : 0x4f7f96, shininess: 110, specular: 0x9fc4d6, transparent: true, opacity: 0.62, depthWrite: false });
        const wm = new THREE.Mesh(wg, this.waterMat);
        wm.position.set(c.x, y, c.z);
        wm.rotation.y = yawOf(c.h);
        wm.renderOrder = 2;
        this.root.add(wm);
        sec.extra.push(wm);
        const zone = { x: c.x, z: c.z, h: c.h, halfL, halfW, y };
        sec.water = (sec.water || []).concat(zone);
        this.waterZones.push(zone);
      }
      // gantries
      const gantries = [];
      if (tr.START >= s0 && tr.START < s1) gantries.push({ s: tr.START, text: 'START', bg: '#d81e2a', start: true });
      if (!tr.endless && tr.finishS >= s0 && tr.finishS < s1) gantries.push({ s: tr.finishS, text: 'FINISH', bg: '#14181f' });
      (tr.splits || []).forEach((sp, i) => {
        if (sp >= s0 && sp < s1) gantries.push({ s: sp, text: 'SPLIT ' + (i + 1), bg: '#1f4fa8' });
      });
      if (tr.endless) {
        for (let cp = tr.START + 1000; cp < s1; cp += 1000) if (cp >= s0) gantries.push({ s: cp, text: 'CHECKPOINT', bg: '#1f8a4c' });
      }
      for (const gt of gantries) {
        const i = Math.floor(gt.s / tr.DS);
        const hw = tr.hw[i] * 1.24 + 0.8;
        const pl = at(gt.s, -hw), pr = at(gt.s, hw);
        const top = Math.max(pl.y, pr.y) + 5.2;
        for (const p of [pl, pr]) {
          parts.push({ g: new THREE.BoxGeometry(0.45, top - p.y, 0.45), c: '#2a2f36', m: G.geo.mat(p.x, (top + p.y) / 2, p.z) });
          const cc = { x: p.x, z: p.z, r: 0.35, h: 6, y0: p.y, kind: 'post' };
          sec.cols.push(cc);
          this._addCol(cc);
        }
        const cx = (pl.x + pr.x) / 2, cz = (pl.z + pr.z) / 2;
        const span = Math.hypot(pr.x - pl.x, pr.z - pl.z);
        const ry = yawOf(pl.h);
        const tex = G.geo.textTexture(gt.text, gt.bg, '#ffffff', 1024, 160);
        const bm = new THREE.MeshBasicMaterial({ map: tex });
        const sideM = new THREE.MeshLambertMaterial({ color: 0x2a2f36 });
        const banner = new THREE.Mesh(new THREE.BoxGeometry(span, 1.25, 0.3), [sideM, sideM, sideM, sideM, bm, bm]);
        banner.position.set(cx, top - 0.3, cz);
        banner.rotation.y = ry;
        this.root.add(banner);
        sec.extra.push(banner);
        if (gt.start) {
          // start lights
          this.startLights = [];
          for (let L = 0; L < 5; L++) {
            const lm = new THREE.MeshBasicMaterial({ color: 0x330a0a });
            const sph = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lm);
            const off = (L - 2) * 0.62;
            const dirx = (pr.x - pl.x) / span, dirz = (pr.z - pl.z) / span;
            sph.position.set(cx + dirx * off, top - 1.25, cz + dirz * off);
            this.root.add(sph);
            sec.extra.push(sph);
            this.startLights.push(sph);
          }
        }
      }
      // guard rails / stone walls above drops (tarmac theme)
      if (T.walls) {
        for (const side of [-1, 1]) {
          let run = [];
          const flush = () => {
            if (run.length >= 2) {
              for (let q = 0; q < run.length - 1; q++) {
                const a = run[q], b = run[q + 1];
                const len = Math.hypot(b.x - a.x, b.z - a.z);
                const ry = Math.atan2(-(b.z - a.z), b.x - a.x);
                const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y: (a.y + b.y) / 2 };
                parts.push({ g: new THREE.BoxGeometry(len + 0.05, 0.32, 0.12), c: '#c9ccd1', m: G.geo.mat(mid.x, mid.y + 0.62, mid.z, 0, ry, 0) });
                parts.push({ g: new THREE.BoxGeometry(0.12, 0.75, 0.12), c: '#6b6f75', m: G.geo.mat(a.x, a.y + 0.37, a.z) });
                const cs = { x1: a.x, z1: a.z, x2: b.x, z2: b.z, r: 0.2, h: 0.9, y0: Math.min(a.y, b.y), kind: 'rail' };
                sec.cols.push(cs);
                this._addCol(cs);
              }
            }
            run = [];
          };
          for (let i = i0; i <= i1; i += 2) {
            const s = i * tr.DS;
            const hw = tr.hw[i];
            tr.pointAt(s, P);
            const rx = -Math.sin(P.h), rz = Math.cos(P.h);
            const ox = P.x + rx * side * (hw * 1.24 + 9), oz = P.z + rz * side * (hw * 1.24 + 9);
            const drop = tr.y[i] - tr.natural(ox, oz);
            if (drop > 5) {
              const d = side * (hw * 1.24 + 0.35);
              const x = P.x + rx * d, z = P.z + rz * d;
              run.push({ x, z, y: G.Track.crossY(tr.y[i], tr.bank[i], hw, d) });
            } else flush();
          }
          flush();
        }
      }
      // spectators
      for (const sp of tr.spectators) {
        if (sp.s < s0 || sp.s >= s1) continue;
        const r = G.rng(Math.floor(sp.s * 13));
        const shirt = ['#e63946', '#f1c40f', '#2e86de', '#ffffff', '#27ae60', '#ff7f11', '#8e44ad', '#111111', '#ff4fa3'];
        for (let n = 0; n < sp.n; n++) {
          const s = sp.s + r.range(-14, 14);
          const i = Math.floor(s / tr.DS);
          const d = sp.side * (tr.hw[i] * 1.24 + sp.d + r.range(0, 6));
          const p = at(s, d);
          sec.people.push({ x: p.x, y: p.y, z: p.z, ry: Math.atan2(-(p.x - P.x), -(p.z - P.z)) + r.range(-0.4, 0.4), c: new THREE.Color(r.pick(shirt)), ph: r() * 6.28, jump: 0 });
        }
        // tape line in front of the crowd
        const i = Math.floor(sp.s / tr.DS);
        const d = sp.side * (tr.hw[i] * 1.24 + sp.d - 1.5);
        for (let b = -16; b < 16; b += 4) {
          const a = at(sp.s + b, d), c2 = at(sp.s + b + 4, d);
          const len = Math.hypot(c2.x - a.x, c2.z - a.z);
          const ry = Math.atan2(-(c2.z - a.z), c2.x - a.x);
          parts.push({ g: new THREE.BoxGeometry(len, 0.06, 0.02), c: (b / 4) % 2 ? '#ff2222' : '#ffffff', m: G.geo.mat((a.x + c2.x) / 2, (a.y + c2.y) / 2 + 0.9, (a.z + c2.z) / 2, 0, ry, 0) });
          parts.push({ g: new THREE.BoxGeometry(0.05, 1.0, 0.05), c: '#dddddd', m: G.geo.mat(a.x, a.y + 0.5, a.z) });
        }
      }
      if (sec.people.length) this.peopleDirty = true;
      // grass tufts on the verges
      if (this.grassMesh) {
        const r = G.rng(i0 * 7 + 1);
        const mats = [], cols = [];
        const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const dens = this.themeKey === 'canyon' ? 0.35 : 1;
        const gq = {};
        for (let i = i0; i < i1; i++) {
          for (const side of [-1, 1]) {
            if (r() > dens * this.q.treeDensity) continue;
            const n = 1 + Math.floor(r() * 2.5);
            for (let k = 0; k < n; k++) {
              const d = side * (tr.hw[i] * 1.24 + 0.15 + Math.pow(r(), 1.6) * 6);
              const p = at(i * tr.DS + r() * tr.DS, d);
              this.groundAt(p.x, p.z, gq);
              if (gq.road > 0 || gq.ny < 0.8 || gq.water) continue;
              const sc = 0.7 + r() * 0.8;
              q4.setFromAxisAngle(up, r() * 6.28);
              v4.set(p.x, gq.y - 0.03, p.z);
              s4.set(sc, sc * (0.8 + r() * 0.6), sc);
              m4.compose(v4, q4, s4);
              mats.push(...m4.elements);
              const j = 0.8 + r() * 0.35;
              cols.push(this.grassCol.r * j, this.grassCol.g * j, this.grassCol.b * j);
            }
          }
        }
        sec.grass = { m: new Float32Array(mats), c: new Float32Array(cols) };
        this.grassDirty = true;
      }
      if (parts.length) {
        const g = G.geo.merge(parts);
        const m = new THREE.Mesh(g, this.propMat);
        m.castShadow = !!this.q.shadows;
        m.matrixAutoUpdate = false;
        this.root.add(m);
        sec.props = m;
      }
      if (glow.length) {
        const g = G.geo.merge(glow);
        const m = new THREE.Mesh(g, this.glowMat);
        m.matrixAutoUpdate = false;
        this.root.add(m);
        sec.extra.push(m);
      }
    }

    _disposeSection(k) {
      const s = this.sections.get(k);
      if (!s) return;
      this.root.remove(s.mesh);
      s.mesh.geometry.dispose();
      if (s.props) {
        this.root.remove(s.props);
        s.props.geometry.dispose();
      }
      for (const e of s.extra) {
        this.root.remove(e);
        e.geometry.dispose();
        const mats = Array.isArray(e.material) ? e.material : [e.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
      if (s.people.length) this.peopleDirty = true;
      if (s.grass) this.grassDirty = true;
      if (s.water) this.waterZones = this.waterZones.filter((z) => !s.water.includes(z));
      this._removeCols(s.cols);
      this.sections.delete(k);
    }

    _rebuildGrass() {
      this.grassDirty = false;
      const gm = this.grassMesh;
      if (!gm) return;
      const cap = gm.instanceMatrix.count;
      let n = 0;
      if (!gm.instanceColor) gm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      for (const sec of this.sections.values()) {
        if (!sec.grass) continue;
        const k = Math.min(sec.grass.m.length / 16, cap - n);
        if (k <= 0) break;
        gm.instanceMatrix.array.set(sec.grass.m.subarray(0, k * 16), n * 16);
        gm.instanceColor.array.set(sec.grass.c.subarray(0, k * 3), n * 3);
        n += k;
      }
      gm.count = n;
      gm.instanceMatrix.needsUpdate = true;
      gm.instanceColor.needsUpdate = true;
    }

    _rebuildPeople() {
      this.peopleDirty = false;
      this.people = [];
      for (const s of this.sections.values()) for (const p of s.people) this.people.push(p);
      const cap = this.peopleBody.instanceMatrix.count;
      const n = Math.min(cap, this.people.length);
      this.peopleBody.count = n;
      this.peopleRest.count = n;
      for (let i = 0; i < n; i++) this.peopleBody.setColorAt(i, this.people[i].c);
      if (this.peopleBody.instanceColor) this.peopleBody.instanceColor.needsUpdate = true;
      this._peopleMatrices(true);
    }

    _peopleMatrices(all) {
      const m = this._pm || (this._pm = new THREE.Matrix4());
      const q = this._pq || (this._pq = new THREE.Quaternion());
      const v = this._pv || (this._pv = new THREE.Vector3());
      const one = this._p1 || (this._p1 = new THREE.Vector3(1, 1, 1));
      const up = this._pu || (this._pu = new THREE.Vector3(0, 1, 0));
      const n = this.peopleBody.count;
      let touched = false;
      for (let i = 0; i < n; i++) {
        const p = this.people[i];
        if (!all && !p.active && !p.wasActive) continue;
        q.setFromAxisAngle(up, p.ry);
        v.set(p.x, p.y + p.jump, p.z);
        m.compose(v, q, one);
        this.peopleBody.setMatrixAt(i, m);
        this.peopleRest.setMatrixAt(i, m);
        touched = true;
      }
      if (touched) {
        this.peopleBody.instanceMatrix.needsUpdate = true;
        this.peopleRest.instanceMatrix.needsUpdate = true;
      }
    }

    _animatePeople(dt, c) {
      if (!this.people.length) return;
      const t = this.elapsed;
      for (const p of this.people) {
        const dx = p.x - c.x, dz = p.z - c.z;
        const near = dx * dx + dz * dz < 90 * 90;
        p.wasActive = p.active;
        p.active = near;
        p.jump = near ? Math.max(0, Math.sin(t * 9 + p.ph)) * 0.28 : 0;
      }
      this._peopleMatrices(false);
    }

    // ---------- colliders ----------
    _addCol(c) {
      c._cells = [];
      let x1, z1, x2, z2;
      if (c.x1 !== undefined) {
        x1 = Math.min(c.x1, c.x2) - c.r; x2 = Math.max(c.x1, c.x2) + c.r;
        z1 = Math.min(c.z1, c.z2) - c.r; z2 = Math.max(c.z1, c.z2) + c.r;
      } else {
        x1 = c.x - c.r; x2 = c.x + c.r; z1 = c.z - c.r; z2 = c.z + c.r;
      }
      for (let cx = Math.floor(x1 / COLCELL); cx <= Math.floor(x2 / COLCELL); cx++)
        for (let cz = Math.floor(z1 / COLCELL); cz <= Math.floor(z2 / COLCELL); cz++) {
          const k = ckey(cx, cz);
          let a = this.colGrid.get(k);
          if (!a) this.colGrid.set(k, (a = []));
          a.push(c);
          c._cells.push(k);
        }
    }
    _removeCols(list) {
      for (const c of list)
        for (const k of c._cells) {
          const a = this.colGrid.get(k);
          if (!a) continue;
          const i = a.indexOf(c);
          if (i >= 0) a.splice(i, 1);
        }
      list.length = 0;
    }
    queryCols(x, z, out) {
      out.length = 0;
      const cx = Math.floor(x / COLCELL), cz = Math.floor(z / COLCELL);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++) {
          const arr = this.colGrid.get(ckey(cx + a, cz + b));
          if (!arr) continue;
          for (const c of arr) if (out.indexOf(c) < 0) out.push(c);
        }
      return out;
    }

    // ---------- weather ----------
    _weather(dt, camera) {
      const cp = camera.position;
      if (this.rain) {
        const a = this.rain.geometry.attributes.position.array;
        const S = this.rainSeeds;
        const fall = this.elapsed * 22;
        for (let i = 0, n = S.length / 3; i < n; i++) {
          const x = S[i * 3], z = S[i * 3 + 2];
          let y = (S[i * 3 + 1] - fall) % 26;
          if (y < 0) y += 26;
          const wx = cp.x + ((((x - cp.x) % 60) + 90) % 60) - 30;
          const wz = cp.z + ((((z - cp.z) % 60) + 90) % 60) - 30;
          const wy = cp.y - 8 + y;
          a[i * 6] = wx; a[i * 6 + 1] = wy; a[i * 6 + 2] = wz;
          a[i * 6 + 3] = wx + 0.05; a[i * 6 + 4] = wy - 0.7; a[i * 6 + 5] = wz + 0.05;
        }
        this.rain.geometry.attributes.position.needsUpdate = true;
      }
      if (this.snowP) {
        const a = this.snowP.geometry.attributes.position.array;
        const S = this.snowSeeds;
        const fall = this.elapsed * 2.2;
        const t = this.elapsed;
        for (let i = 0, n = S.length / 4; i < n; i++) {
          let y = (S[i * 4 + 1] - fall) % 24;
          if (y < 0) y += 24;
          const x = S[i * 4] + Math.sin(t * 0.8 + S[i * 4 + 3]) * 0.8;
          const z = S[i * 4 + 2] + Math.cos(t * 0.6 + S[i * 4 + 3]) * 0.8;
          a[i * 3] = cp.x + ((((x - cp.x) % 60) + 90) % 60) - 30;
          a[i * 3 + 1] = cp.y - 6 + y;
          a[i * 3 + 2] = cp.z + ((((z - cp.z) % 60) + 90) % 60) - 30;
        }
        this.snowP.geometry.attributes.position.needsUpdate = true;
      }
    }

    dispose() {
      for (const [k, c] of this.chunks) this._disposeChunk(k, c);
      for (const k of Array.from(this.sections.keys())) this._disposeSection(k);
      this.root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      for (const m of [this.terrainMat, this.roadMat, this.propMat, this.glowMat]) m.dispose();
      this.scene.remove(this.root);
      this.scene.fog = null;
      this.hc.clear();
      this.dc.clear();
    }
  }

  G.World = World;
})();
