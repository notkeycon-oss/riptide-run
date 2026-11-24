// Go Fast Rally — keyboard, gamepad and touch input.
(function () {
  const G = window.G;

  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    Space: 'hand', ShiftLeft: 'hand', ShiftRight: 'hand',
  };
  const ACTIONS = { KeyC: 'camera', KeyR: 'reset', Escape: 'pause', KeyP: 'pause', KeyE: 'shiftUp', KeyQ: 'shiftDown', KeyT: 'restart', KeyM: 'mute', KeyH: 'help', KeyV: 'look', Enter: 'confirm', KeyF: 'fps', KeyG: 'ghost' };

  class Input {
    constructor() {
      this.keys = {};
      this.touch = {};
      this.queue = [];
      this.state = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
      this.ks = 0; // keyboard steer smoothing
      this.usingPad = false;
      this.padPrev = [];
      this.sens = 1;
      this.enabled = true;
      window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
        const k = KEYMAP[e.code];
        if (k) {
          this.keys[k] = true;
          this.usingPad = false;
          if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
        }
        const a = ACTIONS[e.code];
        if (a && !e.repeat) this.queue.push(a);
      });
      window.addEventListener('keyup', (e) => {
        const k = KEYMAP[e.code];
        if (k) this.keys[k] = false;
      });
      window.addEventListener('blur', () => {
        this.keys = {};
        this.touch = {};
      });
    }

    bindTouch(root) {
      const btns = root.querySelectorAll('[data-t]');
      btns.forEach((b) => {
        const k = b.getAttribute('data-t');
        const on = (e) => {
          e.preventDefault();
          if (k.startsWith('act:')) this.queue.push(k.slice(4));
          else this.touch[k] = true;
          b.classList.add('on');
        };
        const off = (e) => {
          e.preventDefault();
          if (!k.startsWith('act:')) this.touch[k] = false;
          b.classList.remove('on');
        };
        b.addEventListener('touchstart', on, { passive: false });
        b.addEventListener('touchend', off, { passive: false });
        b.addEventListener('touchcancel', off, { passive: false });
        b.addEventListener('mousedown', on);
        b.addEventListener('mouseup', off);
        b.addEventListener('mouseleave', off);
      });
    }

    take(action) {
      const i = this.queue.indexOf(action);
      if (i >= 0) {
        this.queue.splice(i, 1);
        return true;
      }
      return false;
    }
    clear() {
      this.queue.length = 0;
    }

    poll(dt) {
      const s = this.state;
      const K = this.keys, T = this.touch;
      let thr = K.up || T.up ? 1 : 0;
      let brk = K.down || T.down ? 1 : 0;
      let hand = K.hand || T.hand ? 1 : 0;
      const kl = K.left || T.left, kr = K.right || T.right;
      const target = (kr ? 1 : 0) - (kl ? 1 : 0);
      // keyboard steering: ramps in, snaps back faster
      const rateIn = 3.2 * this.sens, rateOut = 5.5;
      if (target !== 0) {
        if (Math.sign(target) !== Math.sign(this.ks) && this.ks !== 0) this.ks += Math.sign(target) * rateOut * dt;
        else this.ks += Math.sign(target) * rateIn * dt;
        this.ks = G.clamp(this.ks, -1, 1);
      } else {
        const d = Math.min(Math.abs(this.ks), rateOut * dt);
        this.ks -= Math.sign(this.ks) * d;
      }
      let steer = this.ks;
      // gamepad
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let pad = null;
      for (const p of pads) if (p && p.connected) { pad = p; break; }
      if (pad) {
        const ax = pad.axes[0] || 0;
        const dz = 0.1;
        let a = Math.abs(ax) < dz ? 0 : (Math.abs(ax) - dz) / (1 - dz);
        a = Math.pow(a, 1.35) * Math.sign(ax);
        const bt = (i) => (pad.buttons[i] ? pad.buttons[i].value || (pad.buttons[i].pressed ? 1 : 0) : 0);
        const pthr = bt(7), pbrk = bt(6), phand = Math.max(bt(0), bt(1) * 0);
        if (Math.abs(a) > 0.02 || pthr > 0.05 || pbrk > 0.05 || phand > 0) this.usingPad = true;
        if (this.usingPad) {
          steer = G.clamp(a * this.sens, -1, 1);
          this.ks = 0;
          thr = Math.max(thr, pthr);
          brk = Math.max(brk, pbrk);
          hand = Math.max(hand, phand);
          // d-pad steering
          if (pad.buttons[14] && pad.buttons[14].pressed) steer = -1;
          if (pad.buttons[15] && pad.buttons[15].pressed) steer = 1;
        }
        const map = { 3: 'reset', 2: 'camera', 5: 'shiftUp', 4: 'shiftDown', 9: 'pause', 8: 'camera', 12: 'look' };
        for (const i in map) {
          const pr = pad.buttons[i] && pad.buttons[i].pressed;
          if (pr && !this.padPrev[i]) this.queue.push(map[i]);
          this.padPrev[i] = pr;
        }
        const a0 = pad.buttons[0] && pad.buttons[0].pressed;
        if (a0 && !this.padPrev[0]) this.queue.push('confirm');
        this.padPrev[0] = a0;
      }
      s.throttle = this.enabled ? thr : 0;
      s.brake = this.enabled ? brk : 0;
      s.handbrake = this.enabled ? hand : 0;
      s.steer = this.enabled ? steer : 0;
      return s;
    }
  }

  G.input = new Input();
})();
