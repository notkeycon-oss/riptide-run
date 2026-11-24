// Go Fast Rally — menus: main, featured stages, quick stage, rally event, garage, settings, results.
(function () {
  const G = window.G;
  const $ = (id) => document.getElementById(id);
  const PANELS = ['loading', 'menu', 'stages', 'custom', 'event', 'garage', 'settings', 'help', 'pause', 'results', 'login', 'boards'];
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const THEME_BG = { forest: 'linear-gradient(135deg,#2f6b34,#8aa86a)', canyon: 'linear-gradient(135deg,#a2502a,#e3a15f)', alpine: 'linear-gradient(135deg,#7a95b8,#eef3f8)', coast: 'linear-gradient(135deg,#1f5f86,#7cae5a)' };
  const TIME_ICON = { morning: '🌅', noon: '☀️', sunset: '🌇', night: '🌙' };
  const WEATHER_ICON = { clear: '', fog: '🌫️', rain: '🌧️', snow: '❄️' };
  const TL = { forest: 'F', canyon: 'C', alpine: 'A', coast: 'T' };
  const DL = { flowing: 'F', technical: 'T', brutal: 'B' };
  const TML = { morning: 'M', noon: 'N', sunset: 'S', night: 'X' };
  const WL = { clear: 'C', fog: 'F', rain: 'R', snow: 'S' };
  const inv = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
  const TIPS = [
    'Brake in a straight line, then turn in. Weight moves forward under braking and the nose bites.',
    'Grade 6 is nearly flat out. Grade 1 is the slowest bend before a hairpin.',
    "“Don't cut” means a rock waits on the inside of that bend.",
    '“Tightens”: the bend gets slower halfway round. Be ready to brake again.',
    'Tap the handbrake (SPACE) to swing the tail round a hairpin.',
    'Lift off before big jumps. Landing on the nose hurts the car.',
    'On snow, lean on the snowbanks. They hold you in a turn.',
    'Rain makes tarmac slippery. Brake earlier.',
    'The Havoc B has huge turbo lag. Keep the revs up.',
    'Press C to switch camera. The bonnet camera feels the fastest.',
  ];

  const UI = {
    app: null,
    sel: { featured: 'f1' },
    custom: { theme: 'forest', km: 5, diff: 'technical', time: 'noon', weather: 'clear', seed: 1 + Math.floor(Math.random() * 99999) },
    eventCfg: { theme: 'mixed', diff: 'technical', km: 3 },
    ev: null,
    backTo: 'menu',

    init(app) {
      this.app = app;
      document.querySelectorAll('[data-go]').forEach((b) =>
        b.addEventListener('click', () => {
          G.audio.init();
          G.audio.click();
          const go = b.getAttribute('data-go');
          if (go === 'back') this.show(this.backTo);
          else if (go === 'daily') this.startDaily();
          else if (go === 'endless') this.startEndless();
          else this.open(go);
        }),
      );
      $('stageGo').onclick = () => this.startFeatured(this.sel.featured);
      $('customGo').onclick = () => this.startCustom();
      $('seedRnd').onclick = () => {
        this.custom.seed = 1 + Math.floor(Math.random() * 99999);
        this.renderCustom();
      };
      $('seedIn').onchange = () => {
        this.custom.seed = Math.max(1, Math.min(99999, parseInt($('seedIn').value, 10) || 1));
        this.renderCustom();
      };
      $('codeLoad').onclick = () => {
        const c = this.parseCode($('codeIn').value);
        if (c) {
          Object.assign(this.custom, c);
          this.renderCustom();
        } else $('codeIn').style.borderColor = '#ff4d4f';
      };
      // sign in
      const doLogin = async () => {
        $('lerr').textContent = 'Signing in…';
        $('lGo').disabled = true;
        try {
          await G.NET.signIn($('lname').value, $('lpin').value);
          $('lerr').textContent = '';
          G.audio.chime();
          this.open('menu');
          this.app.refreshDemoCar();
        } catch (e) {
          $('lerr').textContent = e.message;
        }
        $('lGo').disabled = false;
      };
      $('lGo').onclick = doLogin;
      $('lpin').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
      // garage tabs
      $('gTabs').querySelectorAll('button').forEach((b) => (b.onclick = () => { this.gTab = b.getAttribute('data-tab'); G.audio.click(); this.renderGarage(); }));
      $('resTabs').querySelectorAll('button').forEach((b) => (b.onclick = () => { this.resTab = b.getAttribute('data-b'); this.renderResBoard(); }));
      $('bPlay').onclick = () => this.playBoardStage();
      // back to Riptide Run (same site when Go Fast Rally lives in its rally/ folder)
      $('toRiptide').onclick = () => { location.href = /\/rally\/?/.test(location.pathname) ? '../riptide.html' : 'https://notkeycon-oss.github.io/riptide-run/'; };
      $('setDone').onclick = () => {
        G.save.write();
        this.app.applySettings();
        this.show(this.backTo);
      };
      // pause
      $('pResume').onclick = () => this.app.resume();
      $('pRestart').onclick = () => this.app.restart();
      $('pSettings').onclick = () => { this.backTo = 'pause'; this.open('settings'); };
      $('pHelp').onclick = () => { this.backTo = 'pause'; this.show('help'); };
      $('pQuit').onclick = () => this.app.quitToMenu();
      // results
      $('resMenu').onclick = () => this.app.quitToMenu();
      $('resRetry').onclick = () => this.app.restart();
      $('resReplay').onclick = () => this.app.watchReplay();
      $('resNext').onclick = () => this.next();
      // event
      $('evBack').onclick = () => {
        if (this.ev && this.ev.idx > 0 && this.ev.idx < this.ev.stages.length) {
          // two taps to leave: browsers in some hosts block confirm() dialogs
          if (!this._leaveArmed) {
            this._leaveArmed = true;
            $('evBack').textContent = 'TAP AGAIN TO QUIT EVENT';
            setTimeout(() => { this._leaveArmed = false; $('evBack').textContent = 'BACK'; }, 3000);
            return;
          }
          this._leaveArmed = false;
          $('evBack').textContent = 'BACK';
        }
        this.ev = null;
        this.open('menu');
      };
      $('evGo').onclick = () => this.eventNext();
      $('evRepair').onclick = () => this.eventRepair();
      // hud buttons
      $('bPause').onclick = () => this.app.togglePause();
      $('bCam').onclick = () => G.input.queue.push('camera');
      $('bMute').onclick = () => {
        const m = G.audio.toggleMute();
        $('bMute').style.opacity = m ? 0.4 : 1;
      };
      $('rCam').onclick = () => {
        const s = this.app.session;
        if (s && s.rp) s.rp.cam = s.rp.cam === 'tv' ? 'chase' : 'tv';
      };
      $('rSlow').onclick = () => {
        const s = this.app.session;
        if (s && s.rp) s.rp.slow = !s.rp.slow;
        $('rSlow').classList.toggle('on');
      };
      $('rExit').onclick = () => this.app.exitReplay();
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
      G.input.bindTouch($('touch'));
    },

    show(id) {
      for (const p of PANELS) $(p).classList.toggle('hidden', p !== id);
      this.current = id;
      if (this.app.session && this.app.session.demo) this.app.session.setGarage(id === 'garage');
    },
    hideAll() {
      for (const p of PANELS) $(p).classList.add('hidden');
      this.current = null;
    },
    open(id) {
      if (id === 'menu') this.renderMenu();
      if (id === 'stages') this.renderStages();
      if (id === 'custom') this.renderCustom();
      if (id === 'event') this.renderEventSetup();
      if (id === 'garage') this.renderGarage();
      if (id === 'boards') this.renderBoards();
      if (id === 'login') {
        $('lname').value = G.NET.me() ? G.NET.me().name : '';
        $('lpin').value = '';
        $('lerr').textContent = '';
      }
      if (id === 'settings') this.renderSettings();
      if (id !== 'settings' && id !== 'help') this.backTo = id === 'pause' ? 'pause' : 'menu';
      this.show(id);
    },

    loading(on, frac, txt) {
      $('loading').classList.toggle('hidden', !on);
      if (on) {
        $('loadFill').style.width = ((frac || 0) * 100).toFixed(0) + '%';
        if (txt) $('loadTxt').textContent = txt;
        if (!this._tipShown) {
          $('loadTip').textContent = 'TIP: ' + TIPS[Math.floor(Math.random() * TIPS.length)];
          this._tipShown = true;
        }
      } else this._tipShown = false;
    },

    // ---------- helpers ----------
    stars() {
      let s = 0;
      for (const f of G.FEATURED) {
        const st = this.featuredStage(f);
        const tr = this.trackKey(st);
        const b = G.save.data.bests[tr];
        if (b) s += b.medal || 0;
      }
      return s;
    },
    trackKey(st) {
      return st.theme + '_' + st.seed + '_' + st.km + '_' + st.diff;
    },
    featuredStage(f) {
      return { theme: f.theme, seed: f.seed, km: f.km, diff: f.diff, time: f.time, weather: f.weather, name: f.name };
    },
    carUnlocked(c) {
      return this.stars() >= c.unlock || !!(G.save.data.owned || {})[c.id] || !!G.save.data.admCars;
    },
    livery(id) {
      const c = G.carById(id);
      const lv = G.save.data.liveries[id];
      return Object.assign({ primary: c.colors[0], secondary: c.colors[1], accent: c.colors[2], pattern: 'stripes', number: 7, rim: '#e8e8e8' }, lv || {});
    },
    carline(id) {
      const c = G.carById(G.save.data.car);
      $(id).innerHTML = `CAR <b>${c.name}</b> <span>${c.cls}</span> <button class="sec" style="margin:0;padding:4px 14px;font-size:16px">CHANGE</button>`;
      $(id).querySelector('button').onclick = () => {
        this.returnFromGarage = this.current;
        this.open('garage');
      };
    },
    code(c) {
      return TL[c.theme] + c.seed + '-' + c.km + DL[c.diff] + TML[c.time] + WL[c.weather];
    },
    parseCode(str) {
      const m = /^([FCAT])(\d{1,5})-(\d{1,2})([FTB])([MNSX])([CFRS])$/i.exec((str || '').trim().toUpperCase());
      if (!m) return null;
      return { theme: inv(TL)[m[1]], seed: +m[2], km: G.clamp(+m[3], 1, 10), diff: inv(DL)[m[4]], time: inv(TML)[m[5]], weather: inv(WL)[m[6]] };
    },
    seg(label, key, obj, opts, onChange, small) {
      const row = document.createElement('div');
      row.className = 'set';
      row.innerHTML = `<span>${label}${small ? '<small>' + small + '</small>' : ''}</span>`;
      const sg = document.createElement('div');
      sg.className = 'seg';
      for (const [v, name] of opts) {
        const b = document.createElement('button');
        b.textContent = name;
        if (obj[key] === v) b.classList.add('on');
        b.onclick = () => {
          obj[key] = v;
          sg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          G.audio.click();
          onChange && onChange(v);
        };
        sg.appendChild(b);
      }
      row.appendChild(sg);
      return row;
    },
    slider(label, key, obj, min, max, step, onChange, fmt) {
      const row = document.createElement('div');
      row.className = 'set';
      row.innerHTML = `<span>${label}</span>`;
      const w = document.createElement('div');
      w.className = 'row';
      const r = document.createElement('input');
      r.type = 'range';
      r.min = min; r.max = max; r.step = step; r.value = obj[key];
      const v = document.createElement('b');
      v.style.minWidth = '48px';
      v.textContent = fmt ? fmt(obj[key]) : obj[key];
      r.oninput = () => {
        obj[key] = parseFloat(r.value);
        v.textContent = fmt ? fmt(obj[key]) : obj[key];
        onChange && onChange();
      };
      w.appendChild(r);
      w.appendChild(v);
      row.appendChild(w);
      return row;
    },

    // ---------- main menu ----------
    renderMenu() {
      const S = G.save.data;
      const stars = this.stars();
      const me = G.NET.me();
      const status = G.NET.status === 'norules' ? ' · leaderboards not set up yet' : '';
      $('acct').innerHTML = me
        ? `<span class="pill">👤 <b>${esc(me.name)}</b>${status}</span><button class="sec" id="mOut">SIGN OUT</button>${G.NET.banned ? '<span class="pill" style="color:#ff6b5e">⛔ BANNED FROM ONLINE</span>' : ''}`
        : `<button class="sec" id="mIn">SIGN IN</button><span style="color:var(--dim);font-size:15px">for world leaderboards and cloud saves</span>`;
      if ($('mOut')) $('mOut').onclick = () => { G.NET.signOut(); this.renderMenu(); };
      if ($('mIn')) $('mIn').onclick = () => this.open('login');
      $('profile').innerHTML = `<span class="pill cr"><b>${G.save.credits().toLocaleString()}</b> CR</span><span class="pill">★ <b>${stars}</b> / ${G.FEATURED.length * 3}</span><span class="pill"><b>${S.stats.km.toFixed(1)}</b> KM DRIVEN</span><span class="pill"><b>${S.stats.stages}</b> STAGES</span>`;
      const d = this.dailyStage();
      const db = S.bests[this.trackKey(d)];
      $('dailySub').textContent = `${G.THEMES[d.theme].name} · ${d.km} km · ${db ? 'your best ' + G.fmtTime(db.t) : 'not driven yet'}`;
    },

    // ---------- featured ----------
    renderStages() {
      const grid = $('stageGrid');
      grid.innerHTML = '';
      for (const f of G.FEATURED) {
        const st = this.featuredStage(f);
        const b = G.save.data.bests[this.trackKey(st)];
        const medal = b ? b.medal || 0 : 0;
        const el = document.createElement('div');
        el.className = 'st' + (this.sel.featured === f.id ? ' sel' : '');
        el.style.setProperty('--bg', THEME_BG[f.theme]);
        const stars = [1, 2, 3].map((i) => `<i class="${medal >= i ? ['', 'b', 's', 'g'][medal] : ''}">★</i>`).join('');
        el.innerHTML = `<span class="tag">${G.THEMES[f.theme].name.toUpperCase()}</span><div class="nm">${f.name}</div>
          <div class="ds">${f.km} km · ${G.DIFFICULTY[f.diff].name} · ${TIME_ICON[f.time]} ${WEATHER_ICON[f.weather]}</div>
          <div class="stars">${stars}</div>
          <div class="tm">${b ? 'Best <b>' + G.fmtTime(b.t) + '</b>' : 'Not driven yet'}</div><div class="wr" data-wr="${this.trackKey(st)}"></div>`;
        el.onclick = () => {
          this.sel.featured = f.id;
          G.audio.click();
          this.renderStages();
        };
        el.ondblclick = () => this.startFeatured(f.id);
        grid.appendChild(el);
      }
      this.carline('carline1');
      this.fillWR();
    },
    // world record line on each featured card
    async fillWR() {
      for (const el of document.querySelectorAll('[data-wr]')) {
        const k = el.getAttribute('data-wr');
        G.NET.board(k)
          .then((rows) => { el.textContent = rows.length ? `WR ${G.fmtTime(rows[0].t)} · ${rows[0].n}` : 'WR · be the first'; })
          .catch(() => { el.textContent = ''; });
      }
    },
    startFeatured(id) {
      const f = G.FEATURED.find((x) => x.id === id);
      this.app.startStage({ mode: 'featured', featured: id, stage: this.featuredStage(f), carId: G.save.data.car, livery: this.livery(G.save.data.car) });
    },
    next() {
      const r = this.lastResult;
      if (!r) return this.app.quitToMenu();
      if (r.cfg.mode === 'event') return this.eventAfterStage();
      if (r.cfg.mode === 'featured') {
        const i = G.FEATURED.findIndex((x) => x.id === r.cfg.featured);
        const nf = G.FEATURED[(i + 1) % G.FEATURED.length];
        this.sel.featured = nf.id;
        return this.startFeatured(nf.id);
      }
      if (r.cfg.mode === 'quick') {
        this.custom.seed = 1 + Math.floor(Math.random() * 99999);
        return this.startCustom();
      }
      return this.app.quitToMenu();
    },

    // ---------- quick stage ----------
    renderCustom() {
      const box = $('customOpts');
      box.innerHTML = '';
      const c = this.custom;
      const upd = () => {
        $('codeIn').value = this.code(c);
        $('codeIn').style.borderColor = '';
      };
      box.appendChild(this.seg('Landscape', 'theme', c, Object.keys(G.THEMES).map((k) => [k, G.THEMES[k].name]), upd, null));
      box.appendChild(this.seg('Length', 'km', c, [[2, '2 KM'], [3, '3 KM'], [5, '5 KM'], [8, '8 KM'], [10, '10 KM']], upd));
      box.appendChild(this.seg('Turns', 'diff', c, Object.keys(G.DIFFICULTY).map((k) => [k, G.DIFFICULTY[k].name]), upd, 'Brutal = hairpins and switchbacks'));
      box.appendChild(this.seg('Time of day', 'time', c, Object.keys(G.TIMES).map((k) => [k, G.TIMES[k].name]), upd));
      box.appendChild(this.seg('Weather', 'weather', c, Object.keys(G.WEATHER).map((k) => [k, G.WEATHER[k].name]), upd));
      $('seedIn').value = c.seed;
      upd();
      this.carline('carline2');
    },
    startCustom() {
      const c = this.custom;
      const st = { theme: c.theme, seed: c.seed, km: c.km, diff: c.diff, time: c.time, weather: c.weather, name: G.THEMES[c.theme].name + ' #' + c.seed };
      this.app.startStage({ mode: 'quick', stage: st, carId: G.save.data.car, livery: this.livery(G.save.data.car) });
    },

    // ---------- daily / endless ----------
    dailyStage() {
      const d = new Date();
      const key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      const h = G.hashStr('daily' + key);
      const themes = Object.keys(G.THEMES);
      const times = ['morning', 'noon', 'sunset', 'noon', 'night'];
      const r = G.rng(h);
      const theme = themes[h % themes.length];
      const weather = r() < 0.2 ? (theme === 'alpine' ? 'snow' : r() < 0.5 ? 'fog' : 'rain') : 'clear';
      return { theme, seed: (h % 99999) + 1, km: 4, diff: r() < 0.4 ? 'brutal' : 'technical', time: times[Math.floor(r() * times.length)], weather, name: 'Daily Stage ' + key };
    },
    startDaily() {
      this.app.startStage({ mode: 'daily', stage: this.dailyStage(), carId: G.save.data.car, livery: this.livery(G.save.data.car) });
    },
    startEndless() {
      const themes = Object.keys(G.THEMES);
      const theme = themes[Math.floor(Math.random() * themes.length)];
      const st = { theme, seed: 1 + Math.floor(Math.random() * 99999), km: 0, diff: 'technical', time: Math.random() < 0.3 ? 'sunset' : 'noon', weather: 'clear', name: 'Endless · ' + G.THEMES[theme].name };
      this.app.startStage({ mode: 'endless', stage: st, carId: G.save.data.car, livery: this.livery(G.save.data.car) });
    },

    // ---------- rally event ----------
    renderEventSetup() {
      $('evTitle').textContent = 'RALLY EVENT';
      $('evSub').textContent = 'Three stages back to back against a field of 11 drivers. Your damage carries over, so drive smart. Lowest total time wins.';
      $('evSetup').classList.remove('hidden');
      $('evStand').classList.add('hidden');
      $('evRepair').classList.add('hidden');
      $('evGo').textContent = 'START EVENT';
      const box = $('eventOpts');
      box.innerHTML = '';
      const c = this.eventCfg;
      box.appendChild(this.seg('Rally', 'theme', c, [['mixed', 'Mixed']].concat(Object.keys(G.THEMES).map((k) => [k, G.THEMES[k].name]))));
      box.appendChild(this.seg('Stage length', 'km', c, [[2, '2 KM'], [3, '3 KM'], [5, '5 KM']]));
      box.appendChild(this.seg('Turns', 'diff', c, Object.keys(G.DIFFICULTY).map((k) => [k, G.DIFFICULTY[k].name])));
      this.carline('carline3');
      this.ev = null;
    },
    eventNext() {
      if (!this.ev) {
        const c = this.eventCfg;
        const themes = Object.keys(G.THEMES);
        const base = 1 + Math.floor(Math.random() * 90000);
        const times = ['morning', 'noon', 'sunset'];
        const stages = [0, 1, 2].map((i) => {
          const theme = c.theme === 'mixed' ? themes[(base + i) % themes.length] : c.theme;
          return { theme, seed: base + i * 977, km: c.km, diff: c.diff, time: times[i], weather: i === 2 && Math.random() < 0.4 ? (theme === 'alpine' ? 'snow' : 'rain') : 'clear', name: 'SS' + (i + 1) + ' · ' + G.THEMES[theme].name };
        });
        this.ev = { stages, idx: 0, mine: 0, rivals: {}, damage: null, repairPen: 0, results: [] };
      }
      const ev = this.ev;
      if (ev.idx >= ev.stages.length) {
        this.ev = null;
        this.renderMenu();
        return this.show('menu');
      }
      const st = ev.stages[ev.idx];
      this.app.startStage({ mode: 'event', stage: st, carId: G.save.data.car, livery: this.livery(G.save.data.car), damage: ev.damage });
    },
    eventAfterStage() {
      const ev = this.ev, r = this.lastResult;
      if (!ev || !r) return this.app.quitToMenu();
      ev.mine += r.time;
      for (const f of r.field) ev.rivals[f.name] = (ev.rivals[f.name] || 0) + f.t;
      ev.damage = r.damage;
      ev.results.push(r.time);
      ev.idx++;
      if (ev.idx >= ev.stages.length) {
        const pos = this.eventStandings().findIndex((x) => x.me) + 1;
        const bonus = [0, 1500, 1000, 700, 500, 350, 250][pos] || 150;
        G.save.earn(bonus);
        G.save.write();
        G.NET.pushProfile();
        ev.bonus = bonus;
      }
      this.app.quitToMenu(() => {
        this.renderEventStandings();
        this.show('event');
      });
    },
    eventStandings() {
      const ev = this.ev;
      const rows = Object.entries(ev.rivals).map(([n, t]) => ({ name: n, t }));
      rows.push({ name: G.save.data.name, t: ev.mine + ev.repairPen, me: true });
      rows.sort((a, b) => a.t - b.t);
      return rows;
    },
    renderEventStandings() {
      const ev = this.ev;
      const done = ev.idx >= ev.stages.length;
      $('evSetup').classList.add('hidden');
      $('evStand').classList.remove('hidden');
      const rows = this.eventStandings();
      const pos = rows.findIndex((r) => r.me) + 1;
      $('evTitle').textContent = done ? (pos === 1 ? 'RALLY WON!' : 'RALLY COMPLETE') : 'AFTER SS' + ev.idx;
      $('evSub').textContent = done ? `You finished P${pos} of ${rows.length}. Prize: +${(ev.bonus || 0).toLocaleString()} CR.` : `You are P${pos} of ${rows.length}. Next: ${ev.stages[ev.idx].name} (${ev.stages[ev.idx].km} km).`;
      const lead = rows[0].t;
      let h = '<table class="tb">';
      rows.forEach((r, i) => {
        h += `<tr class="${r.me ? 'me' : ''}"><td class="p">${i + 1}</td><td>${r.name}</td><td class="r">${G.fmtTime(r.t)}</td><td class="r" style="color:var(--dim)">${i ? '+' + (r.t - lead).toFixed(1) : ''}</td></tr>`;
      });
      h += '</table>';
      const D = ev.damage || { engine: 0, radiator: 0, steer: 0, susp: [0], punct: [] };
      const dmg = Math.max(D.engine, D.radiator, D.steer, Math.max(...D.susp), (D.punct || []).some((x) => x) ? 0.5 : 0);
      if (!done) {
        const cost = Math.round(dmg * 60);
        h += `<div class="sub" style="margin-top:10px">Car condition: <b style="color:${dmg > 0.5 ? '#ff4d4f' : dmg > 0.15 ? '#ffb03a' : '#3ddc84'}">${dmg < 0.05 ? 'PERFECT' : Math.round((1 - dmg) * 100) + '%'}</b>${dmg > 0.05 ? ` · repairs cost ${cost}s` : ''}</div>`;
        $('evRepair').classList.toggle('hidden', dmg < 0.05);
        $('evRepair').textContent = `REPAIR (+${cost}s)`;
        ev.repairCost = cost;
        $('evGo').textContent = 'NEXT STAGE';
      } else {
        $('evRepair').classList.add('hidden');
        $('evGo').textContent = 'FINISH';
      }
      $('evStand').innerHTML = h;
    },
    eventRepair() {
      const ev = this.ev;
      if (!ev) return;
      ev.repairPen += ev.repairCost || 0;
      ev.damage = null;
      G.audio.chime();
      this.renderEventStandings();
      $('evRepair').classList.add('hidden');
    },

    // ---------- garage ----------
    renderGarage() {
      const tab = this.gTab || 'cars';
      $('gTabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-tab') === tab));
      $('tabCars').classList.toggle('hidden', tab !== 'cars');
      $('tabUps').classList.toggle('hidden', tab !== 'ups');
      $('tabLivery').classList.toggle('hidden', tab !== 'livery');
      $('gCred').innerHTML = `<b>${G.save.credits().toLocaleString()}</b> CR`;
      const list = $('carList');
      list.innerHTML = '';
      const stars = this.stars();
      for (const c of G.CARS) {
        const ok = this.carUnlocked(c);
        const lv = this.livery(c.id);
        const pi = G.perfIndex(c, G.save.ups(c.id));
        const el = document.createElement('div');
        el.className = 'cr' + (G.save.data.car === c.id ? ' sel' : '') + (ok ? '' : ' lock');
        let lock = '';
        if (!ok) lock = `<span class="lk">🔒 ${c.unlock} ★${c.price ? ` or <button class="sec buy">${c.price.toLocaleString()} CR</button>` : ''}</span>`;
        el.innerHTML = `<div class="sw" style="background:${lv.primary}"></div><div><b>${c.name}</b><small>${c.cls} · ${c.power} hp · PI ${pi}</small></div>${lock}`;
        if (ok)
          el.onclick = () => {
            G.save.data.car = c.id;
            G.save.write();
            G.audio.click();
            this.renderGarage();
            this.app.refreshDemoCar();
          };
        const bb = el.querySelector('.buy');
        if (bb) {
          bb.style.cssText = 'margin:0 0 0 4px;padding:2px 10px;font-size:14px;cursor:pointer;opacity:1';
          bb.disabled = G.save.credits() < c.price;
          bb.onclick = (e) => {
            e.stopPropagation();
            if (G.save.credits() < c.price) return;
            G.save.data.spent = (G.save.data.spent | 0) + c.price;
            G.save.data.owned[c.id] = true;
            G.save.data.car = c.id;
            G.save.write();
            G.NET.pushProfile();
            G.audio.chime();
            this.renderGarage();
            this.app.refreshDemoCar();
          };
        }
        list.appendChild(el);
      }
      void stars;
      const c = G.carById(G.save.data.car);
      const bar = (n, v) => `<div class="sbar"><span>${n}</span><i><u style="width:${(v * 100).toFixed(0)}%"></u></i></div>`;
      $('carInfo').innerHTML = `<div style="margin-bottom:6px">${c.blurb}</div>` + bar('POWER', c.stats.power) + bar('GRIP', c.stats.grip) + bar('WEIGHT', c.stats.weight) + bar('EASE', c.stats.ease);
      this.renderUpgrades();
      this.renderLivery();
      if (this.returnFromGarage) {
        const back = this.returnFromGarage;
        $('garage').querySelector('.gfoot .go').onclick = () => {
          this.returnFromGarage = null;
          $('garage').querySelector('.gfoot .go').onclick = null;
          this.open(back);
        };
      }
    },
    renderUpgrades() {
      const id = G.save.data.car;
      const c = G.carById(id);
      const S = G.save.data;
      const ups = S.admUps ? G.save.ups(id) : (S.ups[id] = S.ups[id] || {});
      $('upInfo').innerHTML = `Upgrades for the <b>${c.name}</b> (PI ${G.perfIndex(c, ups)}). Stock tyres slide on loose surfaces: fit the right compound for each stage.`;
      const box = $('upList');
      box.innerHTML = '';
      for (const p of G.PARTS) {
        const lvl = ups[p.id] | 0;
        const cost = lvl < 3 ? p.costs[lvl] : 0;
        const row = document.createElement('div');
        row.className = 'up';
        const pips = [0, 1, 2].map((i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
        const now = lvl ? p.desc(lvl) : 'stock';
        const next = lvl < 3 ? ' → ' + p.desc(lvl + 1) : '';
        row.innerHTML = `<div class="ic">${p.icon}</div><div><b>${p.name}</b><small>${now}${next}</small><div class="pips">${pips}</div></div>`;
        const b = document.createElement('button');
        b.className = lvl < 3 ? 'go' : 'sec';
        b.style.cssText = 'font-size:15px;padding:6px 12px;letter-spacing:1px';
        b.textContent = lvl < 3 ? cost.toLocaleString() + ' CR' : 'MAXED';
        b.disabled = lvl >= 3 || G.save.credits() < cost;
        b.onclick = () => {
          if (lvl >= 3 || G.save.credits() < cost) return;
          S.spent = (S.spent | 0) + cost;
          ups[p.id] = lvl + 1;
          G.save.write();
          G.NET.pushProfile();
          G.audio.chime();
          this.renderGarage();
        };
        row.appendChild(b);
        box.appendChild(row);
      }
    },
    renderLivery() {
      const id = G.save.data.car;
      const lv = this.livery(id);
      const box = $('livery');
      box.innerHTML = '';
      const save = () => {
        G.save.data.liveries[id] = lv;
        G.save.write();
        this.app.refreshDemoCar();
      };
      const palette = ['#f4f4f4', '#14181f', '#ff3d2e', '#ff8a1f', '#ffd23f', '#3ddc84', '#1a7a4c', '#1f6fd6', '#1a3ea8', '#7a4cff', '#ff4fa3', '#8a8f98'];
      const swatchRow = (label, key) => {
        const row = document.createElement('div');
        row.className = 'set';
        row.innerHTML = `<span>${label}</span>`;
        const sw = document.createElement('div');
        sw.className = 'swatches';
        for (const p of palette) {
          const b = document.createElement('button');
          b.style.background = p;
          if (lv[key].toLowerCase() === p) b.classList.add('on');
          b.onclick = () => {
            lv[key] = p;
            save();
            this.renderLivery();
            this.renderGarageSw();
          };
          sw.appendChild(b);
        }
        const ci = document.createElement('input');
        ci.type = 'color';
        ci.value = lv[key];
        ci.onchange = () => {
          lv[key] = ci.value;
          save();
          this.renderLivery();
        };
        sw.appendChild(ci);
        row.appendChild(sw);
        box.appendChild(row);
      };
      swatchRow('Main colour', 'primary');
      swatchRow('Second colour', 'secondary');
      swatchRow('Accent', 'accent');
      box.appendChild(this.seg('Pattern', 'pattern', lv, G.LIVERY_PATTERNS.map((p) => [p, p.toUpperCase()]), save));
      box.appendChild(this.seg('Wheels', 'rim', lv, [['#e8e8e8', 'WHITE'], ['#c9a23a', 'GOLD'], ['#2a2d33', 'BLACK'], ['#9aa3ad', 'SILVER']], save));
      const row = document.createElement('div');
      row.className = 'set';
      row.innerHTML = '<span>Door number</span>';
      const ni = document.createElement('input');
      ni.type = 'number';
      ni.min = 1; ni.max = 99; ni.value = lv.number;
      ni.style.width = '90px';
      ni.onchange = () => {
        lv.number = G.clamp(parseInt(ni.value, 10) || 1, 1, 99);
        save();
      };
      row.appendChild(ni);
      box.appendChild(row);
    },
    renderGarageSw() {
      const lv = this.livery(G.save.data.car);
      const sel = $('carList').querySelector('.cr.sel .sw');
      if (sel) sel.style.background = lv.primary;
    },

    // ---------- settings ----------
    renderSettings() {
      const S = G.save.data.settings;
      const box = $('setList');
      box.innerHTML = '';
      const grp = (t) => {
        const d = document.createElement('div');
        d.className = 'sgroup';
        d.textContent = t;
        box.appendChild(d);
      };
      const live = () => this.app.applySettings(true);
      grp('DRIVING');
      box.appendChild(this.seg('Handling', 'handling', S, [['arcade', 'ARCADE'], ['sim', 'SIM']], live, 'Arcade: grippy and easy to drift. Sim: realistic tyres that let go at the limit'));
      box.appendChild(this.seg('Gearbox', 'transmission', S, [['auto', 'AUTO'], ['manual', 'MANUAL (E / Q)']], live));
      box.appendChild(this.seg('Steering assist', 'steerAssist', S, [[true, 'ON'], [false, 'OFF']], live, 'Keeps the front tyres at their grip limit and stops spins'));
      box.appendChild(this.slider('Steering speed', 'steerSens', S, 0.6, 1.6, 0.1, live, (v) => v.toFixed(1) + '×'));
      box.appendChild(this.seg('ABS', 'abs', S, [[true, 'ON'], [false, 'OFF']], live));
      box.appendChild(this.seg('Traction control', 'tc', S, [[true, 'ON'], [false, 'OFF']], live));
      box.appendChild(this.seg('Damage', 'damage', S, [['off', 'OFF'], ['normal', 'NORMAL'], ['realistic', 'REALISTIC']], live));
      box.appendChild(this.seg('Ghost car', 'ghost', S, [['on', 'SHOW'], ['faint', 'FAINT'], ['off', 'HIDE']], live, 'Press G in a stage to switch'));
      grp('CO-DRIVER');
      box.appendChild(this.seg('Voice', 'voice', S, [[true, 'ON'], [false, 'OFF']], live));
      box.appendChild(this.seg('Call timing', 'callTiming', S, [['early', 'EARLY'], ['normal', 'NORMAL'], ['late', 'LATE']], live));
      box.appendChild(this.seg('Pace note cards', 'paceHud', S, [[true, 'SHOW'], [false, 'HIDE']], live));
      grp('GRAPHICS');
      box.appendChild(this.seg('Quality', 'quality', S, [['auto', 'AUTO'], ['low', 'LOW'], ['medium', 'MEDIUM'], ['high', 'HIGH']], live, 'Takes effect on the next stage'));
      box.appendChild(this.slider('Resolution', 'resScale', S, 0.5, 1, 0.05, live, (v) => Math.round(v * 100) + '%'));
      box.appendChild(this.seg('Shadows', 'shadows', S, [[true, 'ON'], [false, 'OFF']], live));
      box.appendChild(this.seg('Camera shake', 'speedFx', S, [[true, 'ON'], [false, 'OFF']], live));
      box.appendChild(this.seg('FPS counter', 'fps', S, [[true, 'ON'], [false, 'OFF']], live));
      grp('SOUND & UNITS');
      box.appendChild(this.slider('Master volume', 'master', S, 0, 1, 0.05, live, (v) => Math.round(v * 100) + '%'));
      box.appendChild(this.slider('Engine & effects', 'engineVol', S, 0, 1, 0.05, live, (v) => Math.round(v * 100) + '%'));
      box.appendChild(this.slider('Co-driver', 'voiceVol', S, 0, 1, 0.05, live, (v) => Math.round(v * 100) + '%'));
      box.appendChild(this.slider('Menu music', 'musicVol', S, 0, 1, 0.05, live, (v) => Math.round(v * 100) + '%'));
      box.appendChild(this.seg('Speed units', 'units', S, [['kmh', 'KM/H'], ['mph', 'MPH']], live));
    },

    // ---------- leaderboards ----------
    boardStages() {
      const list = G.FEATURED.map((f) => ({ id: f.id, name: f.name, sub: `${G.THEMES[f.theme].name} · ${f.km} km`, stage: this.featuredStage(f), mode: 'featured' }));
      const d = this.dailyStage();
      list.push({ id: 'daily', name: 'Daily Stage', sub: `${G.THEMES[d.theme].name} · today`, stage: d, mode: 'daily' });
      return list;
    },
    renderBoards() {
      const list = this.boardStages();
      if (!this.boardSel) this.boardSel = list[0].id;
      const bl = $('bList');
      bl.innerHTML = '';
      for (const b of list) {
        const el = document.createElement('button');
        el.className = this.boardSel === b.id ? 'on' : '';
        el.innerHTML = `${esc(b.name)}<small>${esc(b.sub)}</small>`;
        el.onclick = () => { this.boardSel = b.id; G.audio.click(); this.renderBoards(); };
        bl.appendChild(el);
      }
      const cur = list.find((b) => b.id === this.boardSel);
      this.boardCur = cur;
      this.drawBoard($('bTable'), this.trackKey(cur.stage), cur);
    },
    drawBoard(box, key, cur, myTime) {
      box.innerHTML = '<div class="sub">Loading…</div>';
      G.NET.board(key)
        .then((rows) => {
          const me = G.NET.me();
          if (!rows.length) {
            box.innerHTML = '<div class="sub">No times yet. Set the first one!</div>';
            return;
          }
          const lead = rows[0].t;
          let h = '<table class="tb">';
          rows.slice(0, 50).forEach((r, i) => {
            const mine = me && r.uid === me.id;
            const car = G.CARS.find((c) => c.id === r.c);
            h += `<tr class="${mine ? 'me' : ''}"><td class="p">${i + 1}</td><td>${esc(r.n)}<br><small style="color:var(--dim)">${car ? car.name : ''}${r.pi ? ' · PI ' + r.pi : ''}</small></td><td class="r">${G.fmtTime(r.t)}</td><td class="r" style="color:var(--dim)">${i ? '+' + (r.t - lead).toFixed(2) : ''}</td><td class="r">${cur ? `<button class="gbtn" data-uid="${esc(r.uid)}" data-t="${r.t}" data-n="${esc(r.n)}">👻 RACE</button>` : ''}</td></tr>`;
          });
          box.innerHTML = h + '</table>';
          box.querySelectorAll('.gbtn').forEach((b) => (b.onclick = () => this.raceGhost(cur, b.getAttribute('data-uid'), +b.getAttribute('data-t'), b.getAttribute('data-n'))));
          void myTime;
        })
        .catch(() => {
          box.innerHTML = G.NET.status === 'norules'
            ? '<div class="sub">The online leaderboards aren\'t switched on yet. The game owner needs to add the Go Fast Rally database rules (see the README).</div>'
            : '<div class="sub">Couldn\'t reach the online leaderboards. Check your connection.</div>';
        });
    },
    async raceGhost(cur, uid, t, name) {
      G.audio.click();
      let g = null;
      try {
        g = await G.NET.ghost(this.trackKey(cur.stage), uid);
      } catch (e) {
        g = null;
      }
      if (!g || !g.f || !g.f.length) {
        $('bSub').textContent = `No ghost saved for ${name}. Try another racer.`;
        return;
      }
      g.n = name;
      this.app.startStage({ mode: cur.mode, featured: cur.mode === 'featured' ? cur.id : undefined, stage: cur.stage, carId: G.save.data.car, livery: this.livery(G.save.data.car), netGhost: g, netGhostT: t });
    },
    playBoardStage() {
      const cur = this.boardCur;
      if (!cur) return;
      if (cur.mode === 'daily') this.startDaily();
      else this.startFeatured(cur.id);
    },

    // ---------- results ----------
    renderResBoard() {
      const r = this.lastResult;
      if (!r || r.endless) return;
      $('resTabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-b') === this.resTab));
      if (this.resTab === 'world') {
        if (!G.NET.signedIn()) {
          $('resBoard').innerHTML = '<div class="sub">Sign in from the main menu to post your times to the world leaderboard.</div>';
          return;
        }
        const cur = { stage: r.cfg.stage, mode: r.cfg.mode, id: r.cfg.featured };
        this.drawBoard($('resBoard'), r.key, cur);
      } else $('resBoard').innerHTML = this._fieldHtml || '';
    },
    showResults(r) {
      this.lastResult = r;
      const st = r.cfg.stage;
      $('resStage').textContent = (st.name || '').toUpperCase() + ' · ' + G.carById(r.carId).name.toUpperCase();
      $('resReplay').classList.toggle('hidden', !this.app.session || !this.app.session.rec.length);
      const badges = [];
      if (r.endless) {
        $('resTime').textContent = (r.distance / 1000).toFixed(2) + ' KM';
        $('resMedal').innerHTML = '';
        if (r.newBest) badges.push('<span class="badge">NEW RECORD</span>');
        else if (r.prevBest) badges.push(`<span class="badge u">RECORD ${(r.prevBest / 1000).toFixed(2)} KM</span>`);
        $('resSplits').innerHTML = `<div class="sub">You drove ${(r.distance / 1000).toFixed(2)} km before time ran out.</div>`;
        $('resBoard').innerHTML = '<div class="sub">Each checkpoint adds time. How far can you go?</div>';
        $('resNext').textContent = 'AGAIN';
        $('resNext').onclick = () => this.startEndless();
      } else {
        $('resTime').textContent = G.fmtTime(r.time);
        const mn = ['NO MEDAL', 'BRONZE', 'SILVER', 'GOLD'][r.medal];
        $('resMedal').innerHTML = `<span class="medal ${['n', 'b', 's', 'g'][r.medal]}">${mn}</span> <span style="color:var(--dim);font-size:16px">Gold ${G.fmtTime(r.medals.gold)} · Silver ${G.fmtTime(r.medals.silver)} · Bronze ${G.fmtTime(r.medals.bronze)}</span>`;
        if (r.newBest) badges.push('<span class="badge">' + (r.prevBest ? 'NEW BEST −' + (r.prevBest - r.time).toFixed(2) + 's' : 'FIRST RUN') + '</span>');
        else if (r.prevBest) badges.push(`<span class="badge u">BEST ${G.fmtTime(r.prevBest)} (+${(r.time - r.prevBest).toFixed(2)})</span>`);
        if (r.pen > 0) badges.push(`<span class="badge u" style="border-color:#ff4d4f;background:rgba(255,77,79,.14)">PENALTIES +${r.pen}s</span>`);
        // unlocks
        const stars = this.stars();
        for (const c of G.CARS) if (c.unlock > 0 && stars >= c.unlock && !(G.save.data.unlocked || {})[c.id]) {
          G.save.data.unlocked = G.save.data.unlocked || {};
          G.save.data.unlocked[c.id] = true;
          badges.push(`<span class="badge">UNLOCKED: ${c.name.toUpperCase()}</span>`);
          G.save.write();
        }
        let sp = '';
        if (r.splits.length) sp = '<table class="tb">' + r.splits.map((t, i) => `<tr><td>Split ${i + 1}</td><td class="r">${G.fmtTime(t)}</td></tr>`).join('') + '</table>';
        $('resSplits').innerHTML = sp;
        const rows = r.field.map((f) => ({ name: f.name, car: f.car, t: f.t }));
        rows.push({ name: G.save.data.name, car: G.carById(r.carId).name, t: r.time, me: true });
        rows.sort((a, b) => a.t - b.t);
        const lead = rows[0].t;
        let h = '<table class="tb">';
        rows.forEach((x, i) => {
          h += `<tr class="${x.me ? 'me' : ''}"><td class="p">${i + 1}</td><td>${x.name}<br><small style="color:var(--dim)">${x.car}</small></td><td class="r">${G.fmtTime(x.t)}</td><td class="r" style="color:var(--dim)">${i ? '+' + (x.t - lead).toFixed(2) : ''}</td></tr>`;
        });
        this._fieldHtml = h + '</table>';
        $('resNext').textContent = r.cfg.mode === 'event' ? 'STANDINGS' : r.cfg.mode === 'daily' ? 'MENU' : 'NEXT STAGE';
        $('resNext').onclick = () => this.next();
        $('resRetry').classList.toggle('hidden', r.cfg.mode === 'event');
      }
      $('resBadges').innerHTML = badges.join('') + (r.credits ? `<div class="cashline">+${r.credits.toLocaleString()} CR <small>· you have ${G.save.credits().toLocaleString()} CR to spend in the garage</small></div>` : '');
      this.resTab = !r.endless && r.cfg.mode !== 'event' && G.NET.signedIn() ? 'world' : 'field';
      $('resTabs').classList.toggle('hidden', !!(r.endless || r.cfg.mode === 'event'));
      this.renderResBoard();
      if (r.online) {
        r.online.then((o) => {
          if (!o || this.lastResult !== r) return;
          if (o.rank) {
            const el = document.createElement('span');
            el.className = 'badge';
            el.style.borderColor = '#8fd8ff';
            el.style.background = 'rgba(143,216,255,.14)';
            el.textContent = `WORLD #${o.rank} of ${o.total}`;
            $('resBadges').insertBefore(el, $('resBadges').firstChild);
          }
          if (this.resTab === 'world') this.renderResBoard();
        });
      }
      const S = G.save.data.settings;
      const sp = (v) => (S.units === 'mph' ? (v * 3.6 * 0.6214).toFixed(0) + ' mph' : (v * 3.6).toFixed(0) + ' km/h');
      $('resStats').innerHTML = `<div class="stat"><small>TOP SPEED</small><b>${sp(r.topSpeed)}</b></div><div class="stat"><small>AVG SPEED</small><b>${sp(r.distance / Math.max(1, r.raw))}</b></div><div class="stat"><small>BIGGEST AIR</small><b>${r.maxAir.toFixed(1)}s</b></div><div class="stat"><small>RESETS</small><b>${r.resets}</b></div>`;
      this.show('results');
    },
  };

  G.UI = UI;
})();
