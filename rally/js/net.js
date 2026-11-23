// Go Fast Rally — online: racer name + PIN accounts (shared with Riptide Run), cloud saves,
// world leaderboards and downloadable ghosts. Firebase Realtime Database + Auth over REST.
(function () {
  const G = window.G;

  // Same Firebase project as Riptide Run, so one racer name + PIN works in both games.
  // Go Fast Rally keeps all of its data under /gfr (see firebase-rules-gofastrally.json).
  const ONLINE_DB = 'https://riptide-run-default-rtdb.firebaseio.com';
  const FIREBASE_API_KEY = 'AIzaSyDik3EHoih0_3wJphZOBVzaNi86YJrD-Ec';
  const ROOT = 'gfr';
  const IDT = 'https://identitytoolkit.googleapis.com/v1/accounts:';
  const STS = 'https://securetoken.googleapis.com/v1/token?key=';

  const nameKey = (n) => n.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const isLegacyId = (id) => typeof id === 'string' && id.length < 20;

  const NET = {
    status: 'offline', // offline | online | norules
    token: null,
    exp: 0,
    busy: null,
    boards: {}, // stageKey -> {at, rows}
    pushT: null,
    enabled: !!ONLINE_DB,

    me() {
      return G.save.data.account || null;
    },
    signedIn() {
      return !!(this.me() && this.me().id);
    },

    async authCall(url, body) {
      let r;
      try {
        r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } catch (e) {
        throw new Error('NETWORK');
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
      return j;
    },
    takeAuth(j) {
      this.token = j.idToken || j.id_token;
      this.exp = Date.now() + (+(j.expiresIn || j.expires_in) || 3600) * 1000;
      return j.localId || j.user_id;
    },
    async authToken() {
      const me = this.me();
      if (!me || !me.rt) return null;
      if (this.token && Date.now() < this.exp - 60000) return this.token;
      if (!this.busy)
        this.busy = this.authCall(STS + FIREBASE_API_KEY, { grant_type: 'refresh_token', refresh_token: me.rt })
          .then((j) => {
            this.takeAuth(j);
            if (j.refresh_token && G.save.data.account) {
              G.save.data.account.rt = j.refresh_token;
              G.save.write();
            }
            return this.token;
          })
          .catch((e) => {
            if (/TOKEN_EXPIRED|USER_DISABLED|USER_NOT_FOUND|INVALID_REFRESH_TOKEN/.test(e.message)) this.signOut();
            return null;
          })
          .finally(() => {
            this.busy = null;
          });
      return this.busy;
    },
    async api(path, method, body, query) {
      method = method || 'GET';
      query = query || '';
      const opt = { method };
      if (body !== undefined) opt.body = JSON.stringify(body);
      const tk = await this.authToken();
      if (tk) query += (query ? '&' : '?') + 'auth=' + tk;
      let r;
      try {
        r = await fetch(`${ONLINE_DB}/${path}.json${query}`, opt);
      } catch (e) {
        this.status = 'offline';
        throw e;
      }
      if (r.status === 401 || r.status === 403) {
        if (path.startsWith(ROOT)) this.status = 'norules';
        throw new Error('HTTP ' + r.status);
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (path.startsWith(ROOT)) this.status = 'online';
      return r.json();
    },

    // ----- accounts -----
    async signIn(name, pin) {
      name = name.trim().replace(/\s+/g, ' ');
      if (!/^[A-Za-z0-9 _-]{2,14}$/.test(name)) throw new Error('Name: 2–14 letters, numbers, spaces, - or _');
      if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits');
      const key = nameKey(name);
      const TAKEN = 'That name is taken, or the PIN is wrong.';
      let owner;
      try {
        owner = await this.api('names/' + key);
      } catch (e) {
        throw new Error("Couldn't reach the online server. Check your connection, or keep playing offline.");
      }
      if (owner && isLegacyId(owner)) throw new Error('This is an old Riptide Run name. Sign in to Riptide Run once to upgrade it, then come back.');
      let ak = key;
      try {
        const al = await this.api('alias/' + key);
        if (typeof al === 'string' && al) ak = al;
      } catch (e) {
        /* no alias */
      }
      const cred = { email: ak + '@players.riptide-run.firebaseapp.com', password: 'riptide-' + pin + '-' + ak, returnSecureToken: true };
      let j;
      try {
        j = await this.authCall(IDT + 'signInWithPassword?key=' + FIREBASE_API_KEY, cred);
      } catch (e) {
        if (e.message === 'NETWORK') throw new Error("Couldn't reach the online server. Check your connection, or keep playing offline.");
        if (/TOO_MANY_ATTEMPTS/.test(e.message)) throw new Error('Too many tries. Wait a few minutes.');
        if (/USER_DISABLED/.test(e.message)) throw new Error('This racer has been banned.');
        if (owner) throw new Error(TAKEN);
        try {
          j = await this.authCall(IDT + 'signUp?key=' + FIREBASE_API_KEY, cred);
        } catch (e2) {
          throw new Error(/EMAIL_EXISTS/.test(e2.message) ? TAKEN : "Couldn't sign in. Try again.");
        }
      }
      const uid = this.takeAuth(j);
      G.save.data.account = { name, id: uid, rt: j.refreshToken };
      G.save.data.noAuto = false;
      G.save.data.name = name;
      G.save.write();
      if (owner !== uid) {
        try {
          await this.api('names/' + key, 'PUT', uid);
        } catch (e) {
          /* name index is shared with Riptide Run; not fatal here */
        }
      }
      await this.pullProfile();
      await this.pushProfile(true);
      this.boards = {};
      return name;
    },
    signOut() {
      this.goOffline();
      G.save.data.noAuto = true;
      G.save.data.account = null;
      G.save.write();
      this.token = null;
      this.boards = {};
    },

    // ----- cloud save -----
    profile() {
      const S = G.save.data;
      const bests = {};
      for (const k in S.bests) bests[k] = { t: Math.round(S.bests[k].t * 1000) / 1000, m: S.bests[k].medal || 0 };
      return { n: S.name, earned: S.earned | 0, spent: S.spent | 0, ups: S.ups, owned: S.owned, bests, km: Math.round(S.stats.km * 10) / 10, st: S.stats.stages | 0, at: Date.now() };
    },
    merge(p) {
      if (!p || typeof p !== 'object') return;
      const S = G.save.data;
      S.earned = Math.max(S.earned | 0, +p.earned || 0);
      S.spent = Math.max(S.spent | 0, +p.spent || 0);
      for (const c in p.ups || {}) {
        const l = S.ups[c] || (S.ups[c] = {});
        for (const k in p.ups[c]) l[k] = Math.max(l[k] | 0, p.ups[c][k] | 0);
      }
      for (const c in p.owned || {}) if (p.owned[c]) S.owned[c] = true;
      for (const k in p.bests || {}) {
        const b = p.bests[k];
        const l = S.bests[k];
        if (!l || b.t < l.t - 0.005) S.bests[k] = { t: b.t, splits: [], car: l ? l.car : null, medal: Math.max(b.m || 0, l ? l.medal || 0 : 0) };
        else l.medal = Math.max(l.medal || 0, b.m || 0);
      }
      S.stats.km = Math.max(S.stats.km, +p.km || 0);
      S.stats.stages = Math.max(S.stats.stages, +p.st || 0);
      G.save.write();
    },
    async pullProfile() {
      if (!this.signedIn()) return;
      try {
        this.merge(await this.api(`${ROOT}/p/${this.me().id}`));
      } catch (e) {
        /* offline or rules missing */
      }
    },
    // debounced unless now=true
    pushProfile(now) {
      if (!this.signedIn()) return Promise.resolve();
      clearTimeout(this.pushT);
      const go = () => this.api(`${ROOT}/p/${this.me().id}`, 'PUT', this.profile()).catch(() => {});
      if (now) return go();
      this.pushT = setTimeout(go, 1500);
      return Promise.resolve();
    },

    // ----- Riptide Run on the same site: reuse its signed-in racer -----
    riptideAccount() {
      try {
        const cur = localStorage.getItem('rr_cur');
        if (!cur) return null;
        const d = JSON.parse(localStorage.getItem('rr_u_' + cur) || 'null');
        const p = d && d.player;
        if (p && p.id && String(p.id).length >= 20 && p.rt && p.name) return { name: p.name, id: p.id, rt: p.rt };
      } catch (e) {
        /* no riptide save */
      }
      return null;
    },
    async autoSignIn() {
      if (this.signedIn() || G.save.data.noAuto) return null;
      const a = this.riptideAccount();
      if (!a) return null;
      G.save.data.account = a;
      G.save.data.name = a.name;
      G.save.write();
      const tk = await this.authToken();
      if (!tk) return null;
      await this.pullProfile();
      await this.pushProfile(true);
      return a.name;
    },

    // ----- who's online: shows up in Riptide Run's "Online now" list -----
    presence(state) {
      if (!this.signedIn() || this.banned) return;
      const now = Date.now();
      if (now - (this._presT || 0) < 20000 && state === this._presS) return;
      this._presT = now;
      this._presS = state;
      this.api('online/' + this.me().id, 'PUT', { n: this.me().name.slice(0, 14), m: 'rally', s: state.slice(0, 12), t: { '.sv': 'timestamp' } }).catch(() => {});
    },
    goOffline() {
      if (!this.signedIn() || !this.token) return;
      try {
        fetch(`${ONLINE_DB}/online/${this.me().id}.json?auth=${this.token}`, { method: 'DELETE', keepalive: true });
      } catch (e) {
        /* page closing */
      }
    },

    // ----- admin gifts, resets and bans (set from the Riptide Run admin panel) -----
    async pollAdmin() {
      if (!this.signedIn()) return null;
      const uid = this.me().id;
      const S = G.save.data;
      let changed = null;
      try {
        const ban = await this.api('bans/' + uid);
        const on = !!ban && !ban.moved && (ban === true || !ban.until || ban.until > Date.now());
        this.banned = on ? ban.reason || 'banned' : null;
      } catch (e) {
        /* offline */
      }
      try {
        const a = (await this.api(`${ROOT}/adm/${uid}`)) || {};
        const before = JSON.stringify([S.admCr, S.admCars, S.admUps]);
        S.admCr = +a.cr || 0;
        S.admCars = !!a.cars;
        S.admUps = !!a.ups;
        if (a.reset && a.reset > (S.resetSeen || 0)) {
          S.resetSeen = a.reset;
          S.earned = 300;
          S.spent = 0;
          S.ups = {};
          S.owned = { sprite: true, vortex: true };
          S.bests = {};
          S.medalPaid = {};
          S.endless = {};
          S.stats = { km: 0, stages: 0, stars: 0, resets: 0, jumps: 0 };
          if (!G.carById(S.car) || !['sprite', 'vortex'].includes(S.car)) S.car = 'vortex';
          changed = 'reset';
          G.save.write();
          await this.pushProfile(true);
        } else if (before !== JSON.stringify([S.admCr, S.admCars, S.admUps])) changed = 'gift';
        G.save.write();
      } catch (e) {
        /* rules not set up or offline */
      }
      return changed;
    },

    // ----- leaderboards -----
    async board(stageKey, force) {
      const c = this.boards[stageKey];
      if (c && !force && Date.now() - c.at < 45000) return c.rows;
      const j = await this.api(`${ROOT}/lb/${stageKey}`, 'GET', undefined, '?orderBy="t"&limitToFirst=50');
      const rows = Object.entries(j || {})
        .map(([uid, e]) => Object.assign({ uid }, e))
        .filter((e) => typeof e.t === 'number')
        .sort((a, b) => a.t - b.t);
      this.boards[stageKey] = { at: Date.now(), rows };
      return rows;
    },
    // returns {rank, improved} or null
    async submit(stageKey, entry, ghost) {
      if (!this.signedIn() || this.banned) return null;
      const uid = this.me().id;
      const path = `${ROOT}/lb/${stageKey}/${uid}`;
      let cur = null;
      try {
        cur = await this.api(path);
      } catch (e) {
        return null;
      }
      let improved = false;
      if (!cur || typeof cur.t !== 'number' || entry.t < cur.t - 0.001) {
        const e = Object.assign({ n: this.me().name.slice(0, 16), at: Date.now() }, entry);
        await this.api(path, 'PUT', e);
        improved = true;
        if (ghost && ghost.f && ghost.f.length) {
          // half rate keeps uploads small
          const f = [];
          for (let i = 0; i < ghost.f.length; i += 16) for (let k = 0; k < 8; k++) f.push(ghost.f[i + k]);
          const g = { car: ghost.car, hz: ghost.hz / 2, f, n: this.me().name.slice(0, 16) };
          if (JSON.stringify(g).length < 600000) await this.api(`${ROOT}/gh/${stageKey}/${uid}`, 'PUT', g).catch(() => {});
        }
      }
      const rows = await this.board(stageKey, true).catch(() => null);
      const rank = rows ? rows.findIndex((r) => r.uid === uid) + 1 : 0;
      return { rank, improved, total: rows ? rows.length : 0 };
    },
    async ghost(stageKey, uid) {
      return this.api(`${ROOT}/gh/${stageKey}/${uid}`);
    },
  };

  G.NET = NET;
})();
