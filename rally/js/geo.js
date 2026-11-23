// Go Fast Rally — low-poly geometry helpers (merge with vertex colours, prop models).
(function () {
  const G = window.G;
  const geo = (G.geo = {});
  const tmpC = new THREE.Color();

  // parts: [{g: BufferGeometry, c: color|[r,g,b], m: Matrix4 (optional)}]
  // Returns a non-indexed BufferGeometry with flat normals and a colour attribute.
  geo.merge = function (parts, smooth) {
    let total = 0;
    const prepared = parts.map((p) => {
      let g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
      if (p.m) g.applyMatrix4(p.m);
      total += g.attributes.position.count;
      return { g, c: p.c };
    });
    const pos = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    let o = 0;
    for (const p of prepared) {
      const a = p.g.attributes.position.array;
      pos.set(a, o * 3);
      if (Array.isArray(p.c)) tmpC.setRGB(p.c[0], p.c[1], p.c[2]);
      else tmpC.set(p.c);
      const cnt = p.g.attributes.position.count;
      const vc = p.g.attributes.color;
      for (let i = 0; i < cnt; i++) {
        if (vc) {
          col[(o + i) * 3] = vc.getX(i) * tmpC.r;
          col[(o + i) * 3 + 1] = vc.getY(i) * tmpC.g;
          col[(o + i) * 3 + 2] = vc.getZ(i) * tmpC.b;
        } else {
          col[(o + i) * 3] = tmpC.r;
          col[(o + i) * 3 + 1] = tmpC.g;
          col[(o + i) * 3 + 2] = tmpC.b;
        }
      }
      o += cnt;
      p.g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeVertexNormals();
    if (smooth) {
      /* flat normals already; smooth option ignored for non-indexed */
    }
    out.computeBoundingSphere();
    return out;
  };

  const M = () => new THREE.Matrix4();
  geo.mat = function (x, y, z, rx, ry, rz, sx, sy, sz) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
    return m;
  };

  // random per-vertex jitter so rocks/foliage look hand-made
  geo.jitter = function (g, amt, seed) {
    const r = G.rng(seed || 1);
    const p = g.attributes.position;
    const map = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
      let d = map.get(k);
      if (!d) map.set(k, (d = [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]));
      p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
    }
    return g;
  };

  // ---------- vegetation & props (unit scale, origin at ground) ----------
  geo.tree = function (type, theme) {
    const C = theme.colors;
    const parts = [];
    const cyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg || 6, 1);
    const cone = (r, h, seg) => new THREE.ConeGeometry(r, h, seg || 7, 1);
    if (type === 'pine' || type === 'snowpine') {
      parts.push({ g: cyl(0.16, 0.26, 2.4, 5), c: '#5a3f2a', m: geo.mat(0, 1.2, 0) });
      const tiers = [[2.3, 3.4, 2.4], [1.85, 3.0, 4.2], [1.35, 2.6, 5.9], [0.8, 2.0, 7.4]];
      tiers.forEach((t, i) => {
        parts.push({ g: geo.jitter(cone(t[0], t[1], 7), 0.25, i + 3), c: i % 2 ? '#2f5a2c' : '#2a5128', m: geo.mat(0, t[2], 0, 0, i * 0.7, 0) });
        if (type === 'snowpine') parts.push({ g: cone(t[0] * 0.75, t[1] * 0.45, 7), c: '#f4f8fc', m: geo.mat(0, t[2] + t[1] * 0.3, 0, 0, i * 0.7, 0) });
      });
    } else if (type === 'spruce') {
      parts.push({ g: cyl(0.14, 0.22, 2, 5), c: '#4c3626', m: geo.mat(0, 1, 0) });
      for (let i = 0; i < 5; i++) {
        const r = 1.7 - i * 0.3, y = 2.2 + i * 1.6;
        parts.push({ g: geo.jitter(cone(r, 2.4, 6), 0.2, i + 11), c: i % 2 ? '#24452a' : '#1f3f25', m: geo.mat(0, y, 0, 0, i, 0) });
      }
      if (theme.snowbanks) parts.push({ g: cone(0.7, 1.2, 6), c: '#f4f8fc', m: geo.mat(0, 9.2, 0) });
    } else if (type === 'birch') {
      parts.push({ g: cyl(0.12, 0.18, 4.6, 5), c: '#e6e2d6', m: geo.mat(0, 2.3, 0) });
      parts.push({ g: geo.jitter(new THREE.IcosahedronGeometry(1.6, 0), 0.5, 4), c: '#7ea545', m: geo.mat(0, 5.2, 0, 0, 0, 0, 1, 1.25, 1) });
      parts.push({ g: geo.jitter(new THREE.IcosahedronGeometry(1.1, 0), 0.4, 5), c: '#8db552', m: geo.mat(0.6, 6.4, 0.3) });
    } else if (type === 'broad') {
      parts.push({ g: cyl(0.2, 0.32, 3, 5), c: '#5d452f', m: geo.mat(0, 1.5, 0) });
      parts.push({ g: geo.jitter(new THREE.IcosahedronGeometry(2.4, 0), 0.8, 6), c: '#4e7a35', m: geo.mat(0, 4.4, 0, 0, 0, 0, 1.2, 0.9, 1.2) });
      parts.push({ g: geo.jitter(new THREE.IcosahedronGeometry(1.5, 0), 0.5, 7), c: '#5a8a3c', m: geo.mat(1.0, 5.3, 0.5) });
    } else if (type === 'cypress') {
      parts.push({ g: cyl(0.12, 0.2, 1.2, 5), c: '#4f3a28', m: geo.mat(0, 0.6, 0) });
      parts.push({ g: geo.jitter(new THREE.IcosahedronGeometry(1, 1), 0.15, 8), c: '#2e4c2a', m: geo.mat(0, 4.4, 0, 0, 0, 0, 1.05, 4.0, 1.05) });
    } else if (type === 'cactus') {
      parts.push({ g: cyl(0.32, 0.36, 4.2, 7), c: '#4d7a3a', m: geo.mat(0, 2.1, 0) });
      parts.push({ g: cyl(0.22, 0.22, 1.2, 6), c: '#4d7a3a', m: geo.mat(0.6, 2.1, 0, 0, 0, Math.PI / 2) });
      parts.push({ g: cyl(0.2, 0.22, 1.6, 6), c: '#4d7a3a', m: geo.mat(1.1, 2.9, 0) });
      parts.push({ g: cyl(0.2, 0.2, 0.9, 6), c: '#4d7a3a', m: geo.mat(-0.5, 2.8, 0, 0, 0, Math.PI / 2) });
      parts.push({ g: cyl(0.18, 0.2, 1.3, 6), c: '#4d7a3a', m: geo.mat(-0.9, 3.4, 0) });
    } else if (type === 'deadtree') {
      parts.push({ g: cyl(0.12, 0.26, 4, 5), c: '#6e5844', m: geo.mat(0, 2, 0, 0, 0, 0.06) });
      parts.push({ g: cyl(0.06, 0.1, 2, 4), c: '#6e5844', m: geo.mat(0.6, 3.2, 0, 0, 0, -0.9) });
      parts.push({ g: cyl(0.05, 0.09, 1.6, 4), c: '#6e5844', m: geo.mat(-0.5, 3.6, 0.2, 0.3, 0, 0.8) });
    } else if (type === 'juniper') {
      parts.push({ g: cyl(0.12, 0.2, 1.2, 5), c: '#5b4634', m: geo.mat(0, 0.6, 0) });
      parts.push({ g: geo.jitter(new THREE.IcosahedronGeometry(1.4, 0), 0.6, 9), c: '#5f6e3a', m: geo.mat(0, 2.0, 0, 0, 0, 0, 1.2, 0.85, 1.2) });
    } else if (type === 'rock') {
      parts.push({ g: geo.jitter(new THREE.DodecahedronGeometry(1, 0), 0.55, 21), c: C.rock, m: geo.mat(0, 0.25, 0, 0, 0, 0, 1.3, 0.75, 1.0) });
    } else if (type === 'bush') {
      const c = theme.snowbanks ? '#dfe7ee' : C.ground2;
      parts.push({ g: geo.jitter(new THREE.IcosahedronGeometry(0.9, 0), 0.4, 31), c: tintHex(c, 0.75), m: geo.mat(0, 0.45, 0, 0, 0, 0, 1.3, 0.8, 1.3) });
    }
    return geo.merge(parts);
  };

  function tintHex(hex, f) {
    const c = new THREE.Color(hex);
    c.multiplyScalar(f);
    return '#' + c.getHexString();
  }
  geo.tintHex = tintHex;

  // spectator: body + head, origin at feet
  // returns {body (tinted per instance), rest (legs + head)}
  geo.person = function () {
    return {
      body: geo.merge([
        { g: new THREE.BoxGeometry(0.46, 0.62, 0.3), c: '#ffffff', m: geo.mat(0, 1.12, 0) },
        { g: new THREE.BoxGeometry(0.12, 0.55, 0.12), c: '#ffffff', m: geo.mat(0.32, 1.62, 0, 0, 0, -0.35) },
        { g: new THREE.BoxGeometry(0.12, 0.55, 0.12), c: '#ffffff', m: geo.mat(-0.32, 1.62, 0, 0, 0, 0.35) },
      ]),
      rest: geo.merge([
        { g: new THREE.BoxGeometry(0.34, 0.8, 0.22), c: '#33405c', m: geo.mat(0, 0.4, 0) },
        { g: new THREE.IcosahedronGeometry(0.15, 1), c: '#e8b896', m: geo.mat(0, 1.6, 0) },
      ]),
    };
  };

  // canvas texture with text (for banners)
  geo.textTexture = function (text, bg, fg, w, h) {
    const cv = document.createElement('canvas');
    cv.width = w || 512;
    cv.height = h || 128;
    const x = cv.getContext('2d');
    x.fillStyle = bg;
    x.fillRect(0, 0, cv.width, cv.height);
    // checker strip
    const sq = cv.height / 8;
    for (let i = 0; i < cv.width / sq; i++) {
      x.fillStyle = i % 2 ? '#111' : '#fff';
      x.fillRect(i * sq, 0, sq, sq);
      x.fillStyle = i % 2 ? '#fff' : '#111';
      x.fillRect(i * sq, cv.height - sq, sq, sq);
    }
    x.fillStyle = fg;
    x.font = 'italic 800 ' + Math.floor(cv.height * 0.55) + 'px "Barlow Condensed", Impact, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, cv.width / 2, cv.height / 2 + 2);
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4;
    return t;
  };
})();

// ---------- procedural surface textures (canvas, cached) ----------
(function () {
  const G = window.G;
  const cache = {};
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function tex(c, rep) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (rep) t.repeat.set(rep[0], rep[1]);
    return t;
  }
  // Road textures: u runs across the road (0..1), v along it. Grey-scale so the
  // vertex colours (ruts, edge lines, theme colour) tint them.
  G.geo.roadTexture = function (kind) {
    if (cache['road_' + kind]) return cache['road_' + kind];
    const W = 256, H = 512;
    const c = canvas(W, H);
    const x = c.getContext('2d');
    const r = G.rng(kind.length * 977 + 3);
    const img = x.createImageData(W, H);
    const d = img.data;
    const N = G.Noise(11);
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const u = i / W, v = j / H;
        let g = 0.86;
        const n = N.fbm(u * 6, v * 12, 3, 2, 0.5);
        if (kind === 'tarmac') g = 0.8 + n * 0.08 + (r() - 0.5) * 0.12;
        else if (kind === 'snow') g = 0.9 + n * 0.05 + (r() - 0.5) * 0.05;
        else g = 0.82 + n * 0.1 + (r() - 0.5) * 0.18;
        const o = (j * W + i) * 4;
        const c8 = Math.max(0, Math.min(255, g * 255));
        d[o] = d[o + 1] = d[o + 2] = c8;
        d[o + 3] = 255;
      }
    x.putImageData(img, 0, 0);
    if (kind === 'gravel' || kind === 'dirt') {
      // loose stones, more toward the edges and the centre ridge
      for (let k = 0; k < 5200; k++) {
        const u = r();
        const edge = Math.min(u, 1 - u) < 0.14 || Math.abs(u - 0.5) < 0.07 ? 1 : 0.35;
        if (r() > edge) continue;
        const px = u * W, py = r() * H, s = 0.5 + r() * 1.3;
        const l = r() < 0.55 ? 255 : 90;
        x.fillStyle = `rgba(${l},${l},${l},${0.18 + r() * 0.25})`;
        x.beginPath();
        x.ellipse(px, py, s, s * (0.6 + r() * 0.5), r() * 3, 0, Math.PI * 2);
        x.fill();
      }
      // smooth, darker wheel tracks
      for (const cu of [0.3, 0.7]) {
        const gr = x.createLinearGradient((cu - 0.09) * W, 0, (cu + 0.09) * W, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(0.5, 'rgba(40,30,20,0.22)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gr;
        x.fillRect((cu - 0.09) * W, 0, 0.18 * W, H);
      }
    } else if (kind === 'tarmac') {
      // patches and cracks
      for (let k = 0; k < 7; k++) {
        x.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.08})`;
        x.fillRect(r() * W * 0.8, r() * H, 30 + r() * 60, 20 + r() * 90);
      }
      x.strokeStyle = 'rgba(0,0,0,0.35)';
      x.lineWidth = 1;
      for (let k = 0; k < 14; k++) {
        let px = r() * W, py = r() * H;
        x.beginPath();
        x.moveTo(px, py);
        for (let q = 0; q < 6; q++) { px += (r() - 0.5) * 22; py += (r() - 0.3) * 18; x.lineTo(px, py); }
        x.stroke();
      }
      // dashed centre line
      x.fillStyle = 'rgba(255,255,255,0.95)';
      x.fillRect(W * 0.495, 0, W * 0.012, H * 0.45);
      // rubbered-in lines where tyres run
      for (const cu of [0.28, 0.72]) {
        x.fillStyle = 'rgba(0,0,0,0.12)';
        x.fillRect((cu - 0.05) * W, 0, 0.1 * W, H);
      }
    } else if (kind === 'snow') {
      // compacted tyre tracks
      x.strokeStyle = 'rgba(120,135,150,0.35)';
      for (const cu of [0.26, 0.31, 0.69, 0.74]) {
        x.lineWidth = 3 + r() * 3;
        x.beginPath();
        x.moveTo(cu * W, 0);
        for (let q = 1; q <= 8; q++) x.lineTo(cu * W + (r() - 0.5) * 6, (q / 8) * H);
        x.stroke();
      }
    }
    return (cache['road_' + kind] = tex(c));
  };
  // ground detail: blades, specks and soft blotches, tiled in world space
  G.geo.groundTexture = function (kind) {
    if (cache['ground_' + kind]) return cache['ground_' + kind];
    const S = 256;
    const c = canvas(S, S);
    const x = c.getContext('2d');
    const r = G.rng(kind.length * 31 + 7);
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, S, S);
    const N = G.Noise(5);
    const img = x.getImageData(0, 0, S, S);
    const d = img.data;
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        // tileable blotches
        const a = (i / S) * Math.PI * 2, b = (j / S) * Math.PI * 2;
        const n = N.n2(Math.cos(a) * 1.5 + Math.sin(b), Math.sin(a) * 1.5 + Math.cos(b));
        const g = (kind === 'snow' ? 0.95 : 0.88) + n * (kind === 'snow' ? 0.04 : 0.08) + (r() - 0.5) * (kind === 'snow' ? 0.04 : 0.1);
        const o = (j * S + i) * 4;
        d[o] = d[o + 1] = d[o + 2] = Math.max(0, Math.min(255, g * 255));
      }
    x.putImageData(img, 0, 0);
    if (kind === 'grass') {
      for (let k = 0; k < 2200; k++) {
        const px = r() * S, py = r() * S;
        const l = r() < 0.6 ? 70 : 255;
        x.strokeStyle = `rgba(${l},${l},${l},${0.2 + r() * 0.25})`;
        x.lineWidth = 1;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px + (r() - 0.5) * 3, py - 2 - r() * 4);
        x.stroke();
      }
    } else if (kind === 'sand') {
      for (let k = 0; k < 1600; k++) {
        const l = r() < 0.5 ? 80 : 255;
        x.fillStyle = `rgba(${l},${l},${l},${0.15 + r() * 0.25})`;
        x.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
      }
    } else if (kind === 'snow') {
      for (let k = 0; k < 500; k++) {
        x.fillStyle = `rgba(150,170,190,${0.08 + r() * 0.12})`;
        x.fillRect(r() * S, r() * S, 2 + r() * 4, 1);
      }
    }
    return (cache['ground_' + kind] = tex(c));
  };
  // grass tuft: a few crossed blades, origin at ground
  G.geo.grassTuft = function () {
    const pos = [];
    const r = G.rng(3);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI + r() * 0.4;
      const ca = Math.cos(a), sa = Math.sin(a);
      const h = 0.45 + r() * 0.35, w = 0.09;
      const lean = (r() - 0.5) * 0.25;
      pos.push(-ca * w, 0, -sa * w, ca * w, 0, sa * w, lean * ca, h, lean * sa);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // normals point up so tufts take the light like the ground under them
    const n = [];
    for (let i = 0; i < pos.length / 3; i++) n.push(0, 1, 0);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    const col = [];
    for (let i = 0; i < pos.length / 3; i++) { const top = i % 3 === 2; const v = top ? 1.15 : 0.7; col.push(v, v, v); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  };
})();
