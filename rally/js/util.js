// Go Fast Rally — shared helpers: math, seeded random, noise, save data.
(function () {
  const G = (window.G = window.G || {});

  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.smoothstep = (a, b, x) => {
    const t = G.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  G.damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
  G.wrapAngle = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };

  // mulberry32
  G.rng = function (seed) {
    let s = seed >>> 0;
    const f = function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (a, b) => a + (b - a) * f();
    f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.weighted = (obj) => {
      let tot = 0;
      for (const k in obj) tot += obj[k];
      let r = f() * tot;
      for (const k in obj) {
        r -= obj[k];
        if (r <= 0) return k;
      }
      return Object.keys(obj)[0];
    };
    return f;
  };

  G.hashStr = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  G.hash2 = function (x, y, seed) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  };

  // ---------- 2D simplex noise ----------
  G.Noise = function (seed) {
    const r = G.rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    const perm = new Uint8Array(512);
    const pm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      perm[i] = p[i & 255];
      pm12[i] = perm[i] % 12;
    }
    const grad = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1]);
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    function n2(xin, yin) {
      let n0 = 0, n1 = 0, n2v = 0;
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s);
      const j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - (i - t);
      const y0 = yin - (j - t);
      let i1, j1;
      if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 > 0) {
        const gi = pm12[ii + perm[jj]] * 2;
        t0 *= t0;
        n0 = t0 * t0 * (grad[gi] * x0 + grad[gi + 1] * y0);
      }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 > 0) {
        const gi = pm12[ii + i1 + perm[jj + j1]] * 2;
        t1 *= t1;
        n1 = t1 * t1 * (grad[gi] * x1 + grad[gi + 1] * y1);
      }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 > 0) {
        const gi = pm12[ii + 1 + perm[jj + 1]] * 2;
        t2 *= t2;
        n2v = t2 * t2 * (grad[gi] * x2 + grad[gi + 1] * y2);
      }
      return 70 * (n0 + n1 + n2v); // -1..1
    }
    return {
      n2,
      fbm(x, y, oct, lac, gain) {
        let a = 1, f = 1, s = 0, norm = 0;
        for (let o = 0; o < oct; o++) {
          s += a * n2(x * f, y * f);
          norm += a;
          a *= gain;
          f *= lac;
        }
        return s / norm;
      },
      ridged(x, y, oct) {
        let a = 1, f = 1, s = 0, norm = 0;
        for (let o = 0; o < oct; o++) {
          const v = 1 - Math.abs(n2(x * f, y * f));
          s += a * v * v;
          norm += a;
          a *= 0.5;
          f *= 2.03;
        }
        return s / norm; // 0..1
      },
    };
  };

  // ---------- time formatting ----------
  G.fmtTime = function (t, digits) {
    if (t == null || !isFinite(t)) return '--:--.--';
    const d = digits == null ? 2 : digits;
    const neg = t < 0;
    t = Math.abs(t);
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    let ss = s.toFixed(d);
    if (s < 10) ss = '0' + ss;
    return (neg ? '-' : '') + m + ':' + ss;
  };
  G.fmtDelta = function (d) {
    if (d == null || !isFinite(d)) return '';
    return (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(2);
  };

  // ---------- save data ----------
  const SAVE_KEY = 'gofastrally_save_v1';
  const defaults = () => ({
    settings: {
      quality: 'auto',
      resScale: 1,
      shadows: true,
      units: 'kmh',
      transmission: 'auto',
      handling: 'arcade',
      steerAssist: true,
      abs: true,
      tc: false,
      damage: 'normal',
      voice: true,
      callTiming: 'normal',
      paceHud: true,
      master: 0.8,
      engineVol: 0.8,
      voiceVol: 1,
      musicVol: 0.5,
      camera: 0,
      fps: false,
      speedFx: true,
      steerSens: 1,
    },
    car: 'vortex',
    earned: 300,
    spent: 0,
    ups: {},
    owned: { sprite: true, vortex: true },
    account: null,
    liveries: {},
    bests: {}, // stageKey -> {t, splits:[], car}
    daily: {},
    endless: {},
    stats: { km: 0, stages: 0, stars: 0, resets: 0, jumps: 0 },
    seenHelp: false,
    name: 'YOU',
  });
  G.save = {
    data: null,
    credits() {
      return (this.data.earned | 0) - (this.data.spent | 0) + (this.data.admCr | 0);
    },
    // upgrade levels for a car (an admin "max upgrades" gift makes everything level 3)
    ups(carId) {
      if (this.data.admUps) {
        const o = {};
        for (const p of G.PARTS) o[p.id] = 3;
        return o;
      }
      return (this.data.ups || {})[carId] || {};
    },
    earn(n) {
      this.data.earned = (this.data.earned | 0) + Math.round(n);
    },
    load() {
      let d = null;
      try {
        d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      } catch (e) {
        d = null;
      }
      const def = defaults();
      if (!d || typeof d !== 'object') d = def;
      for (const k in def) if (d[k] === undefined) d[k] = def[k];
      for (const k in def.settings) if (d.settings[k] === undefined) d.settings[k] = def.settings[k];
      for (const k in def.stats) if (d.stats[k] === undefined) d.stats[k] = def.stats[k];
      this.data = d;
      return d;
    },
    write() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
      } catch (e) {
        /* storage full or blocked */
      }
    },
    ghost(key) {
      try {
        const s = localStorage.getItem('gfr_ghost_' + key);
        return s ? JSON.parse(s) : null;
      } catch (e) {
        return null;
      }
    },
    setGhost(key, g) {
      try {
        // keep the number of stored ghosts bounded
        const idxKey = 'gfr_ghost_index';
        let idx = JSON.parse(localStorage.getItem(idxKey) || '[]');
        idx = idx.filter((k) => k !== key);
        idx.push(key);
        while (idx.length > 24) {
          const old = idx.shift();
          localStorage.removeItem('gfr_ghost_' + old);
        }
        localStorage.setItem('gfr_ghost_' + key, JSON.stringify(g));
        localStorage.setItem(idxKey, JSON.stringify(idx));
      } catch (e) {
        /* ignore */
      }
    },
  };
})();
