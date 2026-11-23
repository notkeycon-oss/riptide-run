// Go Fast Rally — procedural audio: engine, turbo, surfaces, impacts, co-driver voice, menu music.
(function () {
  const G = window.G;

  class Audio {
    constructor() {
      this.ctx = null;
      this.ready = false;
      this.muted = false;
      this.vol = { master: 0.8, engine: 0.8, voice: 1, music: 0.5 };
      this.voices = [];
      this.voiceOn = true;
      this.engineOn = false;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp);
      comp.connect(ctx.destination);
      this.engBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.musBus = ctx.createGain();
      this.engBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.musBus.connect(this.master);
      // shared noise buffer
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      // brown-ish noise for rumble
      const bb = ctx.createBuffer(1, len, ctx.sampleRate);
      const bd = bb.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        bd[i] = last * 3.5;
      }
      this.brownBuf = bb;
      this.ready = true;
      this.applyVolumes();
      this._loadVoices();
      this.startSurface();
    }

    _loadVoices() {
      if (!('speechSynthesis' in window)) return;
      const pick = () => {
        const vs = speechSynthesis.getVoices();
        const en = vs.filter((v) => /^en/i.test(v.lang));
        this.voice = en.find((v) => /GB|UK|Daniel|Arthur/i.test(v.name + v.lang)) || en.find((v) => /Google|Natural/i.test(v.name)) || en[0] || vs[0] || null;
      };
      pick();
      speechSynthesis.onvoiceschanged = pick;
    }

    setSettings(s) {
      this.vol.master = s.master;
      this.vol.engine = s.engineVol;
      this.vol.voice = s.voiceVol;
      this.vol.music = s.musicVol;
      this.voiceOn = s.voice;
      this.applyVolumes();
    }
    applyVolumes() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.05);
      this.engBus.gain.setTargetAtTime(this.vol.engine, t, 0.05);
      this.sfxBus.gain.setTargetAtTime(Math.min(1, this.vol.engine * 1.1), t, 0.05);
      this.musBus.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.05);
    }
    toggleMute() {
      this.muted = !this.muted;
      this.applyVolumes();
      if (this.muted && 'speechSynthesis' in window) speechSynthesis.cancel();
      return this.muted;
    }

    noise(loop) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = !!loop;
      if (loop) s.loopStart = Math.random();
      return s;
    }

    // ---------- engine ----------
    startEngine(spec) {
      if (!this.ready) return;
      this.stopEngine();
      const ctx = this.ctx;
      const e = (this.eng = {});
      e.cyl = spec.id === 'atlas' ? 6 : spec.id === 'havoc' ? 5 : 4;
      e.spec = spec;
      e.oA = ctx.createOscillator(); e.oA.type = 'sawtooth';
      e.oB = ctx.createOscillator(); e.oB.type = 'square';
      e.oC = ctx.createOscillator(); e.oC.type = 'sawtooth';
      e.gA = ctx.createGain(); e.gA.gain.value = 0.32;
      e.gB = ctx.createGain(); e.gB.gain.value = 0.2;
      e.gC = ctx.createGain(); e.gC.gain.value = 0.1;
      e.oA.connect(e.gA); e.oB.connect(e.gB); e.oC.connect(e.gC);
      e.mix = ctx.createGain();
      e.gA.connect(e.mix); e.gB.connect(e.mix); e.gC.connect(e.mix);
      // intake / exhaust noise
      e.nz = this.noise(true);
      e.nzF = ctx.createBiquadFilter(); e.nzF.type = 'bandpass'; e.nzF.Q.value = 1.2;
      e.nzG = ctx.createGain(); e.nzG.gain.value = 0;
      e.nz.connect(e.nzF); e.nzF.connect(e.nzG); e.nzG.connect(e.mix);
      // combustion lumpiness
      e.am = ctx.createGain(); e.am.gain.value = 0.85;
      e.lfo = ctx.createOscillator(); e.lfo.type = 'sine';
      e.lfoG = ctx.createGain(); e.lfoG.gain.value = 0.18;
      e.lfo.connect(e.lfoG); e.lfoG.connect(e.am.gain);
      e.mix.connect(e.am);
      e.shaper = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 1023) * 2 - 1;
        curve[i] = Math.tanh(x * 2.6);
      }
      e.shaper.curve = curve;
      e.lp = ctx.createBiquadFilter(); e.lp.type = 'lowpass'; e.lp.Q.value = 0.9;
      e.out = ctx.createGain(); e.out.gain.value = 0;
      e.am.connect(e.shaper); e.shaper.connect(e.lp); e.lp.connect(e.out); e.out.connect(this.engBus);
      // turbo whistle
      e.tb = ctx.createOscillator(); e.tb.type = 'sine';
      e.tbG = ctx.createGain(); e.tbG.gain.value = 0;
      e.tb.connect(e.tbG); e.tbG.connect(this.engBus);
      const t = ctx.currentTime;
      for (const o of [e.oA, e.oB, e.oC, e.lfo, e.tb]) o.start(t);
      e.nz.start(t);
      e.out.gain.setTargetAtTime(0.18, t, 0.3);
      this.engineOn = true;
    }
    stopEngine() {
      const e = this.eng;
      if (!e) return;
      const t = this.ctx.currentTime;
      e.out.gain.setTargetAtTime(0, t, 0.08);
      e.tbG.gain.setTargetAtTime(0, t, 0.05);
      setTimeout(() => {
        for (const o of [e.oA, e.oB, e.oC, e.lfo, e.tb, e.nz]) try { o.stop(); } catch (er) { /* already stopped */ }
        e.out.disconnect();
        e.tbG.disconnect();
      }, 400);
      this.eng = null;
      this.engineOn = false;
    }

    startSurface() {
      const ctx = this.ctx;
      const s = (this.surf = {});
      // gravel crunch
      s.gn = this.noise(true);
      s.gF = ctx.createBiquadFilter(); s.gF.type = 'bandpass'; s.gF.frequency.value = 1500; s.gF.Q.value = 0.6;
      s.gG = ctx.createGain(); s.gG.gain.value = 0;
      s.gn.connect(s.gF); s.gF.connect(s.gG); s.gG.connect(this.sfxBus);
      // rumble
      s.rn = ctx.createBufferSource(); s.rn.buffer = this.brownBuf; s.rn.loop = true;
      s.rF = ctx.createBiquadFilter(); s.rF.type = 'lowpass'; s.rF.frequency.value = 220;
      s.rG = ctx.createGain(); s.rG.gain.value = 0;
      s.rn.connect(s.rF); s.rF.connect(s.rG); s.rG.connect(this.sfxBus);
      // tyre squeal
      s.sn = this.noise(true);
      s.sF = ctx.createBiquadFilter(); s.sF.type = 'bandpass'; s.sF.frequency.value = 1150; s.sF.Q.value = 9;
      s.sG = ctx.createGain(); s.sG.gain.value = 0;
      s.sn.connect(s.sF); s.sF.connect(s.sG); s.sG.connect(this.sfxBus);
      // wind
      s.wn = this.noise(true);
      s.wF = ctx.createBiquadFilter(); s.wF.type = 'lowpass'; s.wF.frequency.value = 520;
      s.wG = ctx.createGain(); s.wG.gain.value = 0;
      s.wn.connect(s.wF); s.wF.connect(s.wG); s.wG.connect(this.sfxBus);
      // rain on the roof
      s.rainG = ctx.createGain(); s.rainG.gain.value = 0;
      s.rainN = this.noise(true);
      s.rainF = ctx.createBiquadFilter(); s.rainF.type = 'highpass'; s.rainF.frequency.value = 3000;
      s.rainN.connect(s.rainF); s.rainF.connect(s.rainG); s.rainG.connect(this.sfxBus);
      const t = ctx.currentTime;
      for (const n of [s.gn, s.rn, s.sn, s.wn, s.rainN]) n.start(t);
    }

    // called every frame while driving
    update(ph, dt, env) {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      const e = this.eng;
      if (e && ph) {
        const S = e.spec;
        const rpm = ph.rpm;
        const thr = ph.held ? ph.input.throttle : Math.max(ph.input.throttle, ph.gear < 0 ? ph.input.brake : 0);
        const f0 = (rpm / 60) * (e.cyl / 2);
        const k = 0.03;
        e.oA.frequency.setTargetAtTime(f0, t, k);
        e.oB.frequency.setTargetAtTime(f0 * 0.5, t, k);
        e.oC.frequency.setTargetAtTime(f0 * 2.01, t, k);
        e.lfo.frequency.setTargetAtTime(f0 * 0.5, t, k);
        e.nzF.frequency.setTargetAtTime(400 + f0 * 3, t, k);
        e.nzG.gain.setTargetAtTime(0.05 + thr * 0.22, t, 0.05);
        const rn = rpm / S.redline;
        e.lp.frequency.setTargetAtTime(380 + rpm * 0.3 + thr * 2400, t, 0.04);
        let g = 0.09 + thr * 0.17 + rn * 0.1;
        if (ph.limiter) g *= 0.4 + Math.random() * 0.6;
        if (ph.shiftT > 0) g *= 0.55;
        e.out.gain.setTargetAtTime(g, t, 0.02);
        if (S.turbo > 0) {
          e.tb.frequency.setTargetAtTime(1800 + ph.boost * 4200, t, 0.05);
          e.tbG.gain.setTargetAtTime(ph.boost * 0.022 * (0.3 + thr), t, 0.05);
        }
      }
      const s = this.surf;
      if (s && ph && env) {
        let loose = 0, sq = 0, n = 0;
        for (const w of ph.wheels) {
          if (!w.contact) continue;
          n++;
          const sf = G.SURF[w.surf] || G.SURF.gravel;
          loose += sf.loose ? 1 : 0;
          if (!sf.loose) sq = Math.max(sq, G.clamp((w.slip - 0.8) * 1.4, 0, 1));
        }
        const v = ph.speed;
        const lf = n ? loose / 4 : 0;
        const slipAvg = ph.wheels.reduce((a, w) => a + (w.contact ? Math.min(2, w.slip) : 0), 0) / 4;
        s.gG.gain.setTargetAtTime(lf * Math.min(1, v / 22) * (0.08 + slipAvg * 0.1) * (env.snow ? 0.6 : 1), t, 0.05);
        s.gF.frequency.setTargetAtTime(env.snow ? 900 : 1300 + v * 20, t, 0.1);
        s.rG.gain.setTargetAtTime(n ? Math.min(0.35, v * 0.012) * (1 + lf) : 0, t, 0.08);
        s.sG.gain.setTargetAtTime(sq * Math.min(1, v / 8) * 0.16, t, 0.04);
        s.sF.frequency.setTargetAtTime(1000 + sq * 300, t, 0.1);
        s.wG.gain.setTargetAtTime(Math.min(0.25, v * v * 0.00009), t, 0.1);
        s.rainG.gain.setTargetAtTime(env.rain ? 0.05 : 0, t, 0.5);
      } else if (s) {
        for (const gn of [s.gG, s.rG, s.sG, s.wG]) gn.gain.setTargetAtTime(0, t, 0.1);
        s.rainG.gain.setTargetAtTime(0, t, 0.3);
      }
    }

    // ---------- one-shots ----------
    _burst(dur, type, freq, q, gain, bus) {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const n = this.noise(false);
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      n.connect(f); f.connect(g); g.connect(bus || this.sfxBus);
      n.start(t, Math.random());
      n.stop(t + dur + 0.05);
    }
    _tone(freq, dur, type, gain, slideTo, bus) {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(bus || this.sfxBus);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    pop() {
      if (!this.ready) return;
      this._burst(0.07, 'bandpass', 500 + Math.random() * 400, 1.1, 0.9);
      this._tone(90, 0.09, 'sine', 0.5, 45);
    }
    bov(amt) {
      if (!this.ready) return;
      this._burst(0.35, 'highpass', 2600, 0.7, 0.12 * amt);
    }
    shift() {
      if (!this.ready) return;
      this._tone(160, 0.05, 'square', 0.06, 90);
    }
    impact(v) {
      if (!this.ready) return;
      const a = G.clamp(v / 18, 0.1, 1);
      this._burst(0.25 + a * 0.3, 'lowpass', 500 + a * 900, 0.8, 0.5 * a + 0.1);
      this._tone(70, 0.3, 'sine', 0.6 * a, 35);
      if (a > 0.5) this._burst(0.4, 'highpass', 3500, 0.5, 0.08 * a);
    }
    land(v) {
      if (!this.ready) return;
      const a = G.clamp(v / 8, 0.15, 1);
      this._burst(0.22, 'lowpass', 300, 0.7, 0.4 * a);
      this._tone(60, 0.25, 'sine', 0.45 * a, 32);
    }
    puncture() {
      if (!this.ready) return;
      this._burst(0.8, 'highpass', 2200, 0.5, 0.18);
    }
    beep(hi) {
      if (!this.ready) return;
      this._tone(hi ? 1320 : 660, hi ? 0.5 : 0.22, 'sine', 0.22);
    }
    click() {
      if (!this.ready) return;
      this._tone(900, 0.04, 'square', 0.04);
    }
    chime() {
      if (!this.ready) return;
      this._tone(880, 0.18, 'triangle', 0.12);
      setTimeout(() => this._tone(1320, 0.3, 'triangle', 0.12), 90);
    }

    // ---------- co-driver ----------
    say(text, urgent) {
      if (!this.voiceOn || this.muted || !text) return;
      if (!('speechSynthesis' in window)) return;
      try {
        if (urgent) speechSynthesis.cancel();
        // don't let calls queue up behind the car
        if (speechSynthesis.pending) speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (this.voice) u.voice = this.voice;
        u.rate = 1.32;
        u.pitch = 1.0;
        u.volume = G.clamp(this.vol.voice * this.vol.master * 1.2, 0, 1);
        speechSynthesis.speak(u);
      } catch (e) {
        /* speech unavailable */
      }
    }
    hush() {
      if ('speechSynthesis' in window) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    }

    // ---------- menu music: a small procedural loop ----------
    musicStart() {
      if (!this.ready || this.music) return;
      const ctx = this.ctx;
      const m = (this.music = { step: 0, next: ctx.currentTime + 0.1 });
      const bpm = 104;
      const spb = 60 / bpm / 2; // eighth notes
      const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
      const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
      m.filter = ctx.createBiquadFilter();
      m.filter.type = 'lowpass';
      m.filter.frequency.value = 1800;
      m.filter.connect(this.musBus);
      const note = (f, t, d, type, g) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        const gn = ctx.createGain();
        gn.gain.setValueAtTime(0, t);
        gn.gain.linearRampToValueAtTime(g, t + 0.02);
        gn.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.connect(gn); gn.connect(m.filter);
        o.start(t); o.stop(t + d + 0.05);
      };
      const kick = (t) => {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.connect(g); g.connect(this.musBus);
        o.start(t); o.stop(t + 0.3);
      };
      const hat = (t, g) => {
        const n = this.noise(false);
        const f = ctx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 7000;
        const gn = ctx.createGain();
        gn.gain.setValueAtTime(g, t);
        gn.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        n.connect(f); f.connect(gn); gn.connect(this.musBus);
        n.start(t, Math.random()); n.stop(t + 0.08);
      };
      m.timer = setInterval(() => {
        while (m.next < ctx.currentTime + 0.25) {
          const st = m.step, t = m.next;
          const bar = Math.floor(st / 8) % 4;
          const ch = prog[bar];
          if (st % 8 === 0) for (const n of ch) note(midi(n), t, spb * 7.5, 'triangle', 0.05);
          if (st % 2 === 0) note(midi(ch[0] - 24), t, spb * 1.8, 'sawtooth', 0.07);
          const arp = [0, 2, 1, 2, 0, 1, 2, 1][st % 8];
          note(midi(ch[arp] + 12), t, spb * 0.9, 'square', 0.018);
          if (st % 4 === 0) kick(t);
          hat(t, st % 2 ? 0.02 : 0.035);
          m.step++;
          m.next += spb;
        }
      }, 60);
    }
    musicStop() {
      const m = this.music;
      if (!m) return;
      clearInterval(m.timer);
      try { m.filter.disconnect(); } catch (e) { /* ignore */ }
      this.music = null;
    }
    duck(on) {
      if (!this.ctx) return;
      this.engBus.gain.setTargetAtTime(on ? this.vol.engine * 0.25 : this.vol.engine, this.ctx.currentTime, 0.1);
    }
  }

  G.audio = new Audio();
})();
