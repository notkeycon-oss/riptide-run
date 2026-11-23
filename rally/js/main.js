// Go Fast Rally — app bootstrap: renderer, quality presets, dynamic resolution, session lifecycle.
(function () {
  const G = window.G;
  const UI = G.UI;

  const PRESETS = {
    low: { name: 'low', view: 520, hi: 120, mid: 240, treeDist: 270, treeDensity: 0.55, shadows: false, shadowSize: 512, treeShadows: false, particles: 1000, skids: 900, fxMul: 0.6, pixel: 0.75, aa: false },
    medium: { name: 'medium', view: 760, hi: 150, mid: 330, treeDist: 380, treeDensity: 0.85, shadows: true, shadowSize: 1024, treeShadows: false, particles: 1800, skids: 1500, fxMul: 0.85, pixel: 1.0, aa: true },
    high: { name: 'high', view: 1000, hi: 190, mid: 430, treeDist: 520, treeDensity: 1, shadows: true, shadowSize: 2048, treeShadows: true, particles: 3000, skids: 2400, fxMul: 1, pixel: 1.5, aa: true },
  };

  const App = {
    session: null,
    state: 'boot',
    paused: false,

    init() {
      G.save.load();
      const S = G.save.data.settings;
      this.quality = this.computeQuality();
      const canvas = document.getElementById('gl');
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.aa, powerPreference: 'high-performance', stencil: false });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.basePixel = Math.min(window.devicePixelRatio || 1, this.quality.pixel);
      this.dynScale = 1;
      this.applyPixelRatio();
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1400);
      this.rig = new G.CamRig(this.camera);
      this.rig.mode = S.camera || 0;
      this.hud = new G.HUD();
      G.input.sens = S.steerSens || 1;
      UI.init(this);
      window.addEventListener('resize', () => this.resize());
      const unlock = () => {
        G.audio.init();
        G.audio.setSettings(G.save.data.settings);
        if (this.state === 'menu') G.audio.musicStart();
      };
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
      window.addEventListener('blur', () => {
        if (this.state === 'race' && this.session && this.session.state === 'run') this.pause();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'race' && this.session && this.session.state === 'run') this.pause();
      });
      this.last = performance.now();
      this.frameAvg = 16;
      this.slowT = 0;
      this.fastT = 0;
      this.fpsN = 0;
      this.fpsT = 0;
      requestAnimationFrame((t) => this.loop(t));
      this.bootDemo();
      // signed in to Riptide Run on this site? Use the same racer here.
      G.NET.autoSignIn().then((name) => {
        if (name) this.hud.toast('SIGNED IN AS ' + name.toUpperCase() + ' (RIPTIDE RUN)', 3);
        // cloud save: pull credits/upgrades from another device
        if (G.NET.signedIn() && !name) return G.NET.pullProfile();
      }).then(() => this.checkAdmin()).catch(() => {});
      setInterval(() => this.checkAdmin(), 60000);
      setInterval(() => G.NET.presence(this.state === 'race' ? 'racing' : 'menu'), 5000);
      window.addEventListener('pagehide', () => G.NET.goOffline());
    },

    async checkAdmin() {
      const ch = await G.NET.pollAdmin();
      if (ch === 'reset' && this.state === 'menu') this.refreshDemoCar();
      if (UI.current === 'menu') UI.renderMenu();
      if (UI.current === 'garage') UI.renderGarage();
    },

    computeQuality() {
      const S = G.save.data.settings;
      let q = S.quality;
      if (q === 'auto') {
        const cores = navigator.hardwareConcurrency || 4;
        const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
        q = mobile ? 'low' : cores <= 4 ? 'medium' : 'high';
        this.autoQ = true;
      } else this.autoQ = false;
      const p = Object.assign({}, PRESETS[q] || PRESETS.medium);
      if (!S.shadows) p.shadows = false;
      return p;
    },

    applyPixelRatio() {
      const S = G.save.data.settings;
      const pr = Math.max(0.4, this.basePixel * (S.resScale || 1) * this.dynScale);
      this.renderer.setPixelRatio(pr);
      if (this.session && this.session.fx) this.session.fx.resize(this.camera, this.renderer);
    },

    resize() {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      if (this.session && this.session.fx) this.session.fx.resize(this.camera, this.renderer);
    },

    applySettings(live) {
      const S = G.save.data.settings;
      G.audio.setSettings(S);
      G.input.sens = S.steerSens || 1;
      this.applyPixelRatio();
      this.hud.fps(S.fps, '');
      if (!live) {
        const nq = this.computeQuality();
        const changed = nq.name !== this.quality.name || nq.shadows !== this.quality.shadows;
        this.quality = nq;
        this.basePixel = Math.min(window.devicePixelRatio || 1, nq.pixel);
        this.applyPixelRatio();
        if (changed && this.state === 'menu') this.bootDemo(true);
      }
    },

    // ---------- sessions ----------
    async loadSession(cfg, label) {
      if (this.session) {
        this.session.dispose();
        this.session = null;
      }
      UI.loading(true, 0, label || 'Building the stage…');
      const s = new G.Session(this, cfg);
      this.loadingSession = s;
      await s.load((f) => UI.loading(true, f));
      this.loadingSession = null;
      this.session = s;
      this.camera.far = s.world.viewDist + 60;
      this.camera.updateProjectionMatrix();
      this.resize();
      return s;
    },

    async bootDemo(silent) {
      const pick = ['f1', 'f3', 'f7', 'f5', 'f2'];
      const id = pick[Math.floor(Math.random() * pick.length)];
      const f = G.FEATURED.find((x) => x.id === id);
      const carId = G.save.data.car;
      this.state = 'loading';
      this.hud.show(false);
      await this.loadSession({ demo: true, stage: UI.featuredStage(f), carId, livery: UI.livery(carId) }, silent ? 'Applying settings…' : 'Warming up the engine…');
      UI.loading(false);
      this.state = 'menu';
      if (this.afterBoot) {
        const f = this.afterBoot;
        this.afterBoot = null;
        f();
      } else UI.open('menu');
      if (G.audio.ready) G.audio.musicStart();
      if (!G.save.data.seenHelp && !silent) {
        G.save.data.seenHelp = true;
        G.save.write();
        UI.backTo = 'menu';
        UI.show('help');
      }
    },

    refreshDemoCar() {
      const s = this.session;
      if (!s || !s.demo) return;
      const carId = G.save.data.car;
      s.model.dispose();
      s.cfg.carId = carId;
      s.spec = G.carById(carId);
      const old = s.ph;
      s.ph = new G.CarPhysics(s.spec, s.world, old.settings);
      s.ph.place(old.pos.x, old.pos.z, old.heading());
      s.ph.held = s.demoCam === 'orbit';
      for (let i = 0; i < 120; i++) s.ph.step(G.PHYS_DT);
      s.ph.events.length = 0;
      s.model = new G.CarModel(s.spec, UI.livery(carId), { night: s.world.night });
      s.ph.bonnetLocal = s.model.bonnetLocal;
      s.ph.eyeLocal = s.model.eyeLocal;
      this.scene.add(s.model.group);
      s.model.update(s.ph);
    },

    async startStage(cfg) {
      G.audio.init();
      G.audio.setSettings(G.save.data.settings);
      G.audio.musicStop();
      UI.hideAll();
      this.state = 'loading';
      this.hud.show(false);
      this.lastCfg = cfg;
      this.paused = false;
      const s = await this.loadSession(cfg, 'Building ' + (cfg.stage.name || 'stage') + '…');
      UI.loading(false);
      this.state = 'race';
      this.hud.show(true);
      document.getElementById('replayBar').classList.add('hidden');
      this.hud.fps(G.save.data.settings.fps, '');
      this.rig.mode = G.save.data.settings.camera || 0;
      G.input.clear();
      s.start();
    },

    restart() {
      if (!this.lastCfg) return;
      if (this.lastCfg.mode === 'event') return;
      this.startStage(this.lastCfg);
    },

    // after: optional callback that opens a panel once the menu scene is ready
    quitToMenu(after) {
      this.paused = false;
      G.audio.duck(false);
      document.getElementById('replayBar').classList.add('hidden');
      this.afterBoot = typeof after === 'function' ? after : null;
      if (!this.afterBoot) UI.ev = null;
      UI.hideAll();
      this.bootDemo(true);
    },

    pause() {
      if (this.state !== 'race' || !this.session || this.paused) return;
      if (this.session.state === 'replay') return;
      this.paused = true;
      G.audio.duck(true);
      G.audio.hush();
      const s = this.session;
      document.getElementById('pauseInfo').textContent = (s.cfg.stage.name || '') + ' · ' + G.fmtTime(s.t + s.pen);
      document.getElementById('pRestart').classList.toggle('hidden', s.cfg.mode === 'event');
      UI.backTo = 'pause';
      UI.show('pause');
    },
    resume() {
      this.paused = false;
      G.audio.duck(false);
      UI.hideAll();
      G.input.clear();
      this.last = performance.now();
    },
    togglePause() {
      if (this.paused) this.resume();
      else this.pause();
    },

    onStageDone(r) {
      UI.showResults(r);
    },
    watchReplay() {
      if (!this.session || !this.session.startReplay()) return;
      UI.hideAll();
      document.getElementById('replayBar').classList.remove('hidden');
    },
    exitReplay() {
      document.getElementById('replayBar').classList.add('hidden');
      this.session.stopReplay();
      UI.showResults(UI.lastResult);
    },

    // ---------- loop ----------
    loop(now) {
      requestAnimationFrame((t) => this.loop(t));
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (!(dt > 0)) dt = 0.016;
      if (dt > 0.1) dt = 0.1;
      const inp = G.input;
      // global keys
      if (inp.take('mute')) {
        const m = G.audio.toggleMute();
        document.getElementById('bMute').style.opacity = m ? 0.4 : 1;
      }
      if (inp.take('fps')) {
        G.save.data.settings.fps = !G.save.data.settings.fps;
        this.hud.fps(G.save.data.settings.fps, '');
      }
      if (this.state === 'race' && this.session) {
        if (inp.take('pause')) {
          if (this.session.state === 'replay') this.exitReplay();
          else if (UI.current === 'results') { /* ignore */ }
          else this.togglePause();
        }
        if (inp.take('restart') && !this.paused && this.lastCfg && this.lastCfg.mode !== 'event' && this.session.state !== 'replay') {
          this.restart();
          return;
        }
      } else if (this.state === 'menu') {
        if (inp.take('pause') && UI.current && UI.current !== 'menu') UI.open('menu');
      }
      // drop unused actions
      for (const a of ['help', 'look', 'confirm']) inp.take(a);
      const s = this.session;
      if (s && !this.paused && this.state !== 'loading') {
        s.update(dt);
      }
      if (s && this.state !== 'loading') this.renderer.render(this.scene, this.camera);
      this.perf(dt);
    },

    perf(dt) {
      // dynamic resolution keeps the frame rate smooth
      this.frameAvg = this.frameAvg * 0.95 + dt * 1000 * 0.05;
      if (this.state === 'race' || this.state === 'menu') {
        if (this.frameAvg > 21) this.slowT += dt;
        else this.slowT = 0;
        if (this.frameAvg < 14.5) this.fastT += dt;
        else this.fastT = 0;
        if (this.slowT > 1.5 && this.dynScale > 0.55) {
          this.dynScale = Math.max(0.55, this.dynScale * 0.88);
          this.applyPixelRatio();
          this.slowT = 0;
        } else if (this.fastT > 4 && this.dynScale < 1) {
          this.dynScale = Math.min(1, this.dynScale * 1.06);
          this.applyPixelRatio();
          this.fastT = 0;
        }
      }
      this.fpsN++;
      this.fpsT += dt;
      if (this.fpsT > 0.5) {
        if (G.save.data.settings.fps) this.hud.fps(true, Math.round(this.fpsN / this.fpsT) + ' FPS · ' + Math.round(this.dynScale * 100) + '% res · ' + this.quality.name);
        this.fpsN = 0;
        this.fpsT = 0;
      }
    },
  };

  G.App = App;
  window.addEventListener('DOMContentLoaded', () => App.init());
})();
