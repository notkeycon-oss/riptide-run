// Go Fast Rally — procedural rally stage generator.
// The road is a 2 m-spaced centreline built from pace-note style segments:
// straights and turns graded 6 (fast) .. 1 (slow) plus hairpins, with
// clothoid transitions, tightening/opening turns, crests and jumps.
// Heading convention: direction = (cos h, sin h) in the XZ plane.
// Positive curvature turns RIGHT. Right vector = (-sin h, cos h).
(function () {
  const G = window.G;
  const DS = 2;
  const CELL = 16;

  // turn grade -> [radius min, radius max, angle min deg, angle max deg]
  const SEV = {
    6: [190, 260, 14, 34],
    5: [120, 165, 18, 50],
    4: [78, 105, 24, 75],
    3: [52, 68, 30, 95],
    2: [33, 44, 40, 115],
    1: [21, 28, 50, 130],
    hp: [10, 13, 178, 202],
  };
  const NUMWORD = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };

  function key(cx, cz) {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  class Track {
    constructor(o) {
      this.seed = o.seed >>> 0;
      this.themeKey = o.theme;
      this.theme = G.THEMES[o.theme];
      this.diffKey = o.diff || 'technical';
      this.diff = G.DIFFICULTY[this.diffKey];
      this.km = o.km || 0;
      this.endless = !o.km;
      this.DS = DS;
      this.START = 70;
      this.length = this.endless ? 1e9 : this.km * 1000;
      this.finishS = this.START + this.length;
      this.rand = G.rng((Math.imul(this.seed, 2654435761) ^ 0x9e3779b9) >>> 0);
      this.noise = G.Noise(this.seed + 17);
      this.surface = this.theme.surface;
      this.px = []; this.pz = []; this.hd = []; this.k = []; this.raw = []; this.pre = [0];
      this.yb = []; this.y = []; this.hw = []; this.hwT = []; this.bank = []; this.vlim = []; this.ice = [];
      this.n2 = 0; // generated points
      this.n = 0; // finalised points (have elevation)
      this.segs = [];
      this.notes = [];
      this.features = [];
      this.hazards = [];
      this.spectators = [];
      this.grid = new Map();
      this.x = 0; this.z = 0;
      this.h = this.rand() * Math.PI * 2;
      this.base = this.h;
      this.seaDir = this.h;
      this.gid = 0;
      this.backtracks = 0;
      this.hwCur = this.theme.widthHalf;
      this.W = 40;
      this.maxGrade = this.themeKey === 'canyon' ? 0.13 : 0.115;
      this.seaLevel = this.theme.sea ? 0 : -1e9;
      this._noteNoise = 0;
      // start straight
      const startPts = Math.round((this.START + 50) / DS);
      const k0 = new Array(startPts).fill(0);
      this._commit(k0, { kind: 'straight', len: startPts * DS, start: true });
      this.ensure(this.endless ? 2600 : this.finishS + 520);
      this.splits = this.endless ? [] : [this.START + this.length / 3, this.START + (2 * this.length) / 3];
      if (!this.endless) this.refTime = this.computeRef(this.START, this.finishS);
    }

    // ---------- natural terrain ----------
    natural(x, z) {
      const T = this.theme, N = this.noise;
      const sc = T.scale;
      let h = N.fbm(x * sc, z * sc, 4, 2.0, 0.5) * T.amp;
      if (T.ridge > 0) h += (N.ridged(x * sc * 1.7 + 31.1, z * sc * 1.7 - 12.7, 3) - 0.45) * T.amp * T.ridge;
      h += N.n2(x / 95 + 7.3, z / 95 - 3.1) * T.detailAmp;
      h += N.n2(x / 31 - 2.2, z / 31 + 9.4) * T.detailAmp * 0.22;
      if (this.themeKey === 'canyon') {
        // mesa terraces
        const step = 11;
        const base = Math.floor(h / step) * step;
        const f = (h - base) / step;
        h = base + step * G.smoothstep(0.55, 0.85, f);
      }
      if (this.theme.sea) {
        // one side of the world falls away to the sea
        const side = Math.sin(this.seaDir) * x - Math.cos(this.seaDir) * z;
        h += 30 + side * 0.05;
      }
      return h;
    }

    // ---------- generation ----------
    ensure(s) {
      const need = Math.ceil(s / DS) + 2;
      let guard = 0;
      while (this.n < need && guard++ < 10000) {
        while (this.n2 < need + this.W + 140) this._addSegment();
        this._finalizeTo(Math.min(this.n2 - this.W - 130, need + 150));
      }
    }

    _simulate(kArr, cb) {
      let x = this.x, z = this.z, h = this.h;
      for (let j = 0; j < kArr.length; j++) {
        h += kArr[j] * DS;
        x += Math.cos(h) * DS;
        z += Math.sin(h) * DS;
        if (cb(j, x, z, h) === false) return false;
      }
      return true;
    }

    _check(kArr) {
      const far2 = 34 * 34, near2 = 17 * 17;
      const n2 = this.n2;
      const nx = [], nz = [];
      const ok = this._simulate(kArr, (j, x, z) => {
        const idx = n2 + j;
        const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
        for (let a = -2; a <= 2; a++)
          for (let b = -2; b <= 2; b++) {
            const cell = this.grid.get(key(cx + a, cz + b));
            if (!cell) continue;
            for (let q = 0; q < cell.length; q++) {
              const i = cell[q];
              const di = idx - i;
              if (di < 14) continue;
              const dx = this.px[i] - x, dz = this.pz[i] - z;
              const d2 = dx * dx + dz * dz;
              if (d2 < (di >= 75 ? far2 : near2)) return false;
            }
          }
        // the new piece must not fold back onto itself either
        for (let k = 0; k < j - 14; k += 2) {
          const dx = nx[k] - x, dz = nz[k] - z;
          if (dx * dx + dz * dz < (j - k >= 75 ? far2 : near2)) return false;
        }
        nx.push(x);
        nz.push(z);
        return true;
      });
      return ok;
    }

    // look ahead: is there still open space in front of the road (straight on, or after a turn either way)?
    _roomAhead() {
      if (!this._probes) {
        const st = new Array(50).fill(0);
        const L = this._turnProfile(38, 38, Math.PI / 2, -1).concat(new Array(22).fill(0));
        const R = L.map((v) => -v);
        this._probes = [st, L, R];
      }
      for (const k of this._probes) if (this._check(k)) return true;
      return false;
    }

    _turnProfile(R1, R2, angle, dir) {
      // curvature array (per DS step) with clothoid ramps; exact total heading change
      const k1 = 1 / R1, k2 = 1 / R2;
      const kAvg = (k1 + k2) / 2;
      let Lt = G.clamp(0.45 * Math.min(R1, R2), 6, 22);
      const arc = angle / kAvg;
      if (Lt * 2 > arc) Lt = arc / 2;
      const nT = Math.max(1, Math.round(Lt / DS));
      const nP = Math.max(1, Math.round((arc - Lt) / DS));
      const out = [];
      for (let i = 0; i < nT; i++) out.push(k1 * ((i + 0.5) / nT));
      const half = Math.floor(nP / 2);
      for (let i = 0; i < nP; i++) {
        let t = i < half ? 0 : (i - half) / Math.max(1, nP - half);
        t = G.smoothstep(0, 0.5, t);
        out.push(G.lerp(k1, k2, R1 === R2 ? 0 : t));
      }
      for (let i = 0; i < nT; i++) out.push(k2 * (1 - (i + 0.5) / nT));
      let sum = 0;
      for (const v of out) sum += v * DS;
      const sc = angle / sum;
      for (let i = 0; i < out.length; i++) out[i] *= sc * dir;
      return out;
    }

    _planTurn(last, attempt) {
      const r = this.rand;
      const lastTurn = this._lastTurn;
      let sev = r.weighted(this.diff.w);
      // hairpins come in switchback pairs sometimes
      if (lastTurn && lastTurn.sev === 'hp' && last.kind === 'straight' && last.len < 60 && r() < 0.45) sev = 'hp';
      if (this.n2 * DS < this.START + 120 && (sev === 'hp' || sev === '1')) sev = '3';
      if (attempt > 8) sev = r.pick(['3', '4', '5']);
      const tab = SEV[sev];
      let R = r.range(tab[0], tab[1]);
      let angle = (r.range(tab[2], tab[3]) * Math.PI) / 180;
      // pick direction: steer back toward the wandering base heading, like S-bends
      const dev = G.wrapAngle(this.h - this.base);
      let dir;
      if (dev > 0.95) dir = r() < 0.85 ? -1 : 1;
      else if (dev < -0.95) dir = r() < 0.85 ? 1 : -1;
      else if (lastTurn) dir = r() < 0.62 ? -lastTurn.dir : lastTurn.dir;
      else dir = r() < 0.5 ? 1 : -1;
      // steer away from parts of the map the road already covers (stops spirals)
      const occ = this._occupancy();
      if (Math.abs(occ) > 4 && r() < 0.9) dir = occ > 0 ? -1 : 1;
      if (sev === 'hp' && lastTurn && lastTurn.sev === 'hp') dir = -lastTurn.dir;
      const mods = [];
      let R2 = R;
      if (sev !== 'hp' && angle > 0.8) {
        const q = r();
        if (q < 0.16) { R2 = R * 0.58; mods.push('tightens'); }
        else if (q < 0.27) { R2 = R * 1.6; mods.push('opens'); }
      }
      if (sev !== 'hp' && angle > (100 * Math.PI) / 180) mods.push('long');
      if (sev === '2' && angle > 1.35 && angle < 1.75 && !mods.length) mods.push('square');
      const k = this._turnProfile(R, R2, angle, dir);
      return { kind: 'turn', k, sev, dir, angle, R, R2, mods };
    }

    // >0 when there is more existing road to the right of the heading than to the left
    _occupancy() {
      let sum = 0;
      for (const side of [1, -1]) {
        let c = 0;
        for (const ang of [0.5, 1.1]) {
          for (const dist of [110, 230]) {
            const a = this.h + side * ang;
            const x = this.x + Math.cos(a) * dist, z = this.z + Math.sin(a) * dist;
            const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
            for (let p = -3; p <= 3; p++)
              for (let q = -3; q <= 3; q++) {
                const cell = this.grid.get(key(cx + p, cz + q));
                if (cell) c += cell.length;
              }
          }
        }
        sum += side * c;
      }
      return sum / 8;
    }

    _planStraight(last, attempt) {
      const r = this.rand;
      let len;
      if (last && last.sev === 'hp') len = r.range(26, 56);
      else if (r() < this.diff.chicane) len = r.range(0, 14);
      else if (r() < 0.14) len = r.range(160, 320) * this.diff.straightMul;
      else len = r.range(24, 150) * this.diff.straightMul;
      if (attempt > 3) len = r.range(30, 90);
      const n = Math.round(len / DS);
      const k = [];
      const ph = r() * 10;
      for (let i = 0; i < n; i++) k.push(0.0016 * Math.sin(ph + i * 0.045) * (n > 30 ? 1 : 0));
      return { kind: 'straight', k, len: n * DS };
    }

    _addSegment() {
      const last = this.segs[this.segs.length - 1];
      let plan = null;
      for (let attempt = 0; attempt < 22 && !plan; attempt++) {
        const p = last.kind === 'turn' && attempt < 10 ? this._planStraight(last, attempt) : this._planTurn(last, attempt);
        const tryIt = () => {
          if (!this._check(p.k)) return false;
          // leave room to keep going after this piece
          const save = [this.x, this.z, this.h];
          this._simulate(p.k, (j, x, z, h) => { save[0] = x; save[1] = z; save[2] = h; });
          const ox = this.x, oz = this.z, oh = this.h, on = this.n2;
          this.x = save[0]; this.z = save[1]; this.h = save[2]; this.n2 = on + p.k.length;
          const room = this._roomAhead();
          this.x = ox; this.z = oz; this.h = oh; this.n2 = on;
          return room;
        };
        if (tryIt()) { plan = p; break; }
        if (p.kind === 'turn') {
          p.k = p.k.map((v) => -v);
          p.dir = -p.dir;
          if (tryIt()) { plan = p; break; }
        }
      }
      if (!plan && this.segs.length > 2) {
        // boxed in: undo the last piece of road (if it is not final yet) and try again
        const lastSeg = this.segs[this.segs.length - 1];
        if (lastSeg.s0 / DS >= this.n + 2 && !lastSeg.start && this.backtracks < 400) {
          this.backtracks++;
          const here = this.n2;
          this._stuckAt = Math.abs((this._stuckAt || 0) - here) < 300 ? this._stuckAt : here;
          this._stuckN = this._stuckAt === here || Math.abs(this._stuckAt - here) < 300 ? (this._stuckN || 0) + 1 : 0;
          const depth = 1 + Math.floor(this._stuckN / 3);
          for (let d = 0; d < depth; d++) {
            const sg = this.segs[this.segs.length - 1];
            if (!sg || sg.start || sg.s0 / DS < this.n + 2) break;
            this._rollback(sg);
          }
          return;
        }
      }
      if (!plan) {
        // still boxed in: swing hard toward open ground
        let best = null;
        for (const ang of [1.2, 1.8, 2.4, 0.8]) {
          for (const dir of [1, -1]) {
            const k = this._turnProfile(24, 24, ang, dir);
            if (this._check(k)) { best = { kind: 'turn', k, sev: '1', dir, angle: ang, R: 24, R2: 24, mods: [] }; break; }
          }
          if (best) break;
        }
        plan = best || this._planTurn(last, 99);
        this.base = this.h + plan.dir * plan.angle;
      }
      this._commit(plan.k, plan);
      this.base += this.rand.range(-0.2, 0.2);
    }

    _rollback(seg) {
      const i0 = Math.round(seg.s0 / DS);
      while (this.n2 > i0) {
        const i = this.n2 - 1;
        const cell = this.grid.get(key(Math.floor(this.px[i] / CELL), Math.floor(this.pz[i] / CELL)));
        if (cell) {
          const at = cell.lastIndexOf(i);
          if (at >= 0) cell.splice(at, 1);
        }
        this.px.pop(); this.pz.pop(); this.hd.pop(); this.k.pop(); this.hw.pop(); this.raw.pop(); this.pre.pop();
        this.n2--;
      }
      this.segs.pop();
      const g = seg.gid;
      const keep = (o) => o.gid !== g;
      this.notes = this.notes.filter(keep);
      this.features = this.features.filter(keep);
      this.hazards = this.hazards.filter(keep);
      this.spectators = this.spectators.filter(keep);
      if (seg.prevNote) {
        seg.prevNote.dist = seg.prevDist;
        seg.prevNote.link = seg.prevLink;
      }
      this._lastTurn = null;
      for (let j = this.segs.length - 1; j >= 0; j--) if (this.segs[j].kind === 'turn') { this._lastTurn = this.segs[j]; break; }
      const n = this.n2 - 1;
      this.x = this.px[n];
      this.z = this.pz[n];
      this.h = this.hd[n];
      this.hwCur = this.hw[n];
      // nudge the general direction so the retry goes somewhere else
      this.base = this.h + this.rand.range(-1.2, 1.2);
    }

    _commit(kArr, plan) {
      const T = this.theme;
      const i0 = this.n2;
      const s0 = i0 * DS;
      let hwTarget = T.widthHalf + 0.3 * this.noise.n2(s0 * 0.003, 5.5);
      if (plan.kind === 'turn' && plan.sev === 'hp') hwTarget += 0.9;
      else if (plan.kind === 'turn' && plan.sev === '1') hwTarget += 0.4;
      let narrows = false;
      if (plan.kind === 'straight' && plan.len > 60 && !plan.start && this.rand() < 0.1) {
        hwTarget -= 0.55;
        narrows = true;
      }
      for (let j = 0; j < kArr.length; j++) {
        this.h += kArr[j] * DS;
        this.x += Math.cos(this.h) * DS;
        this.z += Math.sin(this.h) * DS;
        this._pushPoint(this.x, this.z, this.h, kArr[j], hwTarget);
      }
      if (i0 === 0 && kArr.length === 0) return;
      const s1 = this.n2 * DS;
      const seg = Object.assign({ s0, s1 }, plan);
      delete seg.k;
      const gid = (seg.gid = ++this.gid);
      this.segs.push(seg);
      const nNotes = this.notes.length, nFeat = this.features.length, nHaz = this.hazards.length, nSpec = this.spectators.length;

      if (plan.kind === 'turn') {
        const note = { s: s0, kind: 'turn', dir: plan.dir, sev: plan.sev, mods: plan.mods.slice(), dist: 0, link: null, seg };
        // over crest? decided when the elevation is finalised
        if ((plan.sev === '1' || plan.sev === '2' || plan.sev === '3') && this.rand() < 0.28) {
          note.mods.push("don't cut");
          const apex = s0 + (s1 - s0) * 0.5;
          this.hazards.push({ s: apex, side: plan.dir, d: 1.05, r: 0.9 + this.rand() * 0.4 });
        }
        this.notes.push(note);
        // spectators gather at hairpins and slow corners
        if (plan.sev === 'hp' || (plan.sev === '1' && this.rand() < 0.5)) {
          this.spectators.push({ s: (s0 + s1) / 2, side: plan.dir, d: 7, n: 8 + Math.floor(this.rand() * 14) });
        }
        this._lastTurn = seg;
      } else {
        // link previous note to the next one, or give a distance
        const prev = this.notes[this.notes.length - 1];
        if (prev && prev.kind === 'turn') {
          seg.prevNote = prev;
          seg.prevDist = prev.dist;
          seg.prevLink = prev.link;
          if (plan.len < 16) prev.link = 'into';
          else if (plan.len < 40) prev.link = 'and';
          else if (plan.len >= 60) prev.dist = Math.round(plan.len / 50) * 50;
        }
        if (narrows) this.notes.push({ s: s0 + 6, kind: 'narrows', mods: [], dist: 0 });
        // crests and jumps on longer straights
        if (plan.len >= 70 && s0 > this.START + 60 && (this.endless || s1 < this.finishS - 60)) {
          const r = this.rand();
          if (r < T.jumpChance) {
            const amp = this.rand.range(1.3, 2.3);
            const L = this.rand.range(13, 18);
            const s = s0 + plan.len * this.rand.range(0.4, 0.7);
            this.features.push({ s, L, amp, kind: 'jump' });
            this.notes.push({ s: s - L - 4, kind: 'jump', big: amp > 1.9, mods: [], dist: 0 });
            if (this.rand() < 0.7) this.spectators.push({ s: s + L * 0.8, side: this.rand() < 0.5 ? 1 : -1, d: 9, n: 6 + Math.floor(this.rand() * 10) });
          } else if (r < T.jumpChance + T.crestChance) {
            const amp = this.rand.range(0.7, 1.2);
            const L = this.rand.range(18, 26);
            const s = s0 + plan.len * this.rand.range(0.35, 0.7);
            this.features.push({ s, L, amp, kind: 'crest' });
            this.notes.push({ s: s - L - 4, kind: 'crest', mods: [], dist: 0 });
          } else if (r < T.jumpChance + T.crestChance + 0.15) {
            const s = s0 + plan.len * this.rand.range(0.35, 0.7);
            this.features.push({ s, L: 14, amp: -0.9, kind: 'dip' });
            this.notes.push({ s: s - 18, kind: 'dip', mods: [], dist: 0 });
          }
        }
      }
      for (let q = nNotes; q < this.notes.length; q++) this.notes[q].gid = gid;
      for (let q = nFeat; q < this.features.length; q++) this.features[q].gid = gid;
      for (let q = nHaz; q < this.hazards.length; q++) this.hazards[q].gid = gid;
      for (let q = nSpec; q < this.spectators.length; q++) this.spectators[q].gid = gid;
      this.notes.sort((a, b) => a.s - b.s);
    }

    _pushPoint(x, z, h, k, hwT) {
      const i = this.n2++;
      this.px.push(x);
      this.pz.push(z);
      this.hd.push(h);
      this.k.push(k);
      this.hwCur = i === 0 ? hwT : G.lerp(this.hwCur, hwT, 0.12);
      this.hw.push(this.hwCur);
      let raw = this.natural(x, z);
      if (this.theme.sea) raw = Math.max(raw, 9);
      this.raw.push(raw);
      this.pre.push(this.pre[i] + raw);
      const kk = key(Math.floor(x / CELL), Math.floor(z / CELL));
      let cell = this.grid.get(kk);
      if (!cell) this.grid.set(kk, (cell = []));
      cell.push(i);
    }

    _featureOffset(s) {
      let off = 0;
      for (let f = this.features.length - 1; f >= 0; f--) {
        const F = this.features[f];
        if (F.s + F.L < s - 400) break;
        const u = (s - F.s) / F.L;
        if (u <= -1 || u >= 1) continue;
        off += (F.amp * (1 + Math.cos(Math.PI * u))) / 2;
      }
      return off;
    }

    _finalizeTo(m) {
      const W = this.W, g = this.maxGrade * DS;
      for (let i = this.n; i < m; i++) {
        const a = Math.max(0, i - W), b = Math.min(this.n2, i + W + 1);
        let sm = (this.pre[b] - this.pre[a]) / (b - a);
        let yb = i === 0 ? sm : G.clamp(sm, this.yb[i - 1] - g, this.yb[i - 1] + g);
        if (i < 30) yb = i === 0 ? sm : this.yb[i - 1] + G.clamp(sm - this.yb[i - 1], -0.03, 0.03);
        this.yb.push(yb);
        this.y.push(yb + this._featureOffset(i * DS));
        // banking from smoothed curvature
        let ks = 0;
        for (let q = -4; q <= 4; q++) ks += this.k[G.clamp(i + q, 0, this.n2 - 1)];
        ks /= 9;
        this.bank.push(G.clamp(ks * 16, -0.06, 0.06));
        // icy patches on snow stages
        let ice = 0;
        if (this.surface === 'snow') {
          const v = this.noise.n2(i * 0.011, 41.7);
          ice = G.smoothstep(0.55, 0.7, v);
        }
        this.ice.push(ice);
        this.vlim.push(60);
        if (i >= 2) this._computeVlim(i - 1);
      }
      this.n = Math.max(this.n, m);
    }

    _computeVlim(i) {
      let ks = 0;
      for (let q = -4; q <= 4; q++) ks = Math.max(ks, Math.abs(this.k[G.clamp(i + q, 0, this.n2 - 1)]));
      const mu = G.SURF[this.surface].mu * 0.92;
      let v = Math.sqrt((mu * 9.81) / Math.max(ks, 1e-4));
      const kv = (this.y[i + 1] - 2 * this.y[i] + this.y[i - 1]) / (DS * DS);
      if (kv < -0.004) v = Math.min(v, Math.sqrt(9.81 / -kv) * 1.3);
      this.vlim[i] = Math.min(v, 52);
    }

    computeRef(sA, sB) {
      // reference lap: Vortex R5-like car, used for medal times
      const i0 = Math.max(1, Math.floor(sA / DS)), i1 = Math.min(this.n - 2, Math.ceil(sB / DS));
      const mu = G.SURF[this.surface].mu / 0.9;
      const v = [];
      for (let i = i0; i <= i1; i++) v.push(this.vlim[i]);
      const ab = 7.2 * mu;
      for (let j = v.length - 2; j >= 0; j--) v[j] = Math.min(v[j], Math.sqrt(v[j + 1] * v[j + 1] + 2 * ab * DS));
      v[0] = 0;
      for (let j = 1; j < v.length; j++) {
        const vp = Math.max(v[j - 1], 1);
        const acc = Math.min(6.2 * mu, 175000 / (1300 * vp)) - (0.5 * 1.2 * 0.75 * vp * vp) / 1300;
        v[j] = Math.min(v[j], Math.sqrt(v[j - 1] * v[j - 1] + 2 * Math.max(acc, 0.1) * DS));
      }
      let t = 0;
      for (let j = 1; j < v.length; j++) t += DS / Math.max(0.5, (v[j] + v[j - 1]) / 2);
      return t;
    }

    // ---------- queries ----------
    // Nearest point on the centreline. Writes into out:
    // i (segment start index), t, s, d (signed lateral, + = right), cx, cz, cy (centre height),
    // hw, bank, dx, dz (direction), dist (|d|), plus a second distinct road section (i2, d2, y2) if found.
    nearest(x, z, maxR, out, wantSecond) {
      const r = Math.ceil(maxR / CELL);
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      let best = -1, bd = 1e18;
      let cand = this._cand || (this._cand = []);
      cand.length = 0;
      const n = this.n;
      for (let a = -r; a <= r; a++)
        for (let b = -r; b <= r; b++) {
          const cell = this.grid.get(key(cx + a, cz + b));
          if (!cell) continue;
          for (let q = 0; q < cell.length; q++) {
            const i = cell[q];
            if (i >= n - 1) continue;
            const dx = this.px[i] - x, dz = this.pz[i] - z;
            const d2 = dx * dx + dz * dz;
            if (wantSecond) cand.push(i, d2);
            if (d2 < bd) { bd = d2; best = i; }
          }
        }
      if (best < 0) { out.i = -1; return out; }
      this._project(x, z, best, out);
      out.i2 = -1;
      if (wantSecond) {
        let b2 = -1, bd2 = maxR * maxR;
        for (let q = 0; q < cand.length; q += 2) {
          const i = cand[q];
          if (Math.abs(i - best) < 30) continue;
          if (cand[q + 1] < bd2) { bd2 = cand[q + 1]; b2 = i; }
        }
        if (b2 >= 0) {
          const o2 = this._o2 || (this._o2 = {});
          this._project(x, z, b2, o2);
          out.i2 = b2;
          out.d2 = o2.d;
          out.y2 = o2.cy;
          out.hw2 = o2.hw;
          out.bank2 = o2.bank;
        }
      }
      return out;
    }

    // Local search around a hint index (for progress tracking without jumping across switchbacks)
    nearestLocal(x, z, hint, range, out) {
      let best = -1, bd = 1e18;
      const a = Math.max(0, hint - range), b = Math.min(this.n - 2, hint + range);
      for (let i = a; i <= b; i++) {
        const dx = this.px[i] - x, dz = this.pz[i] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; best = i; }
      }
      if (best < 0) { out.i = -1; return out; }
      return this._project(x, z, best, out);
    }

    _project(x, z, best, out) {
      // choose the segment [best-1,best] or [best,best+1] that projects best
      let i = best;
      const tryProj = (j) => {
        if (j < 0 || j >= this.n - 1) return null;
        const ax = this.px[j], az = this.pz[j];
        const bx = this.px[j + 1] - ax, bz = this.pz[j + 1] - az;
        const L2 = bx * bx + bz * bz;
        let t = ((x - ax) * bx + (z - az) * bz) / L2;
        const tc = G.clamp(t, 0, 1);
        const qx = ax + bx * tc, qz = az + bz * tc;
        const d2 = (x - qx) * (x - qx) + (z - qz) * (z - qz);
        return { j, t: tc, d2 };
      };
      const p1 = tryProj(best - 1), p2 = tryProj(best);
      let p = p2 || p1;
      if (p1 && p2 && p1.d2 < p2.d2) p = p1;
      if (!p) { out.i = -1; return out; }
      i = p.j;
      const t = p.t;
      const ax = this.px[i], az = this.pz[i];
      const cxp = ax + (this.px[i + 1] - ax) * t;
      const czp = az + (this.pz[i + 1] - az) * t;
      let dx = this.px[i + 1] - ax, dz = this.pz[i + 1] - az;
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      // right = (-dz, dx)
      const d = (x - cxp) * -dz + (z - czp) * dx;
      out.i = i;
      out.t = t;
      out.s = (i + t) * DS;
      out.d = d;
      out.dist = Math.abs(d);
      out.cx = cxp;
      out.cz = czp;
      out.cy = this.y[i] + (this.y[i + 1] - this.y[i]) * t;
      out.hw = this.hw[i] + (this.hw[i + 1] - this.hw[i]) * t;
      out.bank = this.bank[i] + (this.bank[i + 1] - this.bank[i]) * t;
      out.dx = dx;
      out.dz = dz;
      out.ice = this.ice[i];
      return out;
    }

    // Road cross-section height at signed lateral offset d
    static crossY(cy, bank, hw, d) {
      const ad = Math.abs(d);
      let y = cy - bank * G.clamp(d, -hw, hw);
      // gentle crown so water would drain
      y -= 0.012 * ad;
      if (ad > hw) y -= 0.16 * Math.min(1, (ad - hw) / (hw * 0.24));
      return y;
    }

    pointAt(s, out) {
      const f = G.clamp(s / DS, 0, this.n - 1.001);
      const i = Math.floor(f), t = f - i;
      out.x = this.px[i] + (this.px[i + 1] - this.px[i]) * t;
      out.z = this.pz[i] + (this.pz[i + 1] - this.pz[i]) * t;
      out.y = this.y[i] + (this.y[i + 1] - this.y[i]) * t;
      let h0 = this.hd[i], h1 = this.hd[i + 1];
      out.h = h0 + G.wrapAngle(h1 - h0) * t;
      out.hw = this.hw[i] + (this.hw[i + 1] - this.hw[i]) * t;
      out.bank = this.bank[i];
      out.i = i;
      return out;
    }

    // ---------- pace note text ----------
    noteText(n) {
      if (n.kind === 'turn') {
        const side = n.dir > 0 ? 'right' : 'left';
        let t = n.sev === 'hp' ? 'hairpin ' + side : (n.mods.includes('square') ? 'square ' + side : NUMWORD[n.sev] + ' ' + side);
        for (const m of n.mods) if (m !== 'square') t += ' ' + m;
        if (n.caution) t = 'caution, ' + t;
        if (n.crest) t += ' over crest';
        return t;
      }
      if (n.kind === 'jump') return n.big ? 'big jump' : 'jump';
      if (n.kind === 'crest') return 'over crest';
      if (n.kind === 'dip') return 'dip';
      if (n.kind === 'narrows') return 'narrows';
      if (n.kind === 'finish') return 'flat out to finish';
      return '';
    }
    // Called lazily when a note comes into view: work out "caution" (drop on the outside)
    // and whether the turn starts over a crest.
    annotate(n) {
      if (n._ann) return;
      n._ann = true;
      if (n.kind !== 'turn') return;
      const s1 = n.seg.s1;
      const apex = (n.s + s1) / 2;
      const p = this.pointAt(apex, {});
      const out = -n.dir; // outside of the turn
      const rx = -Math.sin(p.h), rz = Math.cos(p.h);
      const ox = p.x + rx * out * (p.hw + 14), oz = p.z + rz * out * (p.hw + 14);
      if (this.natural(ox, oz) < p.y - 9) n.caution = true;
      for (const F of this.features) if (F.kind !== 'dip' && Math.abs(F.s - n.s) < F.L + 4) n.crest = true;
    }

    stageKey() {
      return this.themeKey + '_' + this.seed + '_' + this.km + '_' + this.diffKey;
    }
  }

  G.Track = Track;
})();
