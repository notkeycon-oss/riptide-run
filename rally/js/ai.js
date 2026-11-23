// Go Fast Rally — autopilot driver (menu demo, end-of-stage cool-down, test harness).
(function () {
  const G = window.G;

  class AIDriver {
    constructor(track, skill) {
      this.track = track;
      this.skill = skill == null ? 0.9 : skill;
      this.hint = 0;
      this.q = {};
      this.p = {};
      this.stuck = 0;
      this.stopping = false;
      this.out = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
    }
    reset(hint) {
      this.hint = hint || 0;
      this.stuck = 0;
    }
    drive(ph, dt) {
      const tr = this.track;
      const q = tr.nearestLocal(ph.pos.x, ph.pos.z, this.hint, 30, this.q);
      if (q.i < 0) return this.out;
      this.hint = q.i;
      const s = q.s;
      const v = ph.speed;
      const Ld = 6.5 + v * 0.5;
      const p = tr.pointAt(s + Ld, this.p);
      // aim slightly to the inside of the bend ahead
      const kAhead = tr.k[Math.min(tr.n2 - 1, p.i)] || 0;
      const inside = G.clamp(kAhead * 60, -1, 1) * p.hw * 0.35;
      const rx = -Math.sin(p.h), rz = Math.cos(p.h);
      const tx = p.x + rx * inside, tz = p.z + rz * inside;
      const dx = tx - ph.pos.x, dz = tz - ph.pos.z;
      // steer relative to where the car is actually going (velocity), then add the
      // body slip back in: this countersteers naturally when the rear steps out
      const vf = ph.vel.x * ph.fwd.x + ph.vel.z * ph.fwd.z;
      const vr = ph.vel.x * ph.right.x + ph.vel.z * ph.right.z;
      const beta = v > 3 && vf > 0 ? Math.atan2(vr, vf) : 0;
      const lx = dx * ph.right.x + dz * ph.right.z;
      const lz = dx * ph.fwd.x + dz * ph.fwd.z;
      const alpha = Math.atan2(lx, Math.max(0.1, lz));
      this.beta = beta;
      const S = ph.spec;
      let delta = Math.atan((2 * S.wheelbase * Math.sin(alpha)) / Ld);
      // catch big slides by steering into them
      if (Math.abs(beta) > 0.15) delta += (beta - Math.sign(beta) * 0.15) * 0.8;
      // the physics applies a speed-sensitive steering limit, undo it here
      const lock = (S.steerLock * Math.PI) / 180;
      const sf = ph.settings.steerAssist !== false ? 1 / (1 + (v * v) / 1100) : 1 / (1 + (v * v) / 2600);
      let steer = G.clamp(delta / (lock * sf), -1, 1);
      // arcade handling takes a turn rate, not a wheel angle
      if (ph.settings.handling !== 'sim' && ph.rMax > 0.01) {
        const kappa = (2 * Math.sin(alpha)) / Ld;
        steer = G.clamp((Math.max(v, 2) * kappa) / ph.rMax, -1, 1);
      }
      // target speed from the stage speed limits ahead
      const i0 = Math.floor(s / tr.DS);
      const ab = 6.0 * this.skill * (G.SURF[tr.surface].mu / 0.9);
      let vt = 60;
      const n = Math.min(tr.n - 2, i0 + 110);
      for (let j = i0; j < n; j++) {
        const dd = (j - i0) * tr.DS;
        const lim = tr.vlim[j] * this.skill;
        const vv = Math.sqrt(lim * lim + 2 * ab * dd);
        if (vv < vt) vt = vv;
      }
      if (this.stopping) vt = 0;
      const err = vt - v;
      let thr = 0, brk = 0;
      if (err > 0) thr = G.clamp(err * 0.45 + 0.35, 0, 1);
      else brk = G.clamp(-err * 0.22, 0, 1);
      // mid-slide: no brakes, gentle throttle to keep the rear loaded
      const slide = Math.abs(beta);
      if (slide > 0.14 && !this.stopping) {
        brk = Math.min(brk, 0.1);
        thr = Math.max(thr * 0.6, 0.3);
      }
      // stopped: hold it on the handbrake (holding the brake would select reverse)
      let hb = 0;
      if (this.stopping && v < 2) { thr = 0; brk = v < 1 ? 0 : 1; hb = 1; }
      // off line: slow down
      if (q.dist > q.hw) thr *= 0.6;
      // stuck recovery
      if (!this.stopping && v < 1.2 && thr > 0.3) this.stuck += dt;
      else this.stuck = Math.max(0, this.stuck - dt);
      this.out.throttle = thr;
      this.out.brake = brk;
      this.out.steer = steer;
      this.out.handbrake = hb;
      this.s = s;
      return this.out;
    }
  }

  G.AIDriver = AIDriver;
})();
