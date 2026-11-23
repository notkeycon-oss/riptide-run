// Go Fast Rally — vehicle dynamics.
// Rigid-body chassis (6 DOF) integrated at 240 Hz. Four ray-cast suspension
// corners with springs, dampers, bump stops and anti-roll bars. A combined-slip
// tyre model (friction circle) driven by per-surface grip curves; wheel spin is
// sub-stepped and the engine/gearbox inertia is reflected into the driven wheels.
// Drivetrain: torque curve, turbo lag, clutch slip on launch, sequential gearbox,
// centre + axle viscous limited-slip differentials. Weight transfer, body roll,
// understeer/oversteer and jumps all emerge from the simulation.
// Local car frame: +X right, +Y up, -Z forward.
(function () {
  const G = window.G;
  const V3 = THREE.Vector3;
  const GRAV = 9.81;
  G.PHYS_DT = 1 / 240;
  G.yawFromHeading = (h) => Math.atan2(-Math.cos(h), -Math.sin(h));

  function interpTorque(curve, rpm) {
    if (rpm <= curve[0][0]) return curve[0][1] * (rpm / curve[0][0]);
    for (let i = 1; i < curve.length; i++) {
      if (rpm <= curve[i][0]) {
        const a = curve[i - 1], b = curve[i];
        return a[1] + ((b[1] - a[1]) * (rpm - a[0])) / (b[0] - a[0]);
      }
    }
    return curve[curve.length - 1][1];
  }

  function tyreShape(s, tail) {
    if (s <= 1) return Math.sin(s * 1.5707963);
    return 1 - (1 - tail) * (1 - Math.exp(-(s - 1) * 1.4));
  }

  class CarPhysics {
    constructor(spec, world, settings) {
      if (!spec.tyre) spec = G.tunedSpec(spec, spec.ups);
      this.spec = spec;
      this.world = world;
      this.settings = settings || {};
      const S = spec;
      this.m = S.mass + 150; // crew + fuel
      const [L, W, H] = S.dims;
      this.L = L; this.W = W; this.H = H;
      const m = this.m, k = 0.8;
      this.I = new V3((m / 12) * (H * H + L * L) * k, (m / 12) * (W * W + L * L) * k, (m / 12) * (W * W + H * H) * k);
      this.invI = new V3(1 / this.I.x, 1 / this.I.y, 1 / this.I.z);
      this.pos = new V3();
      this.vel = new V3();
      this.q = new THREE.Quaternion();
      this.w = new V3();
      this.wheels = [];
      const a = S.wheelbase * (1 - S.cgFront), b = S.wheelbase * S.cgFront;
      const loadF = (m * GRAV * S.cgFront) / 2, loadR = (m * GRAV * (1 - S.cgFront)) / 2;
      for (let i = 0; i < 4; i++) {
        const front = i < 2;
        const sx = i % 2 === 0 ? -1 : 1;
        const z = front ? -a : b;
        const load = front ? loadF : loadR;
        const stat = load / S.spring;
        const r = S.wheelR;
        const y = -S.cgH + r + S.rest - stat;
        this.wheels.push({
          i, front, side: sx,
          mount: new V3((sx * S.track) / 2, y, z),
          r, r0: r,
          steer: front,
          drive: S.drive === 'awd' || (S.drive === 'fwd' && front) || (S.drive === 'rwd' && !front),
          w: 0, rot: 0, comp: stat, compPrev: stat, len: S.rest - stat,
          Fz: load, Fs: 0, contact: false, delta: 0,
          slip: 0, slipLong: 0, slipLat: 0, surf: 'gravel', road: 1,
          cp: new V3(), n: new V3(0, 1, 0), hp: new V3(),
          Td: 0, Tb: 0, Iw: 1.2, gq: {}, lockT: 0,
        });
      }
      this.rpm = S.idle;
      this.gear = 1;
      this.shiftT = 0;
      this.sinceShift = 0;
      this.boost = 0;
      this.clutch = 1;
      this.revTimer = 0;
      this.limiter = false;
      this.steerAngle = 0;
      this.airT = 0;
      this.maxAir = 0;
      this.events = [];
      this.impacts = [];
      this.damage = { engine: 0, radiator: 0, steer: 0, body: 0, susp: [0, 0, 0, 0], punct: [false, false, false, false] };
      this.pullSign = Math.random() < 0.5 ? -1 : 1;
      this.inWater = false;
      this.speed = 0;
      this.fwdSpeed = 0;
      this.input = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
      this.held = false; // held at the start line
      this.weatherGrip = 1;
      this.rainy = false;
      // body contact points (local)
      const yb = -S.cgH + 0.22, yt = H - S.cgH - 0.05;
      const hx = W / 2 - 0.05, hz = L / 2 - 0.05;
      this.bodyPts = [
        new V3(-hx, yb, -hz), new V3(hx, yb, -hz), new V3(-hx, yb, hz), new V3(hx, yb, hz),
        new V3(-hx * 0.8, yt, -hz * 0.45), new V3(hx * 0.8, yt, -hz * 0.45), new V3(-hx * 0.8, yt, hz * 0.55), new V3(hx * 0.8, yt, hz * 0.55),
        new V3(0, yb + 0.15, -hz - 0.05), new V3(0, yb + 0.15, hz + 0.05),
        new V3(-hx, (yb + yt) / 2, 0), new V3(hx, (yb + yt) / 2, 0),
      ];
      this.colList = [];
      // temporaries
      this._t = Array.from({ length: 14 }, () => new V3());
      this._qi = new THREE.Quaternion();
      this.F = new V3();
      this.T = new V3();
      this.right = new V3();
      this.up = new V3();
      this.fwd = new V3();
    }

    damageMult() {
      const d = this.settings.damage;
      return d === 'off' ? 0 : d === 'realistic' ? 1 : 0.5;
    }

    place(x, z, heading, y) {
      const gy = y != null ? y : this.world.heightAt(x, z);
      this.q.setFromAxisAngle(new V3(0, 1, 0), G.yawFromHeading(heading));
      this.pos.set(x, gy + this.spec.cgH + 0.05, z);
      this.vel.set(0, 0, 0);
      this.w.set(0, 0, 0);
      for (const wh of this.wheels) {
        wh.w = 0;
        wh.compPrev = wh.comp;
      }
      this.rpm = this.spec.idle;
      this.gear = 1;
      this.shiftT = 0;
      this.boost = 0;
      this.airT = 0;
      this.inWater = false;
    }

    repair() {
      const d = this.damage;
      d.engine = d.radiator = d.steer = d.body = 0;
      d.susp = [0, 0, 0, 0];
      d.punct = [false, false, false, false];
      for (const w of this.wheels) w.r = w.r0;
    }

    applyIinv(v, out) {
      const qi = this._qi.copy(this.q).invert();
      out.copy(v).applyQuaternion(qi);
      out.x *= this.invI.x;
      out.y *= this.invI.y;
      out.z *= this.invI.z;
      return out.applyQuaternion(this.q);
    }

    addForceAt(F, p) {
      this.F.add(F);
      const r = this._t[12].subVectors(p, this.pos);
      this.T.add(this._t[13].crossVectors(r, F));
    }

    pointVel(p, out) {
      const r = out.subVectors(p, this.pos);
      return out.crossVectors(this.w, r).add(this.vel);
    }

    shift(dir) {
      if (this.shiftT > 0) return;
      const n = this.spec.gears.length;
      if (dir > 0) {
        if (this.gear === -1) this.gear = 1;
        else if (this.gear < n) { this.gear++; this.shiftT = this.spec.shiftTime || 0.12; this.events.push({ type: 'shift' }); if (this.input.throttle < 0.2 || this.rpm > this.spec.redline * 0.85) this.events.push({ type: 'pop' }); }
      } else {
        if (this.gear > 1) { this.gear--; this.shiftT = (this.spec.shiftTime || 0.12) * 0.85; this.events.push({ type: 'shift' }); }
        else if (this.gear === 1 && this.fwdSpeed < 2) this.gear = -1;
      }
    }

    // one fixed physics step
    step(dt) {
      const S = this.spec, wheels = this.wheels, inp = this.input;
      const t = this._t;
      const q = this.q;
      this.right.set(1, 0, 0).applyQuaternion(q);
      this.up.set(0, 1, 0).applyQuaternion(q);
      this.fwd.set(0, 0, -1).applyQuaternion(q);
      const right = this.right, up = this.up, fwd = this.fwd;
      this.F.set(0, -this.m * GRAV, 0);
      this.T.set(0, 0, 0);
      const dm = this.damageMult();
      const D = this.damage;

      const vF = this.vel.dot(fwd);
      this.fwdSpeed = vF;
      this.speed = this.vel.length();

      // ----- controls (auto gearbox, reverse) -----
      let thr = inp.throttle, brk = inp.brake;
      const auto = this.settings.transmission !== 'manual';
      if (auto) {
        if (this.gear > 0 && vF < 1.0 && brk > 0.5 && thr < 0.1) {
          this.revTimer += dt;
          if (this.revTimer > 0.3) { this.gear = -1; this.revTimer = 0; }
        } else if (this.gear === -1 && thr > 0.5 && vF > -1.5) {
          this.gear = 1;
        } else this.revTimer = 0;
      }
      if (auto && this.gear > 0 && this.shiftT <= 0 && !this.held) {
        const n = S.gears.length;
        const rpmNow = this.rpm;
        this.sinceShift += dt;
        // decide on road speed (not wheel speed) so wheelspin doesn't make it hunt
        const rpmG = (Math.abs(vF) / S.wheelR) * S.gears[this.gear - 1] * S.final * 9.5493;
        if (this.gear < n && this.rpm > S.redline * 0.94 && rpmG > S.redline * 0.8 && thr > 0.2 && this.airT === 0) { this.shift(1); this.sinceShift = 0; }
        else if (this.gear > 1) {
          const rpmDown = (rpmG * S.gears[this.gear - 2]) / S.gears[this.gear - 1];
          const th = this.sinceShift < 1.0 ? 0.36 : thr > 0.5 ? 0.52 : 0.44;
          if (rpmG < S.redline * th && rpmDown < S.redline * 0.88) { this.shift(-1); this.sinceShift = 0.5; }
        }
      }
      if (this.gear === -1 && auto) { const tmp = thr; thr = brk; brk = tmp; }
      if (this.held) { brk = 1; }

      // ----- steering -----
      const v = this.speed;
      const assist = this.settings.steerAssist !== false;
      const lock = ((S.steerLock * Math.PI) / 180) * (1 - 0.3 * D.steer * dm);
      let target;
      const arcadeMode = this.settings.handling !== 'sim';
      if (arcadeMode) {
        // Arcade: the stick asks for a turn rate; a controller (below) delivers it.
        // Wheels still steer (for looks and tyre forces) with a speed-sensitive lock.
        const fs = G.SURF[wheels[0].surf] || G.SURF.gravel;
        const muA = fs.mu * S.grip * (S.tyre[G.TYRE_GROUP[wheels[0].surf] || 'gravel'] || 1) * this.weatherGrip;
        const aMax = Math.min(muA * 1.35, 1.25) * GRAV;
        const vv = Math.max(Math.abs(vF), 0.01);
        const rKin = (vv * Math.tan(lock)) / S.wheelbase;
        const rMax = Math.min(rKin, aMax / Math.max(vv, 2));
        this.rMax = rMax;
        this.rCmd = -inp.steer * rMax * (vF < -0.5 ? -1 : 1) * (inp.handbrake > 0.3 ? 1.5 : 1);
        // wheel angle that matches the requested turn, so the front tyres follow the path
        target = G.clamp(Math.atan((-this.rCmd * (vF < -0.5 ? -1 : 1) * S.wheelbase) / Math.max(Math.abs(vF), 2)) * 1.08, -lock, lock);
        this.steerMax = lock;
      } else if (assist) {
        // keep the front tyres at their best slip angle: full stick = the most grip you can use
        const fs = G.SURF[wheels[0].surf] || G.SURF.gravel;
        const arc = this.settings.handling !== 'sim';
        const muF = fs.mu * S.grip * (S.tyre[G.TYRE_GROUP[wheels[0].surf] || 'gravel'] || 1) * this.weatherGrip * (arc ? 1.15 : 1);
        const kin = Math.atan((S.wheelbase * muF * GRAV * (arc ? 1.05 : 0.95)) / Math.max(v * v, 1));
        const dmax = G.clamp(kin + fs.ap * (arc ? 0.35 : 0.85), lock * 0.22, lock);
        target = inp.steer * dmax;
        this.steerMax = dmax;
      } else target = inp.steer * lock * (1 / (1 + (v * v) / 2600));
      if (assist && !arcadeMode && v > 4 && vF > 0) {
        const vr = this.vel.dot(right);
        const slipAng = Math.atan2(vr, Math.max(vF, 1));
        // only help catch real slides (beyond normal cornering slip)
        const dz = 0.12;
        if (Math.abs(slipAng) > dz) target += G.clamp((slipAng - Math.sign(slipAng) * dz) * 0.85, -lock * 0.8, lock * 0.8) * (1 - Math.abs(inp.steer) * 0.3);
      }
      target = G.clamp(target, -lock, lock);
      target += D.steer * dm * 0.06 * this.pullSign;
      const rate = 5.5;
      this.steerAngle += G.clamp(target - this.steerAngle, -rate * dt, rate * dt);
      const delta = this.steerAngle;
      // Ackermann
      const wb = S.wheelbase, tw = S.track;
      let dL = delta, dR = delta;
      if (Math.abs(delta) > 1e-4) {
        const R = wb / Math.tan(Math.abs(delta));
        const inner = Math.atan(wb / Math.max(0.5, R - tw / 2)), outer = Math.atan(wb / (R + tw / 2));
        if (delta > 0) { dR = inner; dL = outer; } else { dL = -inner; dR = -outer; }
      }
      wheels[0].delta = dL; wheels[1].delta = dR; wheels[2].delta = 0; wheels[3].delta = 0;

      // ----- drivetrain -----
      const ng = S.gears.length;
      const ratio = this.gear > 0 ? S.gears[this.gear - 1] * S.final : this.gear < 0 ? -3.1 * S.final : 0;
      let wAvg;
      if (S.drive === 'fwd') wAvg = (wheels[0].w + wheels[1].w) / 2;
      else if (S.drive === 'rwd') wAvg = (wheels[2].w + wheels[3].w) / 2;
      else wAvg = (wheels[0].w + wheels[1].w + wheels[2].w + wheels[3].w) / 4;
      const wheelRpm = Math.abs(wAvg * ratio) * 9.5493;
      const idle = S.idle, red = S.redline;
      let slipping = false;
      let rpm;
      const launchRpm = Math.min(red * 0.62, 4800);
      if (this.shiftT > 0) {
        rpm = G.lerp(this.rpm, Math.max(idle, wheelRpm), 0.3);
        slipping = true;
      } else if (wheelRpm < idle + 300 + thr * (launchRpm - idle - 300)) {
        // clutch slipping (launch / crawling)
        const tgt = Math.max(idle + thr * (launchRpm - idle), wheelRpm);
        rpm = G.damp(this.rpm, tgt, 12, dt);
        slipping = true;
      } else rpm = wheelRpm;
      if (this.held) rpm = G.damp(this.rpm, idle + thr * (red * 0.92 - idle), 6, dt);
      rpm = G.clamp(rpm, idle * 0.85, red * 1.04);
      this.rpm = rpm;
      this.limiter = rpm >= red;
      // turbo
      if (S.turbo > 0) {
        const tgt = thr * G.smoothstep(1800, 4200, rpm);
        const tau = tgt > this.boost ? S.turbo : 0.25;
        const prev = this.boost;
        this.boost += (tgt - this.boost) * Math.min(1, dt / tau);
        if (prev > 0.55 && thr < 0.15 && this.boost < prev) {
          if (!this._bov) { this.events.push({ type: 'bov', amt: prev }); this._bov = true; }
        } else if (thr > 0.4) this._bov = false;
      } else this.boost = 1;
      // anti-lag pops on lift-off at high rpm
      if (thr < 0.1 && this._thrPrev > 0.5 && rpm > red * 0.6) this.events.push({ type: 'pop' });
      this._thrPrev = thr;
      let Te = interpTorque(S.torque, rpm) * thr;
      if (S.turbo > 0) Te *= 0.5 + 0.5 * this.boost;
      Te *= 1 - 0.6 * D.engine * dm;
      if (this.limiter) Te = 0;
      if (!slipping) Te -= (1 - thr) * (6 + 0.05 * S.torque[3][1] * (rpm / red));
      // traction control
      // Arcade: turning hard scrubs some power so holding W mid-corner doesn't push you wide
      if (arcadeMode) Te *= 1 - 0.55 * Math.abs(inp.steer) * G.smoothstep(8, 26, v);
      if ((this.settings.tc || arcadeMode) && thr > 0.1) {
        let spin = 0;
        for (const wh of wheels) if (wh.drive && wh.contact) spin = Math.max(spin, wh.slipLong);
        if (spin > 0.22) Te *= G.clamp(1 - (spin - 0.22) * 3, 0.25, 1);
      }
      if (this.shiftT > 0) { Te = 0; this.shiftT -= dt; }
      if (this.held) Te = 0;
      const Tw = Te * ratio * 0.9;
      const Ie = 0.09;
      const reflected = slipping || this.gear === 0 ? 0 : Ie * ratio * ratio;
      // distribute
      const lsd = S.lsd;
      const axle = (a, b, T) => {
        const lock = G.clamp(lsd * (wheels[a].w - wheels[b].w), -Math.abs(T) * 0.5 - 300, Math.abs(T) * 0.5 + 300);
        wheels[a].Td = T / 2 - lock;
        wheels[b].Td = T / 2 + lock;
      };
      for (const wh of wheels) { wh.Td = 0; wh.Iw = 1.2; }
      if (S.drive === 'awd') {
        const wf = (wheels[0].w + wheels[1].w) / 2, wr = (wheels[2].w + wheels[3].w) / 2;
        const c = G.clamp(260 * (wf - wr), -Math.abs(Tw) * 0.3 - 200, Math.abs(Tw) * 0.3 + 200);
        axle(0, 1, Tw * S.split - c);
        axle(2, 3, Tw * (1 - S.split) + c);
        for (const wh of wheels) wh.Iw += reflected / 4;
      } else if (S.drive === 'fwd') {
        axle(0, 1, Tw);
        wheels[0].Iw += reflected / 2; wheels[1].Iw += reflected / 2;
      } else {
        axle(2, 3, Tw);
        wheels[2].Iw += reflected / 2; wheels[3].Iw += reflected / 2;
      }
      // brakes
      const bT = S.brake * 1.75 * brk;
      for (const wh of wheels) {
        wh.Tb = wh.front ? (bT * S.bias) / 2 : (bT * (1 - S.bias)) / 2;
        if (this.settings.abs !== false && brk > 0.05 && wh.slipLong < -0.12 && wh.contact) wh.Tb *= 0.35;
        if (!wh.front) wh.Tb += inp.handbrake * 2600;
        wh.Tb += 25; // bearing/rolling drag
      }

      // ----- suspension pass -----
      const W = this.world;
      let grounded = 0;
      for (const wh of wheels) {
        const hp = wh.hp.copy(wh.mount).applyQuaternion(q).add(this.pos);
        const g = wh.gq;
        wh.contact = false;
        if (up.y < 0.25) { wh.comp = 0; wh.compPrev = 0; continue; }
        // intersect the suspension ray with the ground
        W.groundAt(hp.x, hp.z, g);
        let tt = (hp.y - g.y) / up.y;
        const px = hp.x - up.x * tt, pz = hp.z - up.z * tt;
        W.groundAt(px, pz, g);
        const n = wh.n.set(g.nx, g.ny, g.nz);
        // plane point: (px, g.y, pz); distance hp->plane along normal
        const dpl = (hp.x - px) * n.x + (hp.y - g.y) * n.y + (hp.z - pz) * n.z;
        const un = up.dot(n);
        const rest = S.rest;
        let len = (dpl - wh.r) / Math.max(0.3, un);
        wh.surf = g.surf;
        wh.road = g.road;
        if (g.water) this.inWater = true;
        if (len >= rest) {
          wh.len = rest;
          wh.compPrev = wh.comp;
          wh.comp = 0;
          continue;
        }
        wh.contact = true;
        grounded++;
        if (len < 0.02) len = 0.02;
        wh.len = len;
        wh.compPrev = wh.comp;
        wh.comp = rest - len;
        // contact point
        wh.cp.copy(hp).addScaledVector(up, -len).addScaledVector(n, -wh.r);
      }
      // spring/damper + anti-roll
      const arb = [S.arbF, S.arbR];
      for (let ax = 0; ax < 2; ax++) {
        const a = wheels[ax * 2], b = wheels[ax * 2 + 1];
        const diff = a.comp - b.comp;
        a.arb = a.contact || b.contact ? arb[ax] * diff : 0;
        b.arb = -a.arb;
      }
      for (const wh of wheels) {
        if (!wh.contact) { wh.Fz = 0; wh.Fs = 0; continue; }
        const sd = 1 - 0.45 * D.susp[wh.i] * dm;
        const k = S.spring * sd, c = S.damper * sd;
        const cvRaw = (wh.comp - wh.compPrev) / dt;
        // clamp the rate: a wheel jumping onto a ledge must not produce an impulse spike
        const cv = G.clamp(cvRaw, -4, 4);
        let Fs = k * wh.comp + (cv > 0 ? c * cv : c * 0.7 * cv) + wh.arb;
        if (wh.comp > S.travel) {
          const over = Math.min(0.08, wh.comp - S.travel);
          Fs += k * 8 * over + c * 1.5 * Math.max(cv, 0);
          if (cvRaw > 2.2 && !this._bottomed) this.events.push({ type: 'bottom', v: Math.min(cvRaw, 12) });
          this._bottomed = true;
        } else this._bottomed = false;
        if (Fs < 0) Fs = 0;
        if (Fs > this.m * GRAV * 5) Fs = this.m * GRAV * 5;
        wh.Fs = Fs;
        wh.Fz = Fs * Math.max(0.3, up.dot(wh.n));
        this.addForceAt(t[0].copy(up).multiplyScalar(Fs), wh.hp);
      }

      // ----- tyres -----
      const Fz0 = (this.m * GRAV) / 4;
      for (const wh of wheels) {
        if (!wh.contact) {
          // free wheel: torque spins it up, brakes slow it
          wh.w += ((wh.Td - Math.sign(wh.w) * Math.min(Math.abs(wh.w) * wh.Iw / dt, wh.Tb)) / wh.Iw) * dt;
          wh.slip = 0; wh.slipLong = 0; wh.slipLat = 0;
          continue;
        }
        const n = wh.n;
        const wf = t[1].copy(fwd).multiplyScalar(Math.cos(wh.delta)).addScaledVector(right, Math.sin(wh.delta));
        wf.addScaledVector(n, -wf.dot(n)).normalize();
        const wr = t[2].crossVectors(wf, n);
        const vp = this.pointVel(wh.cp, t[3]);
        const vLong = vp.dot(wf), vLat = vp.dot(wr);
        const sf2 = G.SURF[wh.surf] || G.SURF.gravel;
        let mu = sf2.mu * S.grip * this.weatherGrip * (S.tyre[G.TYRE_GROUP[wh.surf] || 'gravel'] || 1);
        if (this.rainy) mu *= G.RAIN_GRIP[wh.surf] || 1;
        if (D.punct[wh.i]) mu *= 0.5;
        if (!wh.front) mu *= 1.06; // a touch more rear grip keeps the car stable, like a road-tuned rally car
        mu *= G.clamp(1 - 0.09 * (wh.Fz / Fz0 - 1), 0.72, 1.12);
        const den = Math.max(Math.abs(vLong), 3.5);
        const arcade = this.settings.handling !== 'sim';
        // arcade: the tyre model only handles drive/braking; sideways grip is done below
        const sy = arcade ? 0 : vLat / den / Math.tan(sf2.ap);
        const kp = sf2.kp;
        const Fmax = mu * wh.Fz;
        const nsub = 6, h = dt / nsub;
        let fxA = 0, fyA = 0;
        const r = wh.r;
        for (let s = 0; s < nsub; s++) {
          const kappa = (wh.w * r - vLong) / den;
          const sx = kappa / kp;
          const sl = Math.sqrt(sx * sx + sy * sy);
          let Fx = 0, Fy = 0;
          if (sl > 1e-6) {
            const f = (Fmax * tyreShape(sl, sf2.tail)) / sl;
            Fx = f * sx * 1.05;
            Fy = -f * sy;
          }
          wh.w += ((wh.Td - Fx * r) / wh.Iw) * h;
          const dB = (wh.Tb * h) / wh.Iw;
          if (Math.abs(wh.w) <= dB) wh.w = 0;
          else wh.w -= Math.sign(wh.w) * dB;
          fxA += Fx;
          fyA += Fy;
          if (s === nsub - 1) {
            wh.slipLong = kappa;
            wh.slipLat = sy * Math.tan(sf2.ap);
            wh.slip = sl;
          }
        }
        const Fx = fxA / nsub;
        let Fy = fyA / nsub;
        if (arcade) {
          // Arcade grip: stiff and predictable right up to the limit, then a steady slide
          // (no sudden let-go). Wheelspin/braking uses a little of the sideways grip.
          let cap = Math.min(mu * 1.35, 1.3) * wh.Fz;
          if (!wh.front && inp.handbrake > 0.3) cap *= 0.42;
          const use = Math.min(1, Math.abs(Fx) / Math.max(cap, 1));
          cap *= Math.sqrt(Math.max(0.75, 1 - use * use * 0.35));
          Fy = G.clamp((-vLat * cap) / 0.75, -cap, cap);
          wh.slipLat = vLat / Math.max(Math.abs(vLong), 1);
          wh.slip = Math.hypot(wh.slipLong / kp, Math.abs(vLat) / 1.4);
        }
        const rr = -sf2.rr * wh.Fz * Math.tanh(vLong / 0.6);
        const Ft = t[4].copy(wf).multiplyScalar(Fx + rr).addScaledVector(wr, Fy);
        if (this.settings.handling !== 'sim') {
          // arcade: side forces act higher up (closer to the centre of mass), so the car leans but doesn't tip
          this.addForceAt(t[4].copy(wf).multiplyScalar(Fx + rr), wh.cp);
          this.addForceAt(t[5].copy(wr).multiplyScalar(Fy), t[6].copy(wh.cp).addScaledVector(up, 0.32));
        } else this.addForceAt(Ft, wh.cp);
      }
      // wheel visual rotation
      for (const wh of wheels) wh.rot += wh.w * dt;

      // ----- body contacts with the ground -----
      const kb = this.m * 520, cb = this.m * 32;
      const gq = this._gq || (this._gq = {});
      for (let i = 0; i < this.bodyPts.length; i++) {
        const p = t[5].copy(this.bodyPts[i]).applyQuaternion(q).add(this.pos);
        W.groundAt(p.x, p.z, gq);
        if (p.y >= gq.y) continue;
        const n = t[6].set(gq.nx, gq.ny, gq.nz);
        const pen = Math.min(0.3, (gq.y - p.y) * n.y);
        const vp = this.pointVel(p, t[7]);
        const vn = vp.dot(n);
        const vnc = G.clamp(vn, -10, 4);
        let Fn = kb * pen - cb * Math.min(vnc, 0) - cb * 0.25 * Math.max(vnc, 0);
        if (Fn < 0) Fn = 0;
        if (Fn > this.m * GRAV * 7) Fn = this.m * GRAV * 7;
        const Fb = t[8].copy(n).multiplyScalar(Fn);
        const vt = t[9].copy(vp).addScaledVector(n, -vn);
        const vtl = vt.length();
        if (vtl > 0.01) {
          const ff = Math.min(0.55 * Fn, vtl * this.m * 4);
          Fb.addScaledVector(vt, -ff / vtl);
        }
        this.addForceAt(Fb, p);
        if (vn < -5.5) this._impact(-vn, this.bodyPts[i], 'ground');
        if (gq.water) this.inWater = true;
      }

      // ----- obstacles (trees, rocks, rails) -----
      this._obstacles(dt);

      // ----- Arcade turn-rate controller: you always get the turn you ask for (within grip) -----
      if (arcadeMode && grounded >= 2) {
        const r = this.w.dot(up);
        const k = inp.handbrake > 0.3 ? 3 : 9;
        this.T.addScaledVector(up, G.clamp((this.rCmd - r) * k, -14, 14) * this.I.y);
        // tyre scrub: hard cornering bleeds speed, so a held turn stays tight
        if (v > 3) {
          const aLat = Math.abs(r * vF);
          this.F.addScaledVector(this.vel, (-this.m * aLat * 0.3 * Math.abs(inp.steer)) / v);
        }
      }
      // ----- stability control (part of steering assist, sim mode): stops the car over-rotating -----
      if (!arcadeMode && assist && v > 5 && this.airT === 0 && vF > 2) {
        const r = this.w.dot(up);
        let rd = (-vF * Math.tan(this.steerAngle)) / S.wheelbase;
        const rmax = (11 / Math.max(v, 1));
        rd = G.clamp(rd, -rmax, rmax);
        const e = r - rd;
        if (Math.abs(r) > Math.abs(rd) + 0.08 && Math.sign(e) === Math.sign(r)) {
          this.T.addScaledVector(up, -G.clamp(e, -1.5, 1.5) * this.I.y * 2.2 * (1 - inp.handbrake * 0.85));
        }
      }

      // ----- aero -----
      const vl = this.speed;
      this.F.addScaledVector(this.vel, -0.5 * 1.2 * S.cda * vl);
      this.F.addScaledVector(up, -0.5 * 1.2 * 0.25 * vl * vl);
      this.T.addScaledVector(this.w, -25);

      // ----- integrate -----
      this.vel.addScaledVector(this.F, dt / this.m);
      const dw = this.applyIinv(this.T, t[10]);
      this.w.addScaledVector(dw, dt);
      if (this.w.lengthSq() > 225) this.w.setLength(15);
      if (this.vel.lengthSq() > 8100) this.vel.setLength(90);
      this.pos.addScaledVector(this.vel, dt);
      const wq = this._wq || (this._wq = new THREE.Quaternion());
      wq.set(this.w.x * dt * 0.5, this.w.y * dt * 0.5, this.w.z * dt * 0.5, 0);
      wq.multiply(q);
      q.x += wq.x; q.y += wq.y; q.z += wq.z; q.w += wq.w;
      q.normalize();

      // airtime
      if (grounded === 0) {
        this.airT += dt;
        this.maxAir = Math.max(this.maxAir, this.airT);
      } else {
        if (this.airT > 0.45) this.events.push({ type: 'land', air: this.airT, v: -this.vel.y });
        this.airT = 0;
      }
      // overheating
      if (D.radiator > 0.3 && dm > 0) D.engine = Math.min(1, D.engine + dt * 0.003 * D.radiator * thr);
    }

    _obstacles() {
      const S = this.spec;
      const t = this._t;
      const list = this.world.queryCols(this.pos.x, this.pos.z, this.colList);
      if (!list.length) return;
      const R = this.W * 0.5;
      const bottom = this.pos.y - S.cgH + 0.15;
      for (let ci = -1; ci <= 1; ci++) {
        const c = t[5].set(0, 0, ci * this.L * 0.32).applyQuaternion(this.q).add(this.pos);
        for (const col of list) {
          if (bottom > col.y0 + col.h) continue;
          let nx, nz, dist;
          if (col.x1 !== undefined) {
            const ex = col.x2 - col.x1, ez = col.z2 - col.z1;
            const l2 = ex * ex + ez * ez || 1;
            const u = G.clamp(((c.x - col.x1) * ex + (c.z - col.z1) * ez) / l2, 0, 1);
            nx = c.x - (col.x1 + ex * u);
            nz = c.z - (col.z1 + ez * u);
          } else {
            nx = c.x - col.x;
            nz = c.z - col.z;
          }
          dist = Math.sqrt(nx * nx + nz * nz);
          const pen = R + col.r - dist;
          if (pen <= 0 || dist < 1e-4) continue;
          nx /= dist; nz /= dist;
          const n = t[6].set(nx, 0, nz);
          const cp = t[7].set(c.x - nx * R, c.y, c.z - nz * R);
          const vp = this.pointVel(cp, t[8]);
          const vn = vp.dot(n);
          this.pos.x += nx * pen * 0.9;
          this.pos.z += nz * pen * 0.9;
          if (vn >= 0) continue;
          const r = t[9].subVectors(cp, this.pos);
          const rxn = t[10].crossVectors(r, n);
          const iv = this.applyIinv(rxn, t[11]);
          const denom = 1 / this.m + t[12].crossVectors(iv, r).dot(n);
          const e = col.kind === 'rail' ? 0.15 : 0.25;
          const j = (-(1 + e) * vn) / denom;
          const J = t[13].copy(n).multiplyScalar(j);
          // friction impulse
          const vt = vp.clone().addScaledVector(n, -vn);
          const vtl = vt.length();
          if (vtl > 0.01) J.addScaledVector(vt, -Math.min(0.35 * j, (vtl * this.m) / 3) / vtl);
          this.vel.addScaledVector(J, 1 / this.m);
          const dw = this.applyIinv(t[10].crossVectors(r, J), t[11]);
          this.w.add(dw);
          const local = cp.clone().sub(this.pos).applyQuaternion(this._qi.copy(this.q).invert());
          this._impact(-vn, local, col.kind);
        }
      }
    }

    _impact(speed, local, kind) {
      if (speed < 3.5) return;
      const now = performance.now();
      if (this._lastImp && now - this._lastImp < 120 && speed < this._lastImpV * 1.3) return;
      this._lastImp = now;
      this._lastImpV = speed;
      this.events.push({ type: 'impact', v: speed, kind });
      const dm = this.damageMult();
      const amt = G.clamp((speed - 4) / 20, 0, 1);
      if (amt <= 0) return;
      this.impacts.push({ p: local.clone(), amt });
      if (dm <= 0) return;
      const D = this.damage;
      const a = amt * dm;
      D.body = Math.min(1, D.body + a * 0.6);
      const L = this.L;
      if (local.z < -L * 0.25) {
        D.radiator = Math.min(1, D.radiator + a * 0.7);
        D.engine = Math.min(1, D.engine + a * 0.25);
        D.steer = Math.min(1, D.steer + a * 0.3);
      }
      // nearest wheel takes suspension damage
      let best = 0, bd = 1e9;
      for (const w of this.wheels) {
        const d = w.mount.distanceToSquared(local);
        if (d < bd) { bd = d; best = w.i; }
      }
      if (bd < 1.6) {
        D.susp[best] = Math.min(1, D.susp[best] + a * 0.7);
        if (this.wheels[best].front) D.steer = Math.min(1, D.steer + a * 0.3);
        if ((kind === 'rock' || kind === 'ground') && Math.random() < a * 0.7 && !D.punct[best]) {
          D.punct[best] = true;
          this.wheels[best].r = this.wheels[best].r0 - 0.035;
          this.events.push({ type: 'puncture', wheel: best });
        }
      }
    }

    // world-space helpers for rendering / AI
    heading() {
      const f = this._t[0].set(0, 0, -1).applyQuaternion(this.q);
      return Math.atan2(f.z, f.x);
    }
  }

  G.CarPhysics = CarPhysics;
})();
