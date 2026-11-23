// Go Fast Rally — camera rigs: chase, far chase, bonnet, bumper, helicopter, TV replay, menu orbit.
(function () {
  const G = window.G;
  const V3 = THREE.Vector3;
  G.CAM_NAMES = ['CHASE', 'FAR CHASE', 'COCKPIT', 'BONNET', 'BUMPER', 'HELICOPTER'];

  class CamRig {
    constructor(camera) {
      this.cam = camera;
      this.mode = 0;
      this.yaw = 0;
      this.pos = new V3();
      this.look = new V3();
      this.shake = 0;
      this.init = false;
      this.fov = 62;
      this.t = 0;
      this.tv = null;
      this._v = [new V3(), new V3(), new V3(), new V3()];
      this.orbitA = 0;
    }
    reset() {
      this.init = false;
      this.tv = null;
    }
    bump(a) {
      this.shake = Math.min(1.2, this.shake + a);
    }

    // car: {pos, q, vel, speed, L}, world for ground checks
    follow(ph, world, dt, settings) {
      const cam = this.cam;
      this.viewShift(0);
      const [f, tmp, tgt, off] = this._v;
      f.set(0, 0, -1).applyQuaternion(ph.q);
      const carYaw = Math.atan2(f.x, f.z);
      if (!this.init) {
        this.yaw = carYaw;
        this.init = true;
      }
      // follow heading; blend toward velocity when sliding fast so drifts read well
      let tyaw = carYaw;
      if (ph.speed > 6 && ph.fwdSpeed > 0) {
        const vy = Math.atan2(ph.vel.x, ph.vel.z);
        tyaw = carYaw + G.wrapAngle(vy - carYaw) * 0.35;
      }
      const dy = G.wrapAngle(tyaw - this.yaw);
      this.yaw += dy * Math.min(1, dt * (this.mode === 5 ? 2.2 : 5.0));
      this.t += dt;
      const sp = ph.speed;
      let fov = 60 + Math.min(16, sp * 0.3);
      const m = this.mode;
      if (m === 0 || m === 1) {
        const dist = (m === 0 ? 5.6 : 8.2) + sp * 0.025;
        const h = m === 0 ? 1.95 : 2.9;
        const sx = Math.sin(this.yaw), sz = Math.cos(this.yaw);
        tgt.set(ph.pos.x - sx * dist, ph.pos.y + h, ph.pos.z - sz * dist);
        // keep above ground
        const gy = world.heightAt(tgt.x, tgt.z) + 0.9;
        if (tgt.y < gy) tgt.y = gy;
        if (!this._placed) {
          this.pos.copy(tgt);
          this._placed = true;
        }
        const k = 1 - Math.exp(-dt * 14);
        this.pos.lerp(tgt, k);
        this.pos.y = G.lerp(this.pos.y, tgt.y, 1 - Math.exp(-dt * 7));
        if (this.pos.y < gy) this.pos.y = gy;
        cam.position.copy(this.pos);
        this.look.set(ph.pos.x + sx * 3, ph.pos.y + 0.75, ph.pos.z + sz * 3);
        cam.up.set(0, 1, 0);
        cam.lookAt(this.look);
      } else if (m === 2) {
        // first person: driver's eyes, head pushed around by g-forces
        const e = ph.eyeLocal || off.set(-0.36, 0.7, 0.2);
        const hs = this.head || (this.head = { x: 0, y: 0, z: 0 });
        const latA = G.clamp((ph.w ? ph.w.y : 0) * ph.speed * 0.006, -0.06, 0.06);
        const lonA = G.clamp(-(ph.fwdSpeed - (this._lastFwd == null ? ph.fwdSpeed : this._lastFwd)) / Math.max(dt, 1e-3) * 0.004, -0.05, 0.05);
        this._lastFwd = ph.fwdSpeed;
        hs.x = G.damp(hs.x, latA, 6, dt);
        hs.z = G.damp(hs.z, lonA, 5, dt);
        const vb = (ph.speed > 3 ? 0.004 : 0) * Math.sin(this.t * 41);
        off.set(e.x + hs.x, e.y + vb, e.z + hs.z);
        cam.position.copy(off).applyQuaternion(ph.q).add(ph.pos);
        tmp.set(e.x + hs.x * 0.3, e.y - 1.2, e.z - 20).applyQuaternion(ph.q).add(ph.pos);
        // the neck keeps the horizon a little steadier than the car
        cam.up.set(0, 1, 0).applyQuaternion(ph.q).lerp(this._v[3].set(0, 1, 0), 0.35).normalize();
        cam.lookAt(tmp);
        fov = 74 + Math.min(6, sp * 0.12);
        this._placed = false;
      } else if (m === 3 || m === 4) {
        // cameras locked to the car
        const local = m === 3 ? (ph.bonnetLocal ? off.copy(ph.bonnetLocal) : off.set(0, 0.55, -0.9)) : off.set(0, -ph.spec.cgH + 0.55, -ph.L / 2 - 0.15);
        cam.position.copy(local).applyQuaternion(ph.q).add(ph.pos);
        tmp.set(0, 0, -20).add(local).applyQuaternion(ph.q).add(ph.pos);
        cam.up.set(0, 1, 0).applyQuaternion(ph.q);
        cam.lookAt(tmp);
        fov = 72 + Math.min(10, sp * 0.18);
        this._placed = false;
      } else {
        // helicopter / tactical
        const sx = Math.sin(this.yaw), sz = Math.cos(this.yaw);
        tgt.set(ph.pos.x - sx * 15, ph.pos.y + 26, ph.pos.z - sz * 15);
        this.pos.lerp(tgt, 1 - Math.exp(-dt * 6));
        cam.position.copy(this.pos);
        cam.up.set(0, 1, 0);
        cam.lookAt(ph.pos.x + sx * 6, ph.pos.y, ph.pos.z + sz * 6);
        fov = 50;
        this._placed = false;
      }
      // shake: road roughness + impacts
      const rough = settings && settings.speedFx === false ? 0 : Math.min(1, sp / 35) * 0.012;
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const sh = rough + this.shake * 0.08;
      if (sh > 0) {
        cam.position.x += (Math.random() - 0.5) * sh;
        cam.position.y += (Math.random() - 0.5) * sh;
      }
      this.fov = G.damp(this.fov, fov, 3, dt);
      if (Math.abs(cam.fov - this.fov) > 0.05) {
        cam.fov = this.fov;
        cam.updateProjectionMatrix();
      }
    }

    // TV style trackside cameras for replays
    replay(pos, s, track, world, dt) {
      const cam = this.cam;
      this.viewShift(0);
      const spacing = 130;
      const k = Math.max(0, Math.floor((s - track.START + 30) / spacing));
      const want = track.START + k * spacing + 70;
      if (!this.tv || this.tv.s !== want) {
        const p = track.pointAt(want, {});
        const side = (k % 2 ? 1 : -1);
        const d = side * (p.hw * 1.24 + 6 + (k % 3) * 2.5);
        const rx = -Math.sin(p.h), rz = Math.cos(p.h);
        const x = p.x + rx * d, z = p.z + rz * d;
        const y = world.heightAt(x, z) + 1.8 + (k % 4 === 0 ? 5 : 0);
        this.tv = { s: want, x, y, z };
      }
      cam.position.set(this.tv.x, this.tv.y, this.tv.z);
      cam.up.set(0, 1, 0);
      cam.lookAt(pos.x, pos.y + 0.4, pos.z);
      const dist = cam.position.distanceTo(pos);
      const fov = G.clamp((2 * Math.atan(5.5 / Math.max(dist, 1)) * 180) / Math.PI, 8, 65);
      this.fov = G.damp(this.fov, fov, 6, dt);
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }

    orbit(pos, q, dt, world, shift) {
      const cam = this.cam;
      this.viewShift(shift || 0);
      this.orbitA += dt * 0.18;
      const r = 6.2;
      const x = pos.x + Math.cos(this.orbitA) * r, z = pos.z + Math.sin(this.orbitA) * r;
      let y = pos.y + 1.5;
      const gy = world.heightAt(x, z) + 0.6;
      if (y < gy) y = gy;
      cam.position.set(x, y, z);
      cam.up.set(0, 1, 0);
      cam.lookAt(pos.x, pos.y + 0.2, pos.z);
      if (cam.fov !== 45) {
        cam.fov = 45;
        cam.updateProjectionMatrix();
      }
      this.fov = 45;
      this._placed = false;
    }
  }

  // shift the rendered view sideways (keeps the car clear of side panels)
  CamRig.prototype.viewShift = function (f) {
    const cam = this.cam;
    if (!f) {
      if (cam.view && cam.view.enabled) cam.clearViewOffset();
      return;
    }
    const w = window.innerWidth, h = window.innerHeight;
    cam.setViewOffset(w, h, w * f, 0, w, h);
  };

  G.CamRig = CamRig;
})();
