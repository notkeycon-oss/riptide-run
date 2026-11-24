// Go Fast Rally — a stage session: loading, countdown, driving, timing, pace notes,
// ghosts, replays, resets, results. Also runs the menu demo (AI driving).
(function () {
  const G = window.G;
  const V3 = THREE.Vector3;
  const REC_HZ = 30;
  const GHOST_HZ = 10;

  // medal times from the reference lap (calibrated against the autopilot)
  G.medalTimes = function (track) {
    const base = { forest: 1.17, canyon: 1.18, alpine: 1.3, coast: 1.17 }[track.themeKey] || 1.18;
    const d = track.diffKey === 'brutal' ? 1.06 : track.diffKey === 'technical' ? 1.02 : 1;
    const g = track.refTime * base * d;
    return { gold: g, silver: g * 1.12, bronze: g * 1.28 };
  };
  G.medalFor = function (t, m) {
    if (t == null) return 0;
    return t <= m.gold ? 3 : t <= m.silver ? 2 : t <= m.bronze ? 1 : 0;
  };
  G.rivalField = function (track, key) {
    const m = G.medalTimes(track);
    const r = G.rng(G.hashStr(key));
    const names = G.RIVALS.slice();
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    const cars = ['Vortex R5', 'Vortex R5', 'Havoc B', 'Sprite R2', 'Mistral 77', 'Atlas Raid'];
    const out = [];
    for (let i = 0; i < 11; i++) out.push({ name: names[i], car: cars[Math.floor(r() * cars.length)], t: m.gold * (0.975 + i * 0.027 + r() * 0.018) });
    out.sort((a, b) => a.t - b.t);
    return out;
  };

  class Session {
    constructor(app, cfg) {
      this.app = app;
      this.cfg = cfg;
      this.demo = !!cfg.demo;
      this.state = 'loading';
      this.acc = 0;
      this.t = 0; // stage clock (from GO)
      this.pen = 0;
      this.resets = 0;
      this.sCur = 0;
      this.sMax = 0;
      this.hint = 0;
      this.splitTimes = [];
      this.splitIdx = 0;
      this.callIdx = 0;
      this.offT = 0;
      this.flipT = 0;
      this.wrongT = 0;
      this.stuckT = 0;
      this.resetCool = 0;
      this.rec = [];
      this.recT = 0;
      this.ghostRec = [];
      this.topSpeed = 0;
      this.maxAir = 0;
      this.jumps = 0;
      this.tmpQ = {};
      this.tmpQ2 = {};
      this.tmpP = {};
      this.v = [new V3(), new V3(), new V3()];
      this.timeLeft = 0;
      this.cpIdx = 0;
      this.demoCam = 'tv';
      this.demoCamT = 0;
    }

    get settings() {
      return G.save.data.settings;
    }

    async load(onProgress) {
      const app = this.app, cfg = this.cfg, st = cfg.stage;
      this.track = new G.Track({ seed: st.seed, theme: st.theme, km: st.km, diff: st.diff });
      this.key = this.track.stageKey();
      this.world = new G.World({ scene: app.scene, track: this.track, time: st.time, weather: st.weather, quality: app.quality });
      const ups = this.demo ? {} : G.save.ups(cfg.carId);
      this.spec = G.tunedSpec(G.carById(cfg.carId), ups);
      const physSettings = this.demo ? { transmission: 'auto', steerAssist: false, abs: true, tc: false, damage: 'off', handling: 'arcade' } : this.settings;
      this.ph = new G.CarPhysics(this.spec, this.world, physSettings);
      this.ph.rainy = !!G.WEATHER[st.weather].rain;
      const p = this.track.pointAt(this.track.START - 5.5, this.tmpP);
      this.ph.place(p.x, p.z, p.h);
      this.hint = p.i;
      this.model = new G.CarModel(this.spec, cfg.livery, { night: this.world.night });
      this.ph.bonnetLocal = this.model.bonnetLocal;
      this.ph.eyeLocal = this.model.eyeLocal;
      app.scene.add(this.model.group);
      this.fx = new G.FX(app.scene, app.quality);
      this.fx.setEnv(this.world, app.camera, app.renderer);
      this.ai = new G.AIDriver(this.track, this.demo ? 0.72 : 0.7);
      this.ai.reset(p.i);
      if (cfg.damage) {
        Object.assign(this.ph.damage, JSON.parse(JSON.stringify(cfg.damage)));
        // rally events: the dents you carried over are still on the car
        const b = cfg.damage.body || 0;
        if (b > 0.05) for (let k = 0; k < 3; k++) this.model.deform(new V3((Math.random() - 0.5) * 1.8, 0.1, (Math.random() - 0.5) * 3.6), Math.min(1, b * 0.9));
      }
      if (!this.track.endless) this.medals = G.medalTimes(this.track);
      // ghost of your best run
      this.best = G.save.data.bests[this.key] || null;
      if (!this.demo && !this.track.endless) {
        // a downloaded leaderboard ghost wins over your own best
        const gd = cfg.netGhost || G.save.ghost(this.key);
        this.ghostName = cfg.netGhost ? cfg.netGhost.n || 'GHOST' : 'YOUR BEST';
        if (gd && gd.f && gd.f.length) {
          this.ghost = { d: gd, model: new G.CarModel(G.carById(gd.car), null, { ghost: true }) };
          app.scene.add(this.ghost.model.group);
          this.ghost.model.group.visible = false;
        }
      }
      // notes list includes the finish call
      if (!this.track.endless) this.track.notes.push({ s: this.track.finishS - 120, kind: 'finish', mods: [], dist: 0 });
      this.track.notes.sort((a, b) => a.s - b.s);
      await this.world.prime(p.x, p.z, onProgress);
      // settle the car on its springs
      this.ph.held = true;
      for (let i = 0; i < 240; i++) this.ph.step(G.PHYS_DT);
      this.ph.events.length = 0;
      this.ph.impacts.length = 0;
      this.model.update(this.ph);
      if (this.demo) {
        this.ph.held = false;
        this.state = 'demo';
      } else this.state = 'ready';
      app.rig.reset();
      if (this.world.startLights) for (const l of this.world.startLights) l.material.color.setHex(0x330a0a);
    }

    // ----- countdown -----
    start() {
      this.state = 'countdown';
      this.cd = 0;
      this.cdStep = -1;
      this.ph.held = true;
      if (this.track.endless) this.timeLeft = 75;
      G.audio.startEngine(this.spec);
      this.app.hud.setStage(this.cfg.stage.name || G.THEMES[this.cfg.stage.theme].name, this.track.endless ? [] : this.track.splits.map((s) => (s - this.track.START) / this.track.length), !this.track.endless);
      this.lastCallS = -1;
    }

    _countdown(dt) {
      this.cd += dt;
      const step = Math.floor(this.cd / 0.7);
      if (step !== this.cdStep) {
        this.cdStep = step;
        const L = this.world.startLights || [];
        if (step >= 1 && step <= 5) {
          if (L[step - 1]) L[step - 1].material.color.setHex(0xff2020);
          if (step >= 3) this.app.hud.flash(String(6 - step), 0.6);
          G.audio.beep(false);
        }
        if (step === 6) {
          for (const l of L) l.material.color.setHex(0x22ff55);
          this.app.hud.flash('GO!', 0.9, '#3ddc84');
          G.audio.beep(true);
          this.ph.held = false;
          this.state = 'run';
          this.t = 0;
          this._callNotes(true);
        }
      }
      if (step === 1 && !this._firstCall) {
        this._firstCall = true;
        // co-driver reads the first notes before the start
        this._callNotes(true);
      }
    }

    // ----- pace notes -----
    _callNotes(force) {
      const tr = this.track, notes = tr.notes;
      const v = this.ph.speed;
      const ahead = { early: 4.4, normal: 3.4, late: 2.6 }[this.settings.callTiming] || 3.4;
      const dist = force ? 160 : G.clamp(v * ahead, 75, 230);
      while (this.callIdx < notes.length && notes[this.callIdx].s < this.sCur - 5) this.callIdx++;
      if (this.callIdx >= notes.length) return;
      const n = notes[this.callIdx];
      if (n.s - this.sCur > dist) return;
      // group linked notes into one call
      let text = '';
      let k = this.callIdx;
      for (let g = 0; g < 3 && k < notes.length; g++) {
        const m = notes[k];
        tr.annotate(m);
        text += (text ? ' ' : '') + tr.noteText(m);
        if (m.dist) text += ', ' + m.dist;
        k++;
        if (m.link && k < notes.length) text += ' ' + m.link;
        else break;
      }
      this.callIdx = k;
      if (!this.demo) G.audio.say(text);
    }

    // ----- reset to road -----
    resetCar(reason, penalty) {
      const tr = this.track;
      const s = Math.max(tr.START - 5, this.sCur - 4);
      const p = tr.pointAt(s, this.tmpP);
      this.ph.place(p.x, p.z, p.h);
      this.hint = p.i;
      this.ai.reset(p.i);
      this.app.rig.reset();
      this.offT = this.flipT = this.stuckT = 0;
      this.resetCool = 1.0;
      this.fx.skids.last = [null, null, null, null];
      if (!this.demo && this.state === 'run') {
        this.resets++;
        G.save.data.stats.resets++;
        const pp = penalty == null ? 5 : penalty;
        if (tr.endless) this.timeLeft -= pp;
        else this.pen += pp;
        this.app.hud.flashSub(`<span style="color:#ff6b5e">${reason || 'RESET'} · +${pp}s</span>`, 1.8);
      }
    }

    // ----- progress -----
    _progress() {
      const tr = this.track, ph = this.ph;
      let q = tr.nearestLocal(ph.pos.x, ph.pos.z, this.hint, 40, this.tmpQ);
      if (q.i < 0 || q.dist > 22) {
        const g = tr.nearest(ph.pos.x, ph.pos.z, 64, this.tmpQ2, false);
        if (g.i >= 0 && (q.i < 0 || g.dist < q.dist - 4)) {
          if (g.s > this.sMax + 70 && this.state === 'run' && !this.demo) {
            this.resetCar('SHORTCUT', 5);
            return this.tmpQ;
          }
          q = g;
        }
      }
      if (q.i >= 0) {
        this.hint = q.i;
        this.sCur = q.s;
        this.dist = q.dist;
        this.roadQ = q;
        if (this.sCur > this.sMax && this.sCur < this.sMax + 70) this.sMax = this.sCur;
      }
      return q;
    }

    // ----- main update -----
    update(dt) {
      const app = this.app, ph = this.ph, tr = this.track, hud = app.hud;
      const inp = G.input;
      if (this.state === 'replay') return this._replay(dt);
      if (this.state === 'ready') {
        this._render(dt, true);
        return;
      }
      if (tr.endless) tr.ensure(this.sCur + 2600);
      // controls
      let I;
      if (this.demo || this.state === 'finished') I = this.ai.drive(ph, dt);
      else I = inp.poll(dt);
      if (!this.demo) {
        if (inp.take('camera')) {
          app.rig.mode = (app.rig.mode + 1) % G.CAM_NAMES.length;
          this.settings.camera = app.rig.mode;
          app.rig.reset();
          hud.toast(G.CAM_NAMES[app.rig.mode] + ' CAM');
        }
        if (inp.take('ghost')) {
          const order = ['on', 'faint', 'off'];
          const S2 = this.settings;
          S2.ghost = order[(order.indexOf(S2.ghost || 'on') + 1) % 3];
          G.save.write();
          hud.toast('GHOST: ' + { on: 'SHOW', faint: 'FAINT', off: 'HIDDEN' }[S2.ghost]);
        }
        if (inp.take('shiftUp')) ph.shift(1);
        if (inp.take('shiftDown')) ph.shift(-1);
        if (this.state === 'run' && inp.take('reset') && this.resetCool <= 0) this.resetCar('RESET');
      }
      ph.input.throttle = I.throttle;
      ph.input.brake = I.brake;
      ph.input.steer = I.steer;
      ph.input.handbrake = I.handbrake;
      if (this.state === 'countdown') this._countdown(dt);
      // physics
      this.acc += Math.min(dt, 0.05);
      let steps = 0;
      while (this.acc >= G.PHYS_DT && steps < 14) {
        ph.step(G.PHYS_DT);
        this.acc -= G.PHYS_DT;
        steps++;
      }
      this._events();
      this.resetCool -= dt;
      const q = this._progress();
      this._extras(dt);
      // clocks
      if (this.state === 'run') {
        this.t += dt;
        if (tr.endless) {
          this.timeLeft -= dt;
          if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this._finish(true);
          }
        }
        this.topSpeed = Math.max(this.topSpeed, ph.speed);
        this._checkpoints();
        this._callNotes(false);
        this._autoReset(dt, q);
        this._record(dt);
      }
      if (this.demo) this._demoLogic(dt, q);
      if (this.state === 'finished') {
        this.finT += dt;
        if (this.finT > 1.2) this.ai.stopping = true;
        if (this.finT > 3.2 && !this.resultsShown) {
          this.resultsShown = true;
          app.onStageDone(this.result);
        }
      }
      this._render(dt, false);
    }

    _events() {
      const ph = this.ph;
      for (const e of ph.events) {
        if (e.type === 'impact') {
          G.audio.impact(e.v);
          this.app.rig.bump(Math.min(1, e.v / 12));
          if (e.kind === 'rock' || e.kind === 'rail' || e.kind === 'post') this.fx.sparks(ph.pos, ph.vel, Math.min(30, e.v * 2));
          if (e.v > 9 && !this.demo && ph.damageMult() > 0) this.app.hud.toast('HEAVY DAMAGE', 1.2);
        } else if (e.type === 'land') {
          G.audio.land(e.v);
          this.app.rig.bump(Math.min(0.8, e.v / 10));
          this.fx.burst(ph.pos, 10 + Math.min(20, e.air * 12));
          if (!this.demo && this.state === 'run') {
            this.jumps++;
            G.save.data.stats.jumps++;
            if (e.air > 0.9) this.app.hud.toast('BIG AIR  ' + e.air.toFixed(1) + 's', 1.2);
          }
        } else if (e.type === 'pop') {
          if (Math.random() < 0.8) {
            G.audio.pop();
            this.fx.flame(this.model, ph);
            if (Math.random() < 0.5) setTimeout(() => { G.audio.pop(); }, 70 + Math.random() * 80);
          }
        } else if (e.type === 'bov') G.audio.bov(e.amt);
        else if (e.type === 'shift') G.audio.shift();
        else if (e.type === 'puncture') {
          G.audio.puncture();
          if (!this.demo) this.app.hud.flashSub('<span style="color:#ff6b5e">PUNCTURE!</span>', 2);
        } else if (e.type === 'bottom') G.audio.land(e.v * 0.4);
      }
      this.maxAir = Math.max(this.maxAir, ph.maxAir);
      ph.events.length = 0;
    }

    // dirt build-up, water splashes and parts that fell off
    _extras(dt) {
      const ph = this.ph, tr = this.track, fx = this.fx;
      // dirt: loose surfaces cake the car, tarmac only a little
      if (this.dirt == null) {
        this.dirt = 0;
        const C = { forest: [0.33, 0.26, 0.17], canyon: [0.64, 0.37, 0.21], alpine: [0.9, 0.93, 0.97], coast: [0.52, 0.5, 0.45] }[tr.themeKey] || [0.4, 0.32, 0.22];
        const wet = this.world.wet && tr.themeKey !== 'alpine' ? 0.72 : 1;
        this.mud = new THREE.Color(C[0] * wet, C[1] * wet, C[2] * wet);
      }
      let loose = 0, on = 0;
      for (const w of ph.wheels) if (w.contact) { on++; const sf = G.SURF[w.surf] || G.SURF.gravel; loose += sf.dust; }
      if (on) this.dirt = Math.min(0.92, this.dirt + dt * Math.min(1, ph.speed / 22) * (loose / on) * 0.0075);
      // water splashes
      const wy = this.world.waterAt(ph.pos.x, ph.pos.z);
      const depth = wy == null ? -1 : wy - (ph.pos.y - this.spec.cgH);
      if (depth > -0.05) {
        const hv = Math.hypot(ph.vel.x, ph.vel.z);
        // water drag: a splash costs you roughly a fifth of your speed
        const k = Math.min(0.2, dt * (0.25 + Math.max(0, depth) * 0.5));
        ph.vel.x *= 1 - k;
        ph.vel.z *= 1 - k;
        if (!this.inWater) {
          this.inWater = true;
          G.audio.splash(hv);
          fx.splash(ph.pos, ph.vel, Math.min(160, 30 + hv * 5));
          this.app.rig.bump(0.4);
        } else if (hv > 3) fx.splash(ph.pos, ph.vel, Math.min(12, hv * 0.4));
        this.dirt = Math.max(0, this.dirt - dt * 0.6);
      } else this.inWater = false;
      this.model.setDirt(this.dirt, this.mud);
      // broken-off bumpers and wings tumble onto the road and stay there
      const m = this.model;
      if (m.debris && m.debris.length) {
        for (const obj of m.debris) {
          this.app.scene.add(obj);
          (this.debris = this.debris || []).push({ obj, v: new V3(ph.vel.x * 0.7 + (Math.random() - 0.5) * 3, 2 + Math.random() * 2, ph.vel.z * 0.7 + (Math.random() - 0.5) * 3), w: new V3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 9), rest: false });
          G.audio.debris();
          if (!this.demo) this.app.hud.toast('YOU LOST A PART!', 1.4);
        }
        m.debris.length = 0;
      }
      if (this.debris) {
        const e = this._de || (this._de = new THREE.Euler());
        const qd = this._dq || (this._dq = new THREE.Quaternion());
        for (const d of this.debris) {
          if (d.rest) continue;
          d.v.y -= 9.81 * dt;
          d.obj.position.addScaledVector(d.v, dt);
          e.set(d.w.x * dt, d.w.y * dt, d.w.z * dt);
          d.obj.quaternion.multiply(qd.setFromEuler(e));
          const gy = this.world.heightAt(d.obj.position.x, d.obj.position.z) + 0.06;
          if (d.obj.position.y < gy) {
            d.obj.position.y = gy;
            d.v.y = Math.abs(d.v.y) * 0.25;
            d.v.x *= 0.55;
            d.v.z *= 0.55;
            d.w.multiplyScalar(0.5);
            if (d.v.lengthSq() < 0.6) {
              // settle flat on the road, keeping its heading
              d.rest = true;
              const eu = new THREE.Euler().setFromQuaternion(d.obj.quaternion, 'YXZ');
              d.obj.quaternion.setFromEuler(new THREE.Euler(0, eu.y, 0, 'YXZ'));
              d.obj.position.y = gy + 0.04;
            }
          }
        }
      }
    }

    _autoReset(dt, q) {
      const ph = this.ph, tr = this.track;
      const up = this.v[0].set(0, 1, 0).applyQuaternion(ph.q);
      if (ph.inWater) {
        ph.inWater = false;
        this.resetCar('IN THE WATER', 5);
        return;
      }
      const roadY = q && q.i >= 0 ? q.cy : ph.pos.y;
      if (ph.pos.y < roadY - 35) { this.resetCar('OFF THE CLIFF', 5); return; }
      if (q && q.i >= 0 && q.dist > 30) this.offT += dt;
      else this.offT = 0;
      if (this.offT > 2.5) { this.resetCar('OFF STAGE', 5); return; }
      if (up.y < 0.35 && ph.speed < 3) this.flipT += dt;
      else this.flipT = 0;
      if (this.flipT > 2.2) { this.resetCar('ROLLED', 5); return; }
      // stuck hint
      if (ph.speed < 0.6 && (ph.input.throttle > 0.5 || ph.input.brake > 0.5)) this.stuckT += dt;
      else this.stuckT = 0;
      if (this.stuckT > 3) {
        this.stuckT = -3;
        this.app.hud.toast('STUCK? PRESS R', 2.2);
      }
      // wrong way
      const dirx = q && q.i >= 0 ? q.dx : 0, dirz = q && q.i >= 0 ? q.dz : 0;
      const along = ph.vel.x * dirx + ph.vel.z * dirz;
      if (along < -4) this.wrongT += dt;
      else this.wrongT = Math.max(0, this.wrongT - dt * 2);
      this.app.hud.wrongWay(this.wrongT > 1.2);
      void tr;
    }

    _checkpoints() {
      const tr = this.track, hud = this.app.hud;
      const tot = this.t + this.pen;
      if (tr.endless) {
        const next = tr.START + (this.cpIdx + 1) * 1000;
        if (this.sMax >= next) {
          this.cpIdx++;
          const bonus = Math.round(tr.computeRef(next, next + 1000) * 1.32 * 10) / 10 + (this.cpIdx === 1 ? 8 : 0);
          this.timeLeft += bonus;
          hud.flash('CHECKPOINT', 1.3, '#3ddc84');
          hud.flashSub(`<span style="color:#3ddc84">+${bonus.toFixed(1)}s</span> · ${this.cpIdx} KM`, 2);
          G.audio.chime();
        }
        return;
      }
      while (this.splitIdx < tr.splits.length && this.sMax >= tr.splits[this.splitIdx]) {
        const i = this.splitIdx++;
        this.splitTimes[i] = tot;
        const b = this.best && this.best.splits ? this.best.splits[i] : null;
        let sub = `SPLIT ${i + 1} · ${G.fmtTime(tot)}`;
        if (b != null) {
          const d = tot - b;
          sub += ` <span style="color:${d <= 0 ? '#3ddc84' : '#ff6b5e'}">${G.fmtDelta(d)}</span>`;
        }
        hud.flashSub(sub, 2.6);
        G.audio.chime();
      }
      if (this.sMax >= tr.finishS) this._finish(false);
    }

    _finish(timeUp) {
      if (this.state !== 'run') return;
      this.state = 'finished';
      this.finT = 0;
      const tr = this.track;
      const total = this.t + this.pen;
      G.audio.hush();
      const r = {
        key: this.key, cfg: this.cfg, endless: tr.endless, time: total, raw: this.t, pen: this.pen, resets: this.resets,
        splits: this.splitTimes.slice(), topSpeed: this.topSpeed, maxAir: this.maxAir, jumps: this.jumps,
        distance: Math.max(0, this.sMax - tr.START), damage: JSON.parse(JSON.stringify(this.ph.damage)),
        carId: this.cfg.carId,
      };
      const S = G.save.data;
      S.stats.km += r.distance / 1000;
      S.stats.stages++;
      if (tr.endless) {
        const prev = S.endless[tr.themeKey] || 0;
        r.newBest = r.distance > prev;
        r.prevBest = prev;
        if (r.newBest) S.endless[tr.themeKey] = r.distance;
        this.app.hud.flash(timeUp ? 'TIME UP' : 'FINISH', 2, '#ffc21a');
      } else {
        r.medals = this.medals;
        r.medal = G.medalFor(total, this.medals);
        const prev = S.bests[this.key];
        r.prevBest = prev ? prev.t : null;
        r.newBest = !prev || total < prev.t;
        if (r.newBest) {
          S.bests[this.key] = { t: total, splits: r.splits, car: this.cfg.carId, medal: Math.max(r.medal, prev ? prev.medal || 0 : 0) };
          this._saveGhost();
        } else if (prev && r.medal > (prev.medal || 0)) prev.medal = r.medal;
        r.field = G.rivalField(tr, this.key);
        const fp = tr.pointAt(tr.finishS + 25, {});
        this.fx.fireworks(new V3(fp.x, fp.y, fp.z));
        r.dents = Math.round(this.ph.damage.body * 100);
        this.app.hud.flash('FINISH', 2, '#ffc21a');
        this.app.hud.flashSub(G.fmtTime(total) + (r.newBest ? ' · <span style="color:#3ddc84">NEW BEST</span>' : ''), 3);
      }
      // credits
      r.credits = this._payout(r);
      G.save.earn(r.credits);
      G.save.write();
      this.result = r;
      // world leaderboard (featured, daily and quick stages)
      if (!tr.endless && this.cfg.mode !== 'event' && G.NET && G.NET.signedIn()) {
        const pi = G.perfIndex(G.carById(this.cfg.carId), this.spec.ups);
        r.online = G.NET.submit(this.key, { t: Math.round(total * 1000) / 1000, c: this.cfg.carId, pi, r: this.resets }, r.newBest ? { car: this.cfg.carId, hz: 10, f: this.ghostRec } : null).catch(() => null);
      }
      if (G.NET) G.NET.pushProfile();
    }

    _payout(r) {
      const km = r.distance / 1000;
      if (r.endless) return Math.round(45 * km);
      let c = 60 * Math.min(km, this.track.km) * [1, 1.25, 1.5, 2][r.medal];
      if (r.newBest && r.prevBest) c *= 1.3;
      if (this.cfg.mode === 'daily') c *= 1.5;
      // first time earning each medal on a stage
      const b = G.save.data.bests[this.key];
      const seen = (G.save.data.medalPaid = G.save.data.medalPaid || {});
      const had = seen[this.key] | 0;
      if (r.medal > had) {
        for (let m = had + 1; m <= r.medal; m++) c += [0, 120, 250, 500][m];
        seen[this.key] = r.medal;
      }
      void b;
      return Math.round(c);
    }

    // ----- recording -----
    _record(dt) {
      this.recT += dt;
      const ph = this.ph;
      const step = 1 / REC_HZ;
      while (this.recT >= step) {
        this.recT -= step;
        const w = ph.wheels;
        this.rec.push({
          t: this.t, x: ph.pos.x, y: ph.pos.y, z: ph.pos.z, qx: ph.q.x, qy: ph.q.y, qz: ph.q.z, qw: ph.q.w,
          st: ph.steerAngle, rot: w[0].rot, l: [w[0].len, w[1].len, w[2].len, w[3].len],
          rpm: ph.rpm, thr: ph.input.throttle, brk: ph.input.brake, gear: ph.gear, boost: ph.boost,
          sl: [w[0].contact ? w[0].slip : -1, w[1].contact ? w[1].slip : -1, w[2].contact ? w[2].slip : -1, w[3].contact ? w[3].slip : -1],
          sf: w[2].surf, rd: w[2].road, s: this.sCur,
        });
        if (this.rec.length % (REC_HZ / GHOST_HZ) === 0) {
          const r2 = (v) => Math.round(v * 100) / 100;
          const r4 = (v) => Math.round(v * 10000) / 10000;
          this.ghostRec.push(r2(ph.pos.x), r2(ph.pos.y), r2(ph.pos.z), r4(ph.q.x), r4(ph.q.y), r4(ph.q.z), r4(ph.q.w), Math.round(this.sCur));
        }
      }
    }
    _saveGhost() {
      G.save.setGhost(this.key, { car: this.cfg.carId, hz: GHOST_HZ, f: this.ghostRec });
    }

    _ghostAt(t, out) {
      const g = this.ghost;
      if (!g) return null;
      const f = g.d.f;
      const n = f.length / 8;
      const x = t * g.d.hz;
      const i = Math.floor(x);
      if (i >= n - 1 || i < 0) return null;
      const a = i * 8, b = (i + 1) * 8, k = x - i;
      out.pos.set(f[a] + (f[b] - f[a]) * k, f[a + 1] + (f[b + 1] - f[a + 1]) * k, f[a + 2] + (f[b + 2] - f[a + 2]) * k);
      out.q.set(f[a + 3], f[a + 4], f[a + 5], f[a + 6]);
      const qb = this._gq || (this._gq = new THREE.Quaternion());
      qb.set(f[b + 3], f[b + 4], f[b + 5], f[b + 6]);
      out.q.slerp(qb, k);
      out.s = f[a + 7] + (f[b + 7] - f[a + 7]) * k;
      return out;
    }

    // garage view: park the car on a clear straight and orbit around it
    setGarage(on) {
      if (!this.demo) return;
      const want = on ? 'orbit' : 'tv';
      if (this.demoCam === want) return;
      this.demoCam = want;
      const tr = this.track, ph = this.ph;
      if (on) {
        let best = tr.START + 160;
        for (let s = tr.START + 120; s < Math.min(tr.finishS - 100, tr.START + 1500); s += 10) {
          let ok = true;
          for (let d = -30; d <= 30; d += 2) if (Math.abs(tr.k[Math.floor((s + d) / tr.DS)]) > 0.004) { ok = false; break; }
          for (const sp of tr.splits) if (Math.abs(sp - s) < 40) ok = false;
          for (const f of tr.features) if (Math.abs(f.s - s) < f.L + 10) ok = false;
          for (const h of tr.hazards) if (Math.abs(h.s - s) < 20) ok = false;
          if (ok) { best = s; break; }
        }
        const p = tr.pointAt(best, this.tmpP);
        ph.place(p.x, p.z, p.h + 0.0001);
        this.hint = p.i;
        this.ai.reset(p.i);
        ph.held = true;
        for (let i = 0; i < 120; i++) ph.step(G.PHYS_DT);
        ph.events.length = 0;
        this.fx.clear();
      } else {
        ph.held = false;
        this.ai.stopping = false;
      }
      this.app.rig.reset();
    }

    _demoLogic(dt, q) {
      const ph = this.ph, tr = this.track;
      const up = this.v[0].set(0, 1, 0).applyQuaternion(ph.q);
      if (this.demoCam === 'orbit') return;
      if (this.sCur > tr.finishS - 30 || this.ai.stuck > 3 || up.y < 0.3 || (q && q.dist > 20) || ph.inWater) {
        const p = tr.pointAt(this.sCur > tr.finishS - 30 ? tr.START - 5 : Math.max(tr.START, this.sCur - 4), this.tmpP);
        ph.place(p.x, p.z, p.h);
        this.hint = p.i;
        this.sCur = p.i * tr.DS;
        this.sMax = this.sCur;
        this.ai.reset(p.i);
        this.ai.stuck = 0;
        this.callIdx = 0;
        this.app.rig.reset();
      }
      this.demoCamT += dt;
    }

    // ----- rendering helpers shared by run/replay -----
    _render(dt, idle) {
      const app = this.app, ph = this.ph, tr = this.track, hud = app.hud;
      this.model.update(ph);
      this.model.setCockpit(!this.demo && app.rig.mode === 2);
      this.model.animateCockpit(ph, dt);
      if (!idle) this.fx.car(ph, this.model, dt, false);
      this.fx.update(dt);
      // camera
      if (this.demo) {
        if (this.demoCam === 'orbit') app.rig.orbit(ph.pos, ph.q, dt, this.world, window.innerWidth > 760 ? 0.2 : 0);
        else {
          const phase = Math.floor(this.demoCamT / 9) % 3;
          if (phase === 1) app.rig.follow(ph, this.world, dt, this.settings);
          else app.rig.replay(ph.pos, this.sCur, tr, this.world, dt);
        }
      } else app.rig.follow(ph, this.world, dt, this.settings);
      // ghost
      let gp = null;
      if (this.ghost && (this.state === 'run' || this.state === 'finished')) {
        gp = this._ghostAt(this.t, this._gs || (this._gs = { pos: new V3(), q: new THREE.Quaternion(), s: 0 }));
        const gm = this.ghost.model;
        if (gp) {
          // fade the ghost out as it gets close so it never blocks your view
          const mode = this.settings.ghost || 'on';
          const d = gp.pos.distanceTo(ph.pos);
          const base = mode === 'faint' ? 0.13 : 0.32;
          const fade = G.smoothstep(3, 14, d);
          gm.group.visible = mode !== 'off' && fade > 0.02;
          gm.setOpacity(base * fade);
          gm.setState(gp.pos, gp.q, 0, this.t * 30, null, false);
        } else gm.group.visible = false;
      }
      // world streaming: focus a bit ahead of the car
      const fx = ph.pos.x + ph.vel.x * 1.2, fz = ph.pos.z + ph.vel.z * 1.2;
      this.world.update(dt, fx, fz, app.camera, ph.pos);
      // audio
      G.audio.update(this.demo ? null : ph, dt, { rain: this.world.wet, snow: tr.surface === 'snow' });
      if (this.demo) return;
      // HUD
      hud.tick(dt);
      hud.car(ph, this.settings.units);
      const S = this.settings;
      if (tr.endless) {
        hud.timer(this.timeLeft, null, 0, 'TIME LEFT · ' + (this.sMax - tr.START > 0 ? ((this.sMax - tr.START) / 1000).toFixed(2) : '0.00') + ' KM');
        const next = tr.START + (this.cpIdx + 1) * 1000;
        hud.progress(1 - (next - this.sMax) / 1000, null, 'NEXT CHECKPOINT ' + Math.max(0, Math.round(next - this.sMax)) + ' M');
      } else {
        const tot = this.t + this.pen;
        let delta = null;
        if (gp) {
          // time difference to the ghost at the same distance (approx from distance gap / speed)
          const ds = gp.s - this.sCur;
          delta = ds / Math.max(8, ph.speed);
        }
        let bestTxt = this.best ? 'BEST ' + G.fmtTime(this.best.t) : this.medals ? 'GOLD ' + G.fmtTime(this.medals.gold) : '';
        if (this.cfg.netGhost) bestTxt = 'VS ' + String(this.ghostName).toUpperCase() + ' · ' + G.fmtTime(this.cfg.netGhostT || 0);
        hud.timer(tot, this.state === 'run' && gp ? delta : null, this.pen, bestTxt);
        const frac = (this.sMax - tr.START) / tr.length;
        hud.progress(frac, gp ? (gp.s - tr.START) / tr.length : null, Math.max(0, (tr.finishS - this.sMax) / 1000).toFixed(2) + ' KM TO GO');
      }
      // notes
      const list = [];
      const notes = tr.notes;
      let i = 0;
      while (i < notes.length && notes[i].s < this.sCur - 25) i++;
      for (; i < notes.length && list.length < 3; i++) {
        if (notes[i].s - this.sCur > 420) break;
        tr.annotate(notes[i]);
        list.push(notes[i]);
      }
      hud.notes(list, S.paceHud && this.state !== 'finished');
      hud.damage(ph.damage, ph.damageMult());
      if (!this._miniT || (this._miniT -= dt) <= 0) {
        this._miniT = 1 / 30;
        hud.minimap(tr, ph, this.sCur, gp ? gp.pos : null);
      }
    }

    // ----- replay -----
    startReplay() {
      if (!this.rec.length) return false;
      this.state = 'replay';
      this.rp = { t: 0, i: 0, slow: false, cam: 'tv' };
      this.fx.clear();
      if (this.ghost) this.ghost.model.group.visible = false;
      this.app.hud.notes([], false);
      this.app.hud.wrongWay(false);
      this.app.rig.reset();
      this.fakePh = {
        pos: new V3(), vel: new V3(), q: new THREE.Quaternion(), fwd: new V3(), right: new V3(), speed: 0, L: this.ph.L, damage: this.ph.damage, spec: this.spec, H: this.ph.H,
        rpm: 0, input: { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, gear: 1, boost: 0, limiter: false, shiftT: 0, held: false, fwdSpeed: 0,
        wheels: [0, 1, 2, 3].map((i) => ({ i, front: i < 2, contact: true, slip: 0, surf: 'gravel', road: 1, cp: new V3(), n: new V3(0, 1, 0) })),
      };
      return true;
    }
    _replay(dt) {
      const rp = this.rp, R = this.rec, app = this.app;
      const sp = rp.slow ? 0.3 : 1;
      rp.t += dt * sp;
      const tEnd = R[R.length - 1].t;
      if (rp.t > tEnd) { rp.t = 0; rp.i = 0; this.fx.clear(); }
      while (rp.i < R.length - 2 && R[rp.i + 1].t < rp.t) rp.i++;
      while (rp.i > 0 && R[rp.i].t > rp.t) rp.i--;
      const a = R[rp.i], b = R[Math.min(R.length - 1, rp.i + 1)];
      const k = b.t > a.t ? G.clamp((rp.t - a.t) / (b.t - a.t), 0, 1) : 0;
      const F = this.fakePh;
      F.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
      const qa = this._rqa || (this._rqa = new THREE.Quaternion()), qb = this._rqb || (this._rqb = new THREE.Quaternion());
      qa.set(a.qx, a.qy, a.qz, a.qw);
      qb.set(b.qx, b.qy, b.qz, b.qw);
      F.q.copy(qa).slerp(qb, k);
      const ddt = Math.max(1e-3, b.t - a.t);
      F.vel.set((b.x - a.x) / ddt, (b.y - a.y) / ddt, (b.z - a.z) / ddt);
      F.speed = F.vel.length();
      F.fwd.set(0, 0, -1).applyQuaternion(F.q);
      F.right.set(1, 0, 0).applyQuaternion(F.q);
      F.fwdSpeed = F.vel.dot(F.fwd);
      F.rpm = a.rpm + (b.rpm - a.rpm) * k;
      F.input.throttle = a.thr;
      F.input.brake = a.brk;
      F.gear = a.gear;
      F.boost = a.boost;
      const lens = [0, 1, 2, 3].map((j) => a.l[j] + (b.l[j] - a.l[j]) * k);
      this.model.setState(F.pos, F.q, a.st, a.rot + (b.rot - a.rot) * k, lens, a.brk > 0.1);
      // fx from the recorded slip
      for (let j = 0; j < 4; j++) {
        const w = F.wheels[j];
        const wm = this.model.wheels[j].outer;
        wm.getWorldPosition(w.cp);
        w.cp.y -= this.spec.wheelR;
        w.contact = a.sl[j] >= 0;
        w.slip = Math.max(0, a.sl[j]);
        w.surf = a.sf;
        w.road = a.rd;
      }
      this.fx.car(F, this.model, dt * sp, true);
      this.fx.update(dt * sp);
      this.model.setCockpit(false);
      if (rp.cam === 'tv') app.rig.replay(F.pos, a.s, this.track, this.world, dt);
      else {
        const m = app.rig.mode;
        app.rig.mode = 0;
        app.rig.follow(F, this.world, dt, this.settings);
        app.rig.mode = m;
      }
      this.world.update(dt, F.pos.x, F.pos.z, app.camera, F.pos);
      G.audio.update(F, dt, { rain: this.world.wet, snow: this.track.surface === 'snow' });
      app.hud.tick(dt);
      app.hud.car(F, this.settings.units);
      app.hud.timer(a.t + (b.t - a.t) * k, null, 0, 'REPLAY');
    }
    stopReplay() {
      this.state = 'finished';
      this.resultsShown = true;
    }

    dispose() {
      if (this.debris) for (const d of this.debris) { this.app.scene.remove(d.obj); d.obj.traverse((o) => o.geometry && o.geometry.dispose()); }
      G.audio.stopEngine();
      G.audio.hush();
      this.model.dispose();
      if (this.ghost) this.ghost.model.dispose();
      this.fx.dispose();
      this.world.dispose();
    }
  }

  G.Session = Session;
})();
