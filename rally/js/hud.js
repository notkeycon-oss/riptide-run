// Go Fast Rally — in-race HUD: timer, pace-note cards, speedo, minimap, messages.
(function () {
  const G = window.G;
  const $ = (id) => document.getElementById(id);

  const SEV_ANGLE = { 6: 22, 5: 40, 4: 62, 3: 88, 2: 112, 1: 140, hp: 185 };

  // SVG arrow for a pace note
  G.noteIcon = function (n) {
    const W = 'stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"';
    if (n.kind === 'turn') {
      const ang = (SEV_ANGLE[n.sev] * Math.PI) / 180;
      const dir = n.dir;
      const R = n.sev === 'hp' ? 10 : 13;
      const pts = [[30, 56], [30, 36]];
      const cx = 30 + dir * R, cy = 36;
      const steps = 14;
      for (let i = 1; i <= steps; i++) {
        const a = (ang * i) / steps;
        pts.push([cx - dir * R * Math.cos(a), cy - R * Math.sin(a)]);
      }
      // tightening/opening: bend the end a bit more or less
      const last = pts[pts.length - 1], prev = pts[pts.length - 2];
      let tx = last[0] - prev[0], ty = last[1] - prev[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      let ex = last[0] + tx * 6, ey = last[1] + ty * 6;
      pts.push([ex, ey]);
      const d = 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
      // arrow head
      const hx = ex + tx * 5, hy = ey + ty * 5;
      const nx = -ty, ny = tx;
      const head = `M${(ex + nx * 7).toFixed(1)} ${(ey + ny * 7).toFixed(1)} L${hx.toFixed(1)} ${hy.toFixed(1)} L${(ex - nx * 7).toFixed(1)} ${(ey - ny * 7).toFixed(1)}`;
      return `<svg viewBox="0 0 60 64"><path d="${d}" ${W}/><path d="${head}" ${W}/></svg>`;
    }
    if (n.kind === 'jump') return `<svg viewBox="0 0 60 64"><path d="M6 50 L26 50 L40 30" ${W}/><path d="M44 22 Q50 18 56 24" ${W} stroke-dasharray="3 6"/><path d="M8 58 L52 58" ${W} stroke-width="3"/></svg>`;
    if (n.kind === 'crest') return `<svg viewBox="0 0 60 64"><path d="M4 50 Q30 14 56 50" ${W}/></svg>`;
    if (n.kind === 'dip') return `<svg viewBox="0 0 60 64"><path d="M4 22 Q30 60 56 22" ${W}/></svg>`;
    if (n.kind === 'narrows') return `<svg viewBox="0 0 60 64"><path d="M14 58 L24 10 M46 58 L36 10" ${W}/></svg>`;
    if (n.kind === 'finish') return `<svg viewBox="0 0 60 64"><path d="M16 58 L16 8" ${W}/><path d="M16 10 L46 10 L46 30 L16 30" stroke="#fff" stroke-width="3" fill="#fff"/></svg>`;
    return '';
  };

  class HUD {
    constructor() {
      this.el = $('hud');
      this.t = { timer: $('timer'), delta: $('delta'), pen: $('pen'), best: $('bestRow'), stage: $('stageName'), speed: $('speed'), unit: $('unit'), gear: $('gear'), rpm: $('rpmFill'), boost: $('boostFill'), boostBar: $('boostBar'), notes: $('notes'), msg: $('msg'), sub: $('sub'), toast: $('toast'), wrong: $('wrong'), prog: $('progFill'), progGhost: $('progGhost'), progTxt: $('progTxt'), progBar: $('progBar'), dmg: $('dmg'), fps: $('fps') };
      this.mini = $('mini');
      this.mctx = this.mini.getContext('2d');
      this.msgT = 0;
      this.subT = 0;
      this.toastT = 0;
      this.noteKey = '';
      this.slow = 0;
      this.lastDmg = '';
    }
    show(on) {
      this.el.classList.toggle('hidden', !on);
    }
    flash(text, dur, color) {
      const m = this.t.msg;
      m.textContent = text;
      m.style.color = color || '#fff';
      m.style.opacity = 1;
      this.msgT = dur || 1.2;
    }
    flashSub(html, dur) {
      this.t.sub.innerHTML = html;
      this.t.sub.style.opacity = 1;
      this.subT = dur || 2;
    }
    toast(text, dur) {
      this.t.toast.textContent = text;
      this.t.toast.style.opacity = 1;
      this.toastT = dur || 1.6;
    }
    setStage(name, splits, len) {
      this.t.stage.textContent = name.toUpperCase();
      this.t.progBar.querySelectorAll('.psplit').forEach((e) => e.remove());
      if (len) {
        for (const s of splits) {
          const d = document.createElement('div');
          d.className = 'psplit';
          d.style.left = (s * 100).toFixed(1) + '%';
          this.t.progBar.appendChild(d);
        }
      }
      this.noteKey = '';
      this.t.notes.innerHTML = '';
      this.t.msg.style.opacity = 0;
      this.t.sub.style.opacity = 0;
      this.t.toast.style.opacity = 0;
      this.t.wrong.style.display = 'none';
      this.t.dmg.innerHTML = '';
      this.lastDmg = '';
    }

    tick(dt) {
      if (this.msgT > 0 && (this.msgT -= dt) <= 0) this.t.msg.style.opacity = 0;
      if (this.subT > 0 && (this.subT -= dt) <= 0) this.t.sub.style.opacity = 0;
      if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.t.toast.style.opacity = 0;
    }

    // per-frame values
    car(ph, units) {
      const kmh = ph.speed * 3.6;
      const v = units === 'mph' ? kmh * 0.6214 : kmh;
      this.t.speed.textContent = Math.round(v);
      this.t.unit.textContent = units === 'mph' ? 'MPH' : 'KM/H';
      this.t.gear.textContent = ph.gear < 0 ? 'R' : ph.gear;
      const r = G.clamp((ph.rpm - ph.spec.idle * 0.8) / (ph.spec.redline - ph.spec.idle * 0.8), 0, 1);
      this.t.rpm.style.width = (r * 100).toFixed(1) + '%';
      this.t.rpm.classList.toggle('lim', ph.limiter);
      if (ph.spec.turbo > 0) {
        this.t.boostBar.style.display = '';
        this.t.boost.style.width = (ph.boost * 100).toFixed(0) + '%';
      } else this.t.boostBar.style.display = 'none';
    }

    timer(t, delta, pen, best) {
      this.t.timer.textContent = G.fmtTime(t);
      if (delta != null) {
        this.t.delta.textContent = G.fmtDelta(delta);
        this.t.delta.className = delta <= 0 ? 'pos' : 'neg';
      } else this.t.delta.textContent = '';
      this.t.pen.textContent = pen > 0 ? '+' + pen.toFixed(0) + 's' : '';
      this.t.best.textContent = best || '';
    }

    progress(frac, ghostFrac, text) {
      this.t.prog.style.width = (G.clamp(frac, 0, 1) * 100).toFixed(2) + '%';
      if (ghostFrac != null) {
        this.t.progGhost.style.display = 'block';
        this.t.progGhost.style.left = 'calc(' + (G.clamp(ghostFrac, 0, 1) * 100).toFixed(2) + '% - 2px)';
      } else this.t.progGhost.style.display = 'none';
      this.t.progTxt.textContent = text;
    }

    notes(list, show) {
      if (!show) {
        if (this.noteKey !== 'off') { this.t.notes.innerHTML = ''; this.noteKey = 'off'; }
        return;
      }
      const key = list.map((n) => n.s + (n.caution ? 'c' : '') + (n.crest ? 'k' : '')).join(',');
      if (key === this.noteKey) return;
      this.noteKey = key;
      let html = '';
      list.forEach((n, i) => {
        let cls = 'note';
        let big = '';
        if (n.kind === 'turn') {
          cls += ' s' + n.sev;
          big = n.sev === 'hp' ? 'HP' : n.sev;
        } else {
          cls += ' sx';
          big = n.kind === 'jump' ? (n.big ? 'BIG' : 'JUMP') : n.kind === 'crest' ? 'CREST' : n.kind === 'dip' ? 'DIP' : n.kind === 'narrows' ? 'NARROW' : n.kind === 'finish' ? 'FINISH' : '';
        }
        if (i === 0) cls += ' first';
        if (n.caution) cls += ' caution';
        const mods = [];
        if (n.mods) for (const m of n.mods) mods.push(m === "don't cut" ? "DON'T CUT" : m);
        if (n.crest) mods.push('crest');
        if (n.dist) mods.push(n.dist);
        if (n.link) mods.push(n.link);
        html += `<div class="${cls}" style="position:relative"><div class="nn">${big}</div>${G.noteIcon(n)}<div class="nm">${mods.join(' · ')}</div></div>`;
      });
      this.t.notes.innerHTML = html;
    }

    wrongWay(on) {
      this.t.wrong.style.display = on ? 'block' : 'none';
    }

    damage(D, mult) {
      if (mult <= 0) {
        if (this.lastDmg) { this.t.dmg.innerHTML = ''; this.lastDmg = ''; }
        return;
      }
      const susp = Math.max(...D.susp);
      const items = [['ENGINE', Math.max(D.engine, D.radiator * 0.8)], ['SUSPENSION', susp], ['STEERING', D.steer], ['TYRES', D.punct.some((x) => x) ? 1 : 0]];
      const key = items.map((x) => (x[1] * 10) | 0).join('');
      if (key === this.lastDmg) return;
      this.lastDmg = key;
      let h = '';
      for (const [n, v] of items) {
        if (v < 0.08) continue;
        const col = v > 0.66 ? '#ff4d4f' : v > 0.33 ? '#ffb03a' : '#ffe27a';
        h += `<div class="d"><i><u style="width:${(v * 100).toFixed(0)}%;background:${col}"></u></i>${n === 'TYRES' ? 'PUNCTURE' : n}</div>`;
      }
      this.t.dmg.innerHTML = h;
    }

    fps(on, v) {
      this.t.fps.classList.toggle('hidden', !on);
      if (on) this.t.fps.textContent = v;
    }

    minimap(track, ph, sNow, ghostPos) {
      const c = this.mctx, W = this.mini.width, H = this.mini.height;
      c.clearRect(0, 0, W, H);
      const scale = 0.24;
      const cx = W / 2, cy = H / 2 + 18;
      const f = ph.fwd;
      const yaw = Math.atan2(f.z, f.x);
      const ca = Math.cos(-yaw - Math.PI / 2), sa = Math.sin(-yaw - Math.PI / 2);
      const px = ph.pos.x, pz = ph.pos.z;
      const tf = (x, z) => {
        const dx = x - px, dz = z - pz;
        return [cx + (dx * ca - dz * sa) * scale, cy + (dx * sa + dz * ca) * scale];
      };
      const i0 = Math.max(0, Math.floor((sNow - 260) / track.DS));
      const i1 = Math.min(track.n - 1, Math.floor((sNow + 520) / track.DS));
      const end = track.endless ? i1 : Math.min(i1, Math.floor(track.finishS / track.DS));
      c.save();
      c.beginPath();
      c.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
      c.clip();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      // road
      c.strokeStyle = 'rgba(0,0,0,.55)';
      c.lineWidth = 7;
      c.beginPath();
      for (let i = i0; i <= end; i += 2) {
        const [x, y] = tf(track.px[i], track.pz[i]);
        if (i === i0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.9)';
      c.lineWidth = 3.5;
      c.stroke();
      // driven part
      const iNow = Math.floor(sNow / track.DS);
      c.strokeStyle = 'rgba(255,194,26,.95)';
      c.beginPath();
      for (let i = i0; i <= Math.min(iNow, end); i += 2) {
        const [x, y] = tf(track.px[i], track.pz[i]);
        if (i === i0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      // markers
      const mark = (s, col) => {
        const i = Math.floor(s / track.DS);
        if (i < i0 || i > i1) return;
        const [x, y] = tf(track.px[i], track.pz[i]);
        c.fillStyle = col;
        c.beginPath();
        c.arc(x, y, 5, 0, Math.PI * 2);
        c.fill();
      };
      for (const s of track.splits || []) mark(s, '#4f8cff');
      if (!track.endless) mark(track.finishS, '#ffffff');
      if (ghostPos) {
        const [x, y] = tf(ghostPos.x, ghostPos.z);
        c.fillStyle = '#8fd8ff';
        c.beginPath();
        c.arc(x, y, 4.5, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
      // car arrow
      c.fillStyle = '#ffc21a';
      c.strokeStyle = '#000';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(cx, cy - 9);
      c.lineTo(cx + 6, cy + 7);
      c.lineTo(cx, cy + 3);
      c.lineTo(cx - 6, cy + 7);
      c.closePath();
      c.fill();
      c.stroke();
    }
  }

  G.HUD = HUD;
})();
