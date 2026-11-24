// Go Fast Rally — low-poly car models: extruded body profiles, liveries,
// working wheels/suspension, lights, and impact deformation.
(function () {
  const G = window.G;

  // side profiles (x: + is the front, y: up from the ground). Arches are carved in.
  function profile(body, L, xmid, wf, wr, r) {
    const s = new THREE.Shape();
    const x0 = xmid - L / 2, x1 = xmid + L / 2;
    const arch = r + 0.07;
    const by = body === 'raid' ? 0.52 : 0.26; // body bottom height
    const hy = r; // wheel centre height
    s.moveTo(x0 + 0.04, by + 0.06);
    // bottom edge, rear arch, front arch
    s.lineTo(wr - arch - 0.02, by);
    s.absarc(wr, hy, arch, Math.PI, 0, true);
    s.lineTo(wf - arch, by);
    s.absarc(wf, hy, arch, Math.PI, 0, true);
    s.lineTo(x1 - 0.06, by);
    const P = (x, y) => s.lineTo(x, y);
    if (body === 'hatch') {
      P(x1, by + 0.1); P(x1 + 0.02, 0.6); P(x1 - 0.12, 0.78); P(xmid + 0.85, 0.98); P(xmid + 0.12, 1.36); P(x0 + 0.62, 1.38); P(x0 + 0.16, 1.09); P(x0, 0.9); P(x0 - 0.02, by + 0.12);
    } else if (body === 'sedan') {
      P(x1 + 0.02, by + 0.12); P(x1 + 0.04, 0.74); P(x1 - 0.05, 0.86); P(xmid + 0.62, 0.94); P(xmid + 0.12, 1.3); P(xmid - 0.95, 1.3); P(xmid - 1.45, 0.96); P(x0 + 0.08, 0.9); P(x0, 0.82); P(x0 - 0.02, by + 0.12);
    } else if (body === 'wedge') {
      P(x1 + 0.02, by + 0.08); P(x1 + 0.03, 0.5); P(x1 - 0.15, 0.62); P(xmid + 0.62, 0.92); P(xmid + 0.02, 1.26); P(xmid - 0.95, 1.26); P(x0 + 0.3, 1.04); P(x0 + 0.05, 1.0); P(x0, 0.78); P(x0 - 0.02, by + 0.1);
    } else {
      // raid truck
      P(x1 + 0.03, by + 0.1); P(x1 + 0.05, 0.98); P(x1 - 0.1, 1.12); P(xmid + 0.82, 1.22); P(xmid + 0.32, 1.78); P(x0 + 0.35, 1.8); P(x0 + 0.05, 1.7); P(x0, 1.1); P(x0 - 0.02, by + 0.12);
    }
    s.closePath();
    return s;
  }
  function liveryTexture(lv, L, H) {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 384;
    const x = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    x.fillStyle = lv.primary;
    x.fillRect(0, 0, w, h);
    // note: u runs rear->front (x0..x1), v runs bottom->top
    x.save();
    x.translate(0, h);
    x.scale(1, -1);
    const pat = lv.pattern;
    if (pat === 'stripes') {
      x.fillStyle = lv.secondary;
      x.fillRect(0, h * 0.3, w, h * 0.14);
      x.fillStyle = lv.accent;
      x.fillRect(0, h * 0.47, w, h * 0.05);
    } else if (pat === 'split') {
      x.fillStyle = lv.secondary;
      x.beginPath();
      x.moveTo(0, 0); x.lineTo(w * 0.62, 0); x.lineTo(w * 0.38, h); x.lineTo(0, h); x.closePath(); x.fill();
      x.fillStyle = lv.accent;
      x.beginPath();
      x.moveTo(w * 0.62, 0); x.lineTo(w * 0.67, 0); x.lineTo(w * 0.43, h); x.lineTo(w * 0.38, h); x.closePath(); x.fill();
    } else if (pat === 'hoop') {
      x.fillStyle = lv.secondary;
      x.fillRect(w * 0.42, 0, w * 0.16, h);
      x.fillStyle = lv.accent;
      x.fillRect(w * 0.4, 0, w * 0.02, h);
      x.fillRect(w * 0.58, 0, w * 0.02, h);
    } else if (pat === 'arrow') {
      x.fillStyle = lv.secondary;
      for (let i = 0; i < 3; i++) {
        const o = w * (0.12 + i * 0.16);
        x.beginPath();
        x.moveTo(o, h * 0.15); x.lineTo(o + w * 0.1, h * 0.42); x.lineTo(o, h * 0.69); x.lineTo(o + w * 0.06, h * 0.69); x.lineTo(o + w * 0.16, h * 0.42); x.lineTo(o + w * 0.06, h * 0.15); x.closePath(); x.fill();
      }
      x.fillStyle = lv.accent;
      x.fillRect(0, h * 0.08, w, h * 0.04);
    }
    // sill
    x.fillStyle = 'rgba(0,0,0,0.55)';
    x.fillRect(0, 0, w, h * 0.06);
    x.restore();
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4;
    return t;
  }

  function numberTexture(num, accent) {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 256;
    const x = cv.getContext('2d');
    x.clearRect(0, 0, 256, 256);
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.roundRect ? x.roundRect(20, 40, 216, 176, 26) : x.rect(20, 40, 216, 176);
    x.fill();
    x.strokeStyle = accent || '#ffd23f';
    x.lineWidth = 10;
    x.stroke();
    x.fillStyle = '#111';
    x.font = 'italic 800 150px "Barlow Condensed", Impact, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(String(num), 128, 134);
    const t = new THREE.CanvasTexture(cv);
    return t;
  }

  const Y_UP = new THREE.Vector3(0, 1, 0);

  // Merge plain-coloured child meshes of a group (no textures, not basic/emissive) into one.
  function mergeInto(group, filter, material, shadow) {
    const parts = [], drop = [];
    for (const o of group.children) {
      if (!o.isMesh || o.material.map || o.material.type === 'MeshBasicMaterial' || Array.isArray(o.material) || !filter(o)) continue;
      o.updateMatrix();
      parts.push({ g: o.geometry, c: '#' + o.material.color.getHexString(), m: o.matrix.clone() });
      drop.push(o);
    }
    if (parts.length < 2) return;
    for (const o of drop) group.remove(o);
    const m = new THREE.Mesh(G.geo.merge(parts), material);
    m.castShadow = true;
    if (shadow) m.receiveShadow = false;
    group.add(m);
    return m;
  }

  // crack pattern for a smashed windscreen
  function crackTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const x = cv.getContext('2d');
    const r = G.rng(42);
    x.strokeStyle = 'rgba(235,245,255,0.85)';
    for (const [cx, cy] of [[90, 120], [180, 150]]) {
      for (let k = 0; k < 11; k++) {
        let a = r() * Math.PI * 2, px = cx, py = cy;
        x.lineWidth = 1 + r() * 1.5;
        x.beginPath();
        x.moveTo(px, py);
        for (let q = 0; q < 6; q++) {
          a += (r() - 0.5) * 0.7;
          px += Math.cos(a) * (10 + r() * 22);
          py += Math.sin(a) * (10 + r() * 22);
          x.lineTo(px, py);
        }
        x.stroke();
      }
      for (let ring = 1; ring <= 3; ring++) {
        x.lineWidth = 0.8;
        x.beginPath();
        x.arc(cx, cy, ring * 14 + r() * 6, 0, Math.PI * 2);
        x.stroke();
      }
    }
    return new THREE.CanvasTexture(cv);
  }

  // Dirt: a shader patch that mixes mud/dust/snow into a material, heavier lower down.
  function addDirt(mat, dirtU, mudU) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDirt = dirtU;
      sh.uniforms.uMud = mudU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDirtY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDirtY = position.y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vDirtY; uniform float uDirt; uniform vec3 uMud;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat dk = uDirt * clamp(1.25 - vDirtY * 0.85, 0.15, 1.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uMud, clamp(dk, 0.0, 0.88));');
    };
    mat.customProgramCacheKey = () => 'dirt';
  }

  // Remove the top faces of the lower body between the windscreen base (a) and the
  // rear glass base (b), so the cabin is open and the crew can be seen through the glass.
  function openLid(geo, a, b) {
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const x0 = Math.min(a[0], b[0]) - 0.04, x1 = Math.max(a[0], b[0]) + 0.04;
    const lineY = (x) => a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    const keep = (i) => {
      for (let k = 0; k < 3; k++) {
        const x = pos.getX(i + k), y = pos.getY(i + k);
        if (x < x0 || x > x1 || Math.abs(y - lineY(x)) > 0.09) return true;
      }
      // a cap face (side of the car) has a normal along z: keep it
      const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
      const ux = pos.getX(i + 1) - ax, uy = pos.getY(i + 1) - ay, uz = pos.getZ(i + 1) - az;
      const vx = pos.getX(i + 2) - ax, vy = pos.getY(i + 2) - ay, vz = pos.getZ(i + 2) - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      return Math.abs(nz / l) > 0.9;
    };
    const P = [], U = [], groups = [];
    for (const gr of geo.groups.length ? geo.groups : [{ start: 0, count: pos.count, materialIndex: 0 }]) {
      const start = P.length / 3;
      for (let i = gr.start; i < gr.start + gr.count; i += 3) {
        if (!keep(i)) continue;
        for (let k = 0; k < 3; k++) {
          P.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
          if (uv) U.push(uv.getX(i + k), uv.getY(i + k));
        }
      }
      groups.push({ start, count: P.length / 3 - start, materialIndex: gr.materialIndex });
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    for (const gr of groups) out.addGroup(gr.start, gr.count, gr.materialIndex);
    geo.dispose();
    return out;
  }

  class CarModel {
    constructor(spec, livery, opts) {
      opts = opts || {};
      this.spec = spec;
      this.ghost = !!opts.ghost;
      const lv = Object.assign({ primary: spec.colors[0], secondary: spec.colors[1], accent: spec.colors[2], pattern: 'stripes', number: 7, rim: '#e8e8e8' }, livery || {});
      this.livery = lv;
      this.group = new THREE.Group();
      this.body = new THREE.Group();
      this.group.add(this.body);
      this.body.position.y = -spec.cgH;
      const S = spec;
      const L = S.dims[0], W = S.dims[1];
      const a = S.wheelbase * (1 - S.cgFront), b = S.wheelbase * S.cgFront;
      const wf = a, wr = -b;
      const xmid = (wf + wr) / 2 + (S.body === 'wedge' ? -0.05 : 0.08);
      const r = S.wheelR;
      this.mats = [];
      const mk = (m) => {
        if (this.ghost) {
          m.transparent = true;
          m.opacity = 0.32;
          m.depthWrite = false;
        }
        this.mats.push(m);
        return m;
      };
      const ws = S.body === 'hatch' ? [[xmid + 0.85, 0.98], [xmid + 0.12, 1.36]] : S.body === 'sedan' ? [[xmid + 0.62, 0.94], [xmid + 0.12, 1.3]] : S.body === 'wedge' ? [[xmid + 0.62, 0.92], [xmid + 0.02, 1.26]] : [[xmid + 0.82, 1.22], [xmid + 0.32, 1.78]];
      this.ws = ws;
      // Body shaping: the cabin leans in above the waistline (tumblehome) and the nose and
      // tail taper in plan view, so the extruded side profile reads as a real car body.
      const belt = ws[0][1] - 0.03, zc = -xmid, halfL = L / 2;
      const bodyBot = S.body === 'raid' ? 0.52 : 0.26;
      this.taper = (y, z) => (1 - 0.3 * Math.max(0, y - belt)) * (1 - 0.11 * Math.pow(G.smoothstep(halfL - 0.9, halfL + 0.05, Math.abs(z - zc)), 1.5)) * (1 - 0.05 * G.smoothstep(bodyBot + 0.25, bodyBot, y));
      const shapeGeo = (geo) => {
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * this.taper(p.getY(i), p.getZ(i)));
        p.needsUpdate = true;
        geo.computeVertexNormals();
        return geo;
      };
      // ----- body: lower shell + roof + pillars + real glass, so you can see the crew inside -----
      const shape = profile(S.body, L, xmid, wf, wr, r);
      const x0b = xmid - L / 2;
      const gh = S.body === 'hatch' ? [[xmid + 0.85, 0.98], [xmid + 0.12, 1.36], [x0b + 0.62, 1.38], [x0b + 0.16, 1.09]]
        : S.body === 'sedan' ? [[xmid + 0.62, 0.94], [xmid + 0.12, 1.3], [xmid - 0.95, 1.3], [xmid - 1.45, 0.96]]
        : S.body === 'wedge' ? [[xmid + 0.62, 0.92], [xmid + 0.02, 1.26], [xmid - 0.95, 1.26], [x0b + 0.3, 1.04]]
        : [[xmid + 0.82, 1.22], [xmid + 0.32, 1.78], [x0b + 0.35, 1.8], [x0b + 0.05, 1.7], [x0b, 1.1]];
      const outline = shape.extractPoints(6).shape;
      const near = (p) => {
        let bi = 0, bd = 1e9;
        outline.forEach((q, i) => { const d = (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2; if (d < bd) { bd = d; bi = i; } });
        return bi;
      };
      const ia = near(gh[0]), ib = near(gh[gh.length - 1]);
      const lowerPts = outline.slice(0, ia + 1).concat(outline.slice(ib));
      const lowerShape = new THREE.Shape(lowerPts);
      const side = (shp, depth, bevel, lid) => {
        let geo = new THREE.ExtrudeGeometry(shp, bevel ? { depth, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.018, bevelSegments: 2, curveSegments: 6 } : { depth, bevelEnabled: false });
        geo.translate(0, 0, -depth / 2);
        if (lid) geo = openLid(geo, lid[0], lid[1]);
        geo.rotateY(Math.PI / 2);
        return geo;
      };
      const g = side(lowerShape, W - 0.12, true, [gh[0], gh[gh.length - 1]]);
      shapeGeo(g);
      this.liveryTex = this.ghost ? null : liveryTexture(lv, L, 1.4);
      if (this.liveryTex) {
        // caps use (x, y) of the shape as uv
        this.liveryTex.repeat.set(1 / L, 1 / 1.45);
        this.liveryTex.offset.set(-x0b / L, -0.2 / 1.45);
      }
      const capMat = mk(new THREE.MeshPhongMaterial({ color: this.ghost ? 0x9fd8ff : 0xffffff, map: this.liveryTex, shininess: 70, specular: 0x555555 }));
      const paintMat = mk(new THREE.MeshPhongMaterial({ color: this.ghost ? 0x9fd8ff : new THREE.Color(lv.primary), shininess: 80, specular: 0x666666 }));
      this.bodyMesh = new THREE.Mesh(g, [capMat, paintMat]);
      this.bodyMesh.castShadow = !this.ghost;
      this.body.add(this.bodyMesh);
      this.origPos = Float32Array.from(g.attributes.position.array);
      const addPaint = (geo) => {
        const m = new THREE.Mesh(shapeGeo(geo), paintMat);
        m.castShadow = !this.ghost;
        this.body.add(m);
        return m;
      };
      // roof slab
      const R1 = gh[1], R2 = gh[2];
      addPaint(side(new THREE.Shape([new THREE.Vector2(R1[0] + 0.02, R1[1]), new THREE.Vector2(R2[0], R2[1]), new THREE.Vector2(R2[0] + 0.02, R2[1] - 0.07), new THREE.Vector2(R1[0], R1[1] - 0.07)]), W - 0.16, true));
      // pillars: bands along the glass edges, on both sides
      const beltAt = (x) => { const a2 = gh[0], b2 = gh[gh.length - 1]; const t = (x - a2[0]) / (b2[0] - a2[0]); return a2[1] + (b2[1] - a2[1]) * t; };
      const band = (p0, p1, w) => {
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy);
        const nx = (-dy / l) * w, ny = (dx / l) * w;
        return new THREE.Shape([new THREE.Vector2(p0[0], p0[1]), new THREE.Vector2(p1[0], p1[1]), new THREE.Vector2(p1[0] + nx, p1[1] + ny), new THREE.Vector2(p0[0] + nx, p0[1] + ny)]);
      };
      const xb = gh[0][0] + (gh[2][0] - gh[0][0]) * 0.47;
      const ryAt = (x) => R1[1] + ((R2[1] - R1[1]) * (x - R1[0])) / (R2[0] - R1[0]);
      for (const sx of [-1, 1]) {
        const pil = (shp, wdt) => {
          const geo = side(shp, wdt || 0.08, false);
          geo.translate(sx * (W / 2 - 0.07), 0, 0);
          addPaint(geo);
        };
        pil(band(gh[0], gh[1], 0.1));
        pil(band(gh[2], gh[3], S.body === 'hatch' ? 0.2 : 0.12));
        if (gh.length > 4) pil(band(gh[3], gh[4], 0.12));
        pil(new THREE.Shape([new THREE.Vector2(xb + 0.05, beltAt(xb + 0.05)), new THREE.Vector2(xb + 0.05, ryAt(xb + 0.05) - 0.05), new THREE.Vector2(xb - 0.05, ryAt(xb - 0.05) - 0.05), new THREE.Vector2(xb - 0.05, beltAt(xb - 0.05))]));
        // dark window seal along the waistline
        const seal = new THREE.Mesh(shapeGeo((() => { const geo = side(band(gh[gh.length - 1], gh[0], 0.035), 0.09, false); geo.translate(sx * (W / 2 - 0.06), 0, 0); return geo; })()), mk(new THREE.MeshLambertMaterial({ color: 0x15171b })));
        this.body.add(seal);
      }
      // glass
      const glassMat = mk(new THREE.MeshPhongMaterial({ color: 0x9fbdd0, shininess: 140, specular: 0xdde8f0, transparent: true, opacity: this.ghost ? 0.15 : 0.26, depthWrite: false, side: THREE.DoubleSide }));
      this.glass = [];
      const sideShape = new THREE.Shape(gh.map((p) => new THREE.Vector2(p[0], p[1])));
      for (const sx of [-1, 1]) {
        const geo = new THREE.ShapeGeometry(sideShape);
        geo.rotateY(Math.PI / 2);
        geo.translate(sx * (W / 2 - 0.075), 0, 0);
        const m = new THREE.Mesh(shapeGeo(geo), glassMat);
        m.renderOrder = 5;
        this.body.add(m);
      }
      const panel = (p0, p1, width) => {
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
        const len = Math.hypot(dx, dy);
        const geo = new THREE.BoxGeometry(width, 0.01, len * 0.96);
        const nx = dy / len, ny = -dx / len; // outward normal (outline is counter-clockwise)
        geo.applyMatrix4(G.geo.mat(0, (p0[1] + p1[1]) / 2 - ny * 0.02, -((p0[0] + p1[0]) / 2 - nx * 0.02), Math.atan2(-dy, -dx), 0, 0));
        const m = new THREE.Mesh(shapeGeo(geo), glassMat);
        m.renderOrder = 5;
        this.body.add(m);
        this.glass.push(m);
        return m;
      };
      panel(gh[0], gh[1], W * 0.86);
      if (gh.length > 4) panel(gh[3], gh[4], W * 0.82);
      else panel(gh[2], gh[3], W * 0.84);
      // bonnet camera sits just ahead of the windscreen, above the hood
      this.bonnetLocal = new THREE.Vector3(0, ws[0][1] + 0.16 - S.cgH, -(ws[0][0] + 0.12));
      // ----- details -----
      const dark = mk(new THREE.MeshLambertMaterial({ color: 0x15171b }));
      const accentMat = mk(new THREE.MeshPhongMaterial({ color: new THREE.Color(lv.secondary), shininess: 60 }));
      const x1 = xmid + L / 2, x0 = xmid - L / 2;
      const box = (w, h, d, mat, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        this.body.add(m);
        return m;
      };
      // bumpers & skid plate
      const by = S.body === 'raid' ? 0.52 : 0.26;
      this.parts = {};
      this.parts.bumperF = box(W * 0.98, 0.16, 0.2, dark, 0, by + 0.1, -(x1 + 0.03));
      this.parts.bumperR = box(W * 0.98, 0.16, 0.2, dark, 0, by + 0.1, -(x0 - 0.03));
      box(W * 0.6, 0.05, 1.0, dark, 0, by - 0.02, -(x1 - 0.6));
      // mirrors
      for (const sx of [-1, 1]) box(0.16, 0.1, 0.12, accentMat, sx * (W / 2 + 0.06), ws[0][1] + 0.05, -(ws[0][0] - 0.1));
      // spoiler / wing
      if (S.id === 'vortex' || S.id === 'havoc' || S.id === 'sprite') {
        const big = S.id === 'havoc';
        const wy = S.body === 'hatch' ? 1.42 : 1.2;
        const wz = S.body === 'hatch' ? -(x0 + 0.25) : -(x0 + 0.18);
        const wing = new THREE.Group();
        const wb = (w, h, d, x, y, z) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), accentMat);
          m.position.set(x, y, z);
          m.castShadow = !this.ghost;
          wing.add(m);
        };
        wb(W * (big ? 0.98 : 0.92), 0.05, big ? 0.42 : 0.32, 0, wy + (big ? 0.16 : 0.06), wz);
        for (const sx of [-1, 1]) wb(0.04, big ? 0.24 : 0.14, 0.28, sx * W * 0.45, wy + (big ? 0.07 : 0.02), wz);
        this.body.add(wing);
        this.parts.wing = wing;
      }
      if (S.body === 'raid') {
        // roof rack, spare wheel, light bar
        box(W * 0.8, 0.06, 1.2, dark, 0, 1.84, -(xmid - 0.4));
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.22, 14), dark);
        sp.rotation.z = Math.PI / 2;
        sp.position.set(0, 1.0, -(x0 - 0.14));
        sp.rotation.set(Math.PI / 2, 0, 0);
        this.body.add(sp);
        box(W * 0.9, 0.08, 0.1, dark, 0, by + 0.2, -(x1 + 0.12));
      }
      // roof scoop
      if (S.body !== 'raid') box(0.34, 0.08, 0.36, accentMat, 0, (S.body === 'hatch' ? 1.38 : 1.29) + 0.04, -(xmid - 0.1));
      // mudflaps
      for (const zx of [wf, wr])
        for (const sx of [-1, 1]) box(0.3, 0.32, 0.03, accentMat, sx * (S.track / 2), by + 0.02, -(zx - r - 0.12));
      // ----- extra detail: grille, plates, skirts, arch flares, tow hooks, antenna -----
      const tx = (y, z) => this.taper(y, z);
      const fz = -(x1 + 0.02), rz = -(x0 - 0.02);
      const hyG = S.body === 'raid' ? 0.78 : S.body === 'wedge' ? 0.4 : 0.5;
      box(W * 0.42 * tx(hyG, fz), 0.13, 0.04, dark, 0, hyG, fz);
      for (let k = -2; k <= 2; k++) box(0.012, 0.11, 0.05, accentMat, k * 0.09, hyG, fz - 0.005);
      const plateMat = mk(new THREE.MeshLambertMaterial({ color: 0xf2f2ea }));
      box(0.34, 0.09, 0.02, plateMat, 0, by + 0.16, fz - 0.1);
      box(0.34, 0.09, 0.02, plateMat, 0, (S.body === 'raid' ? 0.85 : 0.62), rz + 0.01);
      const towMat = mk(new THREE.MeshLambertMaterial({ color: 0xff3b2e }));
      box(0.05, 0.05, 0.12, towMat, W * 0.32, by + 0.1, fz - 0.12);
      box(0.05, 0.05, 0.12, towMat, -W * 0.32, by + 0.1, rz + 0.1);
      for (const sx of [-1, 1]) {
        // side skirt
        box(0.06, 0.1, Math.abs(wf - wr) - 2 * r - 0.25, dark, sx * (W / 2 - 0.01), by + 0.06, -(wf + wr) / 2);
        // wheel arch flares
        for (const zx of [wf, wr]) {
          const fl = new THREE.Mesh(new THREE.TorusGeometry(r + 0.09, 0.045, 4, 12, Math.PI), dark);
          fl.rotation.y = Math.PI / 2;
          fl.position.set(sx * (W / 2 + 0.005) * tx(r, -zx), r, -zx);
          this.body.add(fl);
        }
      }
      if (S.body !== 'raid') {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.55, 4), dark);
        ant.position.set(W * 0.22 * tx(ws[1][1], -(xmid - 0.6)), ws[1][1] + 0.27, -(xmid - 0.6));
        ant.rotation.x = -0.25;
        this.body.add(ant);
      }
      // hood pins
      for (const sx of [-1, 1]) box(0.04, 0.02, 0.04, mk(new THREE.MeshPhongMaterial({ color: 0xd9d9d9, shininess: 90 })), sx * W * 0.3, (S.body === 'wedge' ? 0.66 : S.body === 'raid' ? 1.14 : 0.82) + 0.01, -(x1 - 0.2));
      // exhaust
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 8), dark);
      ex.rotation.x = Math.PI / 2;
      ex.position.set(W * 0.3, by + 0.06, -(x0 - 0.08));
      this.body.add(ex);
      this.exhaustLocal = new THREE.Vector3(W * 0.3, by + 0.06 - S.cgH, -(x0 - 0.22));
      // lights
      this.headMat = mk(new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
      this.headSide = [mk(new THREE.MeshBasicMaterial({ color: 0xfff6d8 })), mk(new THREE.MeshBasicMaterial({ color: 0xfff6d8 }))];
      this.tailMat = mk(new THREE.MeshBasicMaterial({ color: 0x8a1414 }));
      const hy = S.body === 'raid' ? 0.92 : S.body === 'wedge' ? 0.5 : S.body === 'sedan' ? 0.68 : 0.64;
      for (const sx of [-1, 1]) {
        box(0.38, 0.17, 0.04, dark, sx * W * 0.32 * this.taper(hy, -(x1 + 0.02)), hy, -(x1 + 0.01));
        if (S.body === 'sedan') {
          for (const o of [-0.08, 0.08]) {
            const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.04, 12), this.headSide[sx < 0 ? 0 : 1]);
            hl.rotation.x = Math.PI / 2;
            hl.position.set(sx * W * 0.32 + o, hy, -(x1 + 0.04));
            this.body.add(hl);
          }
        } else box(0.3, 0.11, 0.05, this.headSide[sx < 0 ? 0 : 1], sx * W * 0.32 * this.taper(hy, -(x1 + 0.02)), hy, -(x1 + 0.03));
        const ty = S.body === 'raid' ? 1.0 : S.body === 'sedan' ? 0.72 : 0.8;
        box(0.42, 0.18, 0.04, dark, sx * W * 0.33 * this.taper(ty, -(x0 - 0.02)), ty, -(x0 - 0.03));
        box(0.36, 0.13, 0.05, this.tailMat, sx * W * 0.33 * this.taper(ty, -(x0 - 0.02)), ty, -(x0 - 0.045));
        box(0.1, 0.05, 0.05, this.headMat, sx * W * 0.2 * this.taper(ty, -(x0 - 0.02)), ty - 0.12, -(x0 - 0.045));
      }
      // fog lights in the bumper, hood scoop
      const fogMat = mk(new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
      for (const sx of [-1, 1]) {
        const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 12), fogMat);
        fl.rotation.x = Math.PI / 2;
        fl.position.set(sx * W * 0.3, by + 0.13, -(x1 + 0.14));
        this.body.add(fl);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 14), dark);
        ring.position.copy(fl.position);
        ring.position.z -= 0.012;
        this.body.add(ring);
      }
      if (S.id === 'vortex' || S.id === 'havoc' || S.id === 'sprite') {
        const hz = -(x1 - 0.55), hyy = (S.body === 'wedge' ? 0.66 : 0.82) + 0.02;
        box(0.42, 0.06, 0.3, accentMat, 0, hyy + 0.01, hz);
        box(0.34, 0.035, 0.05, dark, 0, hyy + 0.025, hz - 0.15);
      }
      // night light pod
      if (opts.night && !this.ghost) {
        const podMat = this.headMat;
        for (let i = 0; i < 4; i++) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), podMat);
          c.rotation.x = Math.PI / 2;
          c.position.set((i - 1.5) * 0.24, (S.body === 'raid' ? 1.15 : S.body === 'wedge' ? 0.7 : 0.88) + 0.04, -(x1 - 0.2));
          this.body.add(c);
          const back = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), dark);
          back.rotation.x = Math.PI / 2;
          back.position.copy(c.position);
          back.position.z += 0.04;
          this.body.add(back);
        }
      }
      // door numbers on both sides (readable decals)
      if (!this.ghost) {
        this.numTex = numberTexture(lv.number, lv.accent);
        const nm = new THREE.MeshBasicMaterial({ map: this.numTex, transparent: true });
        this.mats.push(nm);
        for (const sx of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), nm);
          p.position.set(sx * (W / 2 + 0.003), S.body === 'raid' ? 1.0 : 0.66, -(xmid + 0.15));
          p.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
          this.body.add(p);
        }
        // roof number
        const rp = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), nm);
        rp.rotation.x = -Math.PI / 2;
        rp.position.set(0, (S.body === 'raid' ? 1.81 : S.body === 'hatch' ? 1.375 : 1.265) + 0.05, -(xmid - 0.55));
        this.body.add(rp);
      }
      // ----- wheels: open rims with spokes, brake disc and caliper behind -----
      this.wheels = [];
      const tyreMat = mk(new THREE.MeshLambertMaterial({ color: 0x1b1b1d, side: THREE.DoubleSide }));
      const rimMat = mk(new THREE.MeshPhongMaterial({ color: new THREE.Color(lv.rim || '#e8e8e8'), shininess: 70, side: THREE.DoubleSide }));
      const discMat = mk(new THREE.MeshPhongMaterial({ color: 0x8a8d92, shininess: 80 }));
      const calMat = mk(new THREE.MeshPhongMaterial({ color: S.id === 'havoc' ? 0xffc21a : 0xd8261c, shininess: 60 }));
      const tread = new THREE.CylinderGeometry(r, r, 0.24, 20, 1, true);
      tread.rotateZ(Math.PI / 2);
      const wall = new THREE.RingGeometry(r * 0.66, r, 20, 1);
      wall.rotateY(Math.PI / 2);
      const lip = new THREE.RingGeometry(r * 0.6, r * 0.67, 20, 1);
      lip.rotateY(Math.PI / 2);
      const spoke = new THREE.BoxGeometry(0.03, r * 1.22, 0.055);
      const hub = new THREE.CylinderGeometry(r * 0.16, r * 0.16, 0.05, 8);
      hub.rotateZ(Math.PI / 2);
      const disc = new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.025, 16);
      disc.rotateZ(Math.PI / 2);
      const cal = new THREE.BoxGeometry(0.06, r * 0.32, r * 0.42);
      for (let i = 0; i < 4; i++) {
        const sx = i % 2 === 0 ? -1 : 1;
        const outer = new THREE.Group();
        const spin = new THREE.Group();
        const t = new THREE.Mesh(tread, tyreMat);
        t.castShadow = !this.ghost;
        spin.add(t);
        for (const side of [-1, 1]) {
          const w = new THREE.Mesh(wall, tyreMat);
          w.position.x = side * 0.12;
          spin.add(w);
        }
        const lp = new THREE.Mesh(lip, rimMat);
        lp.position.x = sx * 0.1;
        spin.add(lp);
        for (let k = 0; k < 5; k++) {
          const sp = new THREE.Mesh(spoke, rimMat);
          sp.position.x = sx * 0.09;
          sp.rotation.x = (k * Math.PI * 2) / 5;
          sp.translateY(r * 0.3);
          spin.add(sp);
        }
        const hb = new THREE.Mesh(hub, rimMat);
        hb.position.x = sx * 0.095;
        spin.add(hb);
        outer.add(spin);
        if (!this.ghost) {
          const d = new THREE.Mesh(disc, discMat);
          d.position.x = sx * 0.02;
          outer.add(d);
          const c = new THREE.Mesh(cal, calMat);
          c.position.set(sx * 0.045, r * 0.3, i < 2 ? r * 0.18 : -r * 0.18);
          outer.add(c);
        }
        this.group.add(outer);
        this.wheels.push({ outer, spin });
      }
      if (!this.ghost) this._buildCockpit(S, lv, xmid, W, mk, dark, accentMat);
      // fewer draw calls: merge the static exterior detail and each wheel into single meshes
      if (!this.ghost) {
        const keep = new Set([this.bodyMesh, ...this.glass]);
        const parts = new Set(Object.values(this.parts));
        const detailMat = mk(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x444444 }));
        this.detailMesh = mergeInto(this.body, (o) => !keep.has(o) && !parts.has(o) && !o.material.transparent, detailMat);
        if (this.detailMesh) this.detailOrig = Float32Array.from(this.detailMesh.geometry.attributes.position.array);
        // dirt builds up as you drive (see setDirt)
        this.dirtU = { value: 0 };
        this.mudU = { value: new THREE.Color(0.4, 0.3, 0.2) };
        const wheelMat = mk(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 50, side: THREE.DoubleSide }));
        for (const m of [capMat, paintMat, detailMat, wheelMat, dark]) addDirt(m, this.dirtU, this.mudU);
        // cracked windscreen overlay
        this.crack = new THREE.Mesh(this.glass[0].geometry, mk(new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false })));
        this.crack.renderOrder = 6;
        this.crack.visible = false;
        this.body.add(this.crack);
        this.partHome = {};
        for (const k in this.parts) this.partHome[k] = { p: this.parts[k].position.clone(), r: this.parts[k].rotation.clone() };
        this.hits = { bumperF: 0, bumperR: 0, wing: 0, glass: 0, light0: 0, light1: 0 };
        this.debris = [];
        for (const w of this.wheels) {
          mergeInto(w.spin, () => true, wheelMat, true);
          mergeInto(w.outer, (o) => o !== w.spin, mk(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70 })));
        }
      }
      // headlights for night driving
      this.spots = [];
      if (opts.night && !this.ghost) {
        for (const sx of [-0.5, 0.5]) {
          const sl = new THREE.SpotLight(0xfff2d0, 2.4, 140, 0.5, 0.45, 1.2);
          sl.position.set(sx, hy - S.cgH, -(x1 - 0.1));
          sl.target.position.set(sx * 3, -2.2, -(x1 + 30));
          this.group.add(sl);
          this.group.add(sl.target);
          this.spots.push(sl);
        }
      }
      this.brakeOn = false;
    }

    // set from physics
    // ----- first-person cockpit: dash, gauges, steering wheel, driver's arms, roll cage, co-driver -----
    _buildCockpit(S, lv, xmid, W, mk, dark, accentMat) {
      const ws = this.ws;
      const ck = (this.cockpit = new THREE.Group());
      this.body.add(ck);
      const tp = (y, z) => this.taper(y, z);
      const wx = ws[0][0], wy = ws[0][1], ry = ws[1][1];
      const zDash = -(wx - 0.2), zWheel = -(wx - 0.62), zEye = -(wx - 1.02);
      const hx = -0.36;
      const eyeY = Math.min(ry - 0.2, wy + 0.15);
      this.eyeLocal = new THREE.Vector3(hx, eyeY - S.cgH, zEye);
      const trim = mk(new THREE.MeshLambertMaterial({ color: 0x22252b }));
      const trim2 = mk(new THREE.MeshLambertMaterial({ color: 0x31353d }));
      const liner = mk(new THREE.MeshLambertMaterial({ color: 0x5b5e66 }));
      const cage = mk(new THREE.MeshPhongMaterial({ color: new THREE.Color(lv.accent), shininess: 60 }));
      const suit = mk(new THREE.MeshLambertMaterial({ color: new THREE.Color(lv.secondary) }));
      const glove = mk(new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
      const add = (geo, mat, m) => {
        if (m) geo.applyMatrix4(m);
        const o = new THREE.Mesh(geo, mat);
        ck.add(o);
        return o;
      };
      const M = (x, y, z, rx, ry2, rz) => G.geo.mat(x, y, z, rx || 0, ry2 || 0, rz || 0);
      // a tube between two points
      const tube = (a, b, rad, mat) => {
        const d = new THREE.Vector3().subVectors(b, a);
        const g = new THREE.CylinderGeometry(rad, rad, d.length(), 6);
        const o = new THREE.Mesh(g, mat);
        o.position.copy(a).addScaledVector(d, 0.5);
        o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        ck.add(o);
        return o;
      };
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      const inner = (y, z) => (W / 2 - 0.09) * tp(y, z);
      // dashboard
      add(new THREE.BoxGeometry(W * 0.86 * tp(wy, zDash), 0.2, 0.55), trim, M(0, wy - 0.12, zDash));
      add(new THREE.BoxGeometry(W * 0.84 * tp(wy, zDash), 0.03, 0.5), trim2, M(0, wy - 0.015, zDash + 0.02));
      // gauge pod with tachometer
      add(new THREE.BoxGeometry(0.34, 0.12, 0.12), trim, M(hx, wy + 0.03, zDash + 0.2, -0.3));
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const c2 = cv.getContext('2d');
      c2.fillStyle = '#0d0f13';
      c2.fillRect(0, 0, 128, 128);
      c2.strokeStyle = '#fff';
      c2.lineWidth = 3;
      for (let k = 0; k <= 8; k++) {
        const a = -2.3 + (k / 8) * 4.6 - Math.PI / 2;
        c2.strokeStyle = k >= 7 ? '#ff3b2e' : '#ffffff';
        c2.beginPath();
        c2.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46);
        c2.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58);
        c2.stroke();
      }
      c2.fillStyle = '#ffc21a';
      c2.font = 'bold 18px sans-serif';
      c2.textAlign = 'center';
      c2.fillText('RPM', 64, 100);
      const tachTex = new THREE.CanvasTexture(cv);
      const dialMat = mk(new THREE.MeshBasicMaterial({ map: tachTex }));
      const dial = add(new THREE.CircleGeometry(0.075, 24), dialMat, null);
      dial.position.set(hx, wy + 0.04, zDash + 0.265);
      dial.rotation.x = -0.3;
      this.needle = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.06, 0.004), mk(new THREE.MeshBasicMaterial({ color: 0xff3b2e })));
      this.needle.geometry.translate(0, 0.03, 0);
      const np = new THREE.Group();
      np.position.copy(dial.position);
      np.rotation.x = -0.3;
      np.position.z += 0.004;
      np.add(this.needle);
      ck.add(np);
      // steering wheel
      const sw = (this.steerWheel = new THREE.Group());
      sw.position.set(hx, wy - 0.05, zWheel);
      sw.rotation.x = -0.42;
      const swInner = (this.steerSpin = new THREE.Group());
      sw.add(swInner);
      const rimG = new THREE.TorusGeometry(0.18, 0.02, 6, 24);
      swInner.add(new THREE.Mesh(rimG, trim));
      const sp = new THREE.BoxGeometry(0.15, 0.025, 0.02);
      for (const a of [0, Math.PI, -Math.PI / 2]) {
        const m = new THREE.Mesh(sp, trim2);
        m.rotation.z = a;
        m.translateX(0.08);
        swInner.add(m);
      }
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.03, 0.025), cage);
      mark.position.y = 0.18;
      swInner.add(mark);
      swInner.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.04, 10).rotateX(Math.PI / 2), trim2));
      // gloves on the rim at 9 and 3 o'clock
      this.hands = [];
      for (const side of [-1, 1]) {
        const gl = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), glove);
        gl.position.set(side * 0.18, 0.0, 0.015);
        gl.scale.set(1, 1.3, 1);
        swInner.add(gl);
        this.hands.push(gl);
      }
      ck.add(sw);
      // forearms run from fixed elbows to the gloves
      this.arms = [];
      for (const side of [-1, 1]) {
        const g = new THREE.CylinderGeometry(0.035, 0.045, 1, 6);
        const o = new THREE.Mesh(g, suit);
        ck.add(o);
        this.arms.push({ o, elbow: V(hx + side * 0.24, eyeY - 0.42, zEye - 0.1), side });
      }
      // A-pillars, roof liner, door cards, console, mirror
      for (const sx of [-1, 1]) {
        const a = V(sx * inner(wy, -wx), wy, -wx + 0.02), b = V(sx * inner(ry, -ws[1][0]), ry - 0.02, -ws[1][0]);
        tube(a, b, 0.045, trim);
        add(new THREE.BoxGeometry(0.06, wy - 0.3, 1.8), trim2, M(sx * inner(wy - 0.2, zEye), (wy + 0.3) / 2 + 0.02, zEye + 0.1));
        add(new THREE.BoxGeometry(0.12, 0.05, 1.5), trim, M(sx * (inner(wy, zEye) - 0.04), wy - 0.02, zEye + 0.1));
      }
      add(new THREE.BoxGeometry(W * 0.8 * tp(ry, zEye), 0.03, 2.2), liner, M(0, ry - 0.02, zEye + 0.4));
      add(new THREE.BoxGeometry(0.22, 0.25, 0.9), trim, M(0, wy - 0.38, zEye - 0.2));
      add(new THREE.BoxGeometry(0.22, 0.05, 0.03), trim, M(0, ry - 0.11, -(wx - 0.45)));
      // gear lever
      tube(V(0.0, wy - 0.25, zEye - 0.35), V(0.02, wy - 0.05, zEye - 0.42), 0.012, trim2);
      add(new THREE.SphereGeometry(0.03, 8, 6), cage, M(0.02, wy - 0.04, zEye - 0.43));
      // roll cage
      const hoopZ = zEye + 0.45;
      for (const sx of [-1, 1]) {
        tube(V(sx * inner(0.4, hoopZ), 0.4, hoopZ), V(sx * inner(ry, hoopZ) * 0.92, ry - 0.08, hoopZ), 0.025, cage);
        tube(V(sx * inner(ry, hoopZ) * 0.92, ry - 0.08, hoopZ), V(sx * inner(ry, -ws[1][0]) * 0.95, ry - 0.09, -ws[1][0] + 0.05), 0.025, cage);
        tube(V(sx * inner(wy, -wx) * 0.96, wy - 0.02, -wx + 0.08), V(sx * inner(ry, -ws[1][0]) * 0.95, ry - 0.09, -ws[1][0] + 0.05), 0.022, cage);
      }
      tube(V(-inner(ry, hoopZ) * 0.92, ry - 0.08, hoopZ), V(inner(ry, hoopZ) * 0.92, ry - 0.08, hoopZ), 0.025, cage);
      tube(V(-inner(0.4, hoopZ), 0.45, hoopZ), V(inner(ry, hoopZ) * 0.92, ry - 0.1, hoopZ), 0.022, cage);
      // floor and rear parcel shelf
      add(new THREE.BoxGeometry(W * 0.9, 0.04, 2.6), trim, M(0, 0.34, zEye + 0.3));
      // bucket seats
      const seatMat = mk(new THREE.MeshLambertMaterial({ color: 0x1e2127 }));
      for (const sx2 of [hx, -hx]) {
        add(new THREE.BoxGeometry(0.46, 0.72, 0.1), seatMat, M(sx2, eyeY - 0.4, zEye + 0.24, -0.18));
        add(new THREE.BoxGeometry(0.46, 0.1, 0.45), seatMat, M(sx2, eyeY - 0.75, zEye - 0.05));
        add(new THREE.BoxGeometry(0.08, 0.5, 0.12), cage, M(sx2 - 0.21, eyeY - 0.35, zEye + 0.2));
        add(new THREE.BoxGeometry(0.08, 0.5, 0.12), cage, M(sx2 + 0.21, eyeY - 0.35, zEye + 0.2));
      }
      // the driver (hidden in the cockpit camera, where you are the driver)
      const drv = (this.driverBody = new THREE.Group());
      const dT = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.26), suit);
      dT.position.set(hx, eyeY - 0.38, zEye + 0.05);
      drv.add(dT);
      const dH = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 10), mk(new THREE.MeshPhongMaterial({ color: new THREE.Color(lv.primary), shininess: 90 })));
      dH.position.set(hx, eyeY - 0.02, zEye + 0.05);
      drv.add(dH);
      const dV = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.05), mk(new THREE.MeshPhongMaterial({ color: 0x15202c, shininess: 120 })));
      dV.position.set(hx, eyeY - 0.02, zEye - 0.07);
      drv.add(dV);
      ck.add(drv);
      // air freshener hanging from the mirror
      const af = (this.freshener = new THREE.Group());
      af.position.set(0, ry - 0.14, -(wx - 0.45));
      const afMat = mk(new THREE.MeshLambertMaterial({ color: 0x2fa84f, side: THREE.DoubleSide }));
      const tree = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.04, -0.05), new THREE.Vector2(0.02, -0.05), new THREE.Vector2(0.05, -0.1), new THREE.Vector2(-0.05, -0.1), new THREE.Vector2(-0.02, -0.05), new THREE.Vector2(-0.04, -0.05)]);
      const tm = new THREE.Mesh(new THREE.ShapeGeometry(tree), afMat);
      tm.position.y = -0.06;
      af.add(tm);
      af.add(new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.06, 0.003), trim2).translateY(-0.03));
      ck.add(af);
      this.afSwing = { a: 0, v: 0 };
      // second gauge (speedo) and a switch panel
      const dial2 = add(new THREE.CircleGeometry(0.06, 20), dialMat, null);
      dial2.position.set(hx + 0.14, wy + 0.03, zDash + 0.262);
      dial2.rotation.x = -0.3;
      add(new THREE.BoxGeometry(0.3, 0.12, 0.03), trim2, M(0.08, wy - 0.07, zDash + 0.28, -0.3));
      const ledMat = mk(new THREE.MeshBasicMaterial({ color: 0xff5a1f }));
      const ledMat2 = mk(new THREE.MeshBasicMaterial({ color: 0x3ddc84 }));
      for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(0.025, 0.025, 0.02), k % 3 ? ledMat : ledMat2, M(-0.02 + k * 0.045, wy - 0.05, zDash + 0.3, -0.3));
      // co-driver with the pace notes
      const cd = (this.codriver = new THREE.Group());
      cd.position.set(-hx, 0, zEye + 0.05);
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.26), suit);
      torso.position.y = eyeY - 0.38;
      cd.add(torso);
      const head = (this.cdHead = new THREE.Group());
      head.position.y = eyeY - 0.02;
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 10), mk(new THREE.MeshPhongMaterial({ color: 0xf4f4f4, shininess: 90 })));
      head.add(helmet);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.05), mk(new THREE.MeshPhongMaterial({ color: 0x15202c, shininess: 120 })));
      visor.position.set(0, 0.0, -0.12);
      head.add(visor);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.27), accentMat);
      stripe.position.y = 0.05;
      head.add(stripe);
      cd.add(head);
      const book = (this.cdBook = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.015, 0.16), mk(new THREE.MeshLambertMaterial({ color: 0xf1ede0 }))));
      book.position.set(0, eyeY - 0.36, -0.3);
      book.rotation.x = 0.55;
      cd.add(book);
      for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.34, 6), suit);
        arm.position.set(side * 0.13, eyeY - 0.4, -0.18);
        arm.rotation.x = 1.15;
        cd.add(arm);
      }
      ck.add(cd);
      this._v1 = new THREE.Vector3();
      this._v2 = new THREE.Vector3();
      this.cdT = 0;
      // merge every static interior part into one mesh (one draw call instead of ~50)
      const moving = new Set(this.arms.map((a) => a.o));
      const parts = [], drop = [];
      for (const o of ck.children) {
        if (!o.isMesh || moving.has(o) || o.material.map || o.material.type === 'MeshBasicMaterial') continue;
        o.updateMatrix();
        parts.push({ g: o.geometry, c: '#' + o.material.color.getHexString(), m: o.matrix.clone() });
        drop.push(o);
      }
      if (parts.length) {
        const mm = mk(new THREE.MeshLambertMaterial({ vertexColors: true }));
        ck.add(new THREE.Mesh(G.geo.merge(parts), mm));
        for (const o of drop) {
          ck.remove(o);
          o.geometry.dispose();
        }
      }
    }

    setCockpit(on) {
      if (!this.cockpit || this._ckOn === on) return;
      this._ckOn = on;
      this.driverBody.visible = !on;
    }

    // animate cockpit bits (steering wheel, arms, tacho, co-driver)
    animateCockpit(ph, dt) {
      if (!this.cockpit) return;
      // air freshener swings with the car
      const sw2 = this.afSwing;
      const push = (ph.w ? ph.w.y : 0) * (ph.speed || 0) * 0.04;
      sw2.v += (-sw2.a * 30 - sw2.v * 1.5 + push * 30) * dt;
      sw2.a = G.clamp(sw2.a + sw2.v * dt, -0.9, 0.9);
      this.freshener.rotation.z = sw2.a;
      const steer = (ph.steerAngle || 0) * 11;
      this.steerSpin.rotation.z = -G.clamp(steer, -2.6, 2.6);
      const S = ph.spec;
      const rr = G.clamp((ph.rpm - S.idle * 0.6) / (S.redline - S.idle * 0.6), 0, 1.05);
      this.needle.rotation.z = 2.3 - rr * 4.6;
      // forearms follow the gloves
      this.cockpit.updateMatrixWorld(true);
      const inv = this._inv || (this._inv = new THREE.Matrix4());
      inv.copy(this.cockpit.matrixWorld).invert();
      for (let i = 0; i < 2; i++) {
        const a = this.arms[i];
        const hand = this._v1.setFromMatrixPosition(this.hands[i].matrixWorld).applyMatrix4(inv);
        const d = this._v2.subVectors(hand, a.elbow);
        const len = d.length();
        a.o.position.copy(a.elbow).addScaledVector(d, 0.5);
        a.o.scale.set(1, len, 1);
        a.o.quaternion.setFromUnitVectors(Y_UP, d.normalize());
      }
      // co-driver reads the notes and leans with the car
      this.cdT += dt;
      const lat = ph.vel && ph.right ? ph.vel.dot(ph.right) : 0;
      this.codriver.rotation.z = G.damp(this.codriver.rotation.z, G.clamp((ph.w ? ph.w.y : 0) * 0.08, -0.12, 0.12), 4, dt);
      this.cdHead.rotation.x = 0.35 + Math.sin(this.cdT * 1.7) * 0.05;
      this.cdHead.rotation.y = Math.sin(this.cdT * 0.6) * 0.12;
      void lat;
    }

    update(ph) {
      this.group.position.copy(ph.pos);
      this.group.quaternion.copy(ph.q);
      for (let i = 0; i < 4; i++) {
        const w = ph.wheels[i], v = this.wheels[i];
        v.outer.position.set(w.mount.x, w.mount.y - w.len, w.mount.z);
        v.outer.rotation.y = -w.delta;
        // bent suspension shows as wheel camber
        v.outer.rotation.z = (i % 2 === 0 ? 1 : -1) * ph.damage.susp[i] * 0.24;
        v.spin.rotation.x = -w.rot;
        if (ph.damage.punct[i]) v.outer.scale.set(1, 0.9, 1);
        else v.outer.scale.set(1, 1, 1);
      }
      const brake = ph.input.brake > 0.1 && ph.gear >= 0;
      this.setBrake(brake || ph.input.handbrake > 0.5);
      if (ph.impacts.length) {
        for (const im of ph.impacts) this.deform(im.p, im.amt);
        ph.impacts.length = 0;
      }
    }

    // replay/ghost: pos, quat, steer, wheel spin, suspension lengths
    setState(pos, quat, steer, rot, lens, brake) {
      this.group.position.copy(pos);
      this.group.quaternion.copy(quat);
      const S = this.spec;
      const a = S.wheelbase * (1 - S.cgFront), b = S.wheelbase * S.cgFront;
      for (let i = 0; i < 4; i++) {
        const front = i < 2;
        const sx = i % 2 === 0 ? -1 : 1;
        const v = this.wheels[i];
        v.outer.position.set((sx * S.track) / 2, lens ? this._mountY(front) - lens[i] : -S.cgH + S.wheelR, front ? -a : b);
        v.outer.rotation.y = front ? -steer : 0;
        v.spin.rotation.x = -rot;
      }
      this.setBrake(!!brake);
    }
    _mountY(front) {
      const S = this.spec;
      const m = S.mass + 150;
      const load = front ? (m * 9.81 * S.cgFront) / 2 : (m * 9.81 * (1 - S.cgFront)) / 2;
      return -S.cgH + S.wheelR + S.rest - load / S.spring;
    }

    setBrake(on) {
      if (on === this.brakeOn) return;
      this.brakeOn = on;
      this.tailMat.color.setHex(on ? 0xff2a1a : 0x8a1414);
    }

    _dent(geo, orig, px, py, pz, amt) {
      const pa = geo.attributes.position;
      const a = pa.array;
      const R = 0.6 + amt * 0.7;
      const push = 0.09 + amt * 0.3;
      let touched = false;
      for (let i = 0; i < pa.count; i++) {
        const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
        const dx = x - px, dy = y - py, dz = z - pz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > R) continue;
        touched = true;
        const f = (1 - d / R) * (1 - d / R) * push;
        // push in, toward the middle of the car
        const cx = -x, cy = 0.7 - y, cz = -z * 0.35;
        const l = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
        // a little crumple noise so dents look rough
        const n = 0.75 + 0.5 * Math.sin(x * 23.1 + z * 17.3 + y * 11.7);
        let nx = x + (cx / l) * f * n, ny = y + (cy / l) * f * 0.5 * n, nz = z + (cz / l) * f * n;
        // never more than 0.34 m from the original
        const ox = orig[i * 3], oy = orig[i * 3 + 1], oz = orig[i * 3 + 2];
        const ddx = nx - ox, ddy = ny - oy, ddz = nz - oz;
        const dl = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
        if (dl > 0.34) {
          nx = ox + (ddx / dl) * 0.34;
          ny = oy + (ddy / dl) * 0.34;
          nz = oz + (ddz / dl) * 0.34;
        }
        a[i * 3] = nx; a[i * 3 + 1] = ny; a[i * 3 + 2] = nz;
      }
      if (touched) {
        pa.needsUpdate = true;
        geo.computeVertexNormals();
      }
    }

    // a hit at local point p (car frame) with strength amt 0..1
    deform(p, amt) {
      const px = p.x, py = p.y + this.spec.cgH, pz = p.z;
      this._dent(this.bodyMesh.geometry, this.origPos, px, py, pz, amt);
      if (this.detailMesh) this._dent(this.detailMesh.geometry, this.detailOrig, px, py, pz, amt * 0.8);
      if (!this.hits) return;
      // which parts took it
      const L = this.spec.dims[0], H = this.hits;
      if (pz < -L * 0.28) {
        H.bumperF += amt;
        H.glass += amt * 0.55;
        if (amt > 0.25) H[px < 0 ? 'light0' : 'light1'] += amt;
      }
      if (pz > L * 0.28) {
        H.bumperR += amt;
        H.wing += amt * 0.5;
      }
      if (py > 1.0) {
        // roof / rollover
        H.glass += amt * 0.9;
        H.wing += amt * 0.9;
      }
      for (const k of ['bumperF', 'bumperR']) {
        const part = this.parts[k];
        if (!part || part.userData.gone) continue;
        if (H[k] > 1.05) this._detach(k);
        else if (H[k] > 0.45 && !part.userData.droop) {
          // hanging off on one side
          part.userData.droop = true;
          part.rotation.z = (Math.random() < 0.5 ? -1 : 1) * 0.22;
          part.position.y -= 0.07;
        }
      }
      if (H.wing > 0.9) this._detach('wing');
      if (H.glass > 0.5) this.crack.visible = true;
      for (let s = 0; s < 2; s++) if (H['light' + s] > 0.5) this.headSide[s].color.setHex(0x2b2b27);
    }

    _detach(name) {
      const obj = this.parts[name];
      if (!obj || obj.userData.gone) return;
      obj.userData.gone = true;
      obj.updateMatrixWorld(true);
      const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      obj.matrixWorld.decompose(pos, q, sc);
      this.body.remove(obj);
      obj.position.copy(pos);
      obj.quaternion.copy(q);
      this.debris.push(obj);
    }

    // 0..1 dirt, colour of the mud/dust/snow
    setDirt(v, color) {
      if (!this.dirtU) return;
      this.dirtU.value = v;
      if (color) this.mudU.value.copy(color);
    }

    resetDamage() {
      const g = this.bodyMesh.geometry;
      g.attributes.position.array.set(this.origPos);
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
      if (this.detailMesh) {
        this.detailMesh.geometry.attributes.position.array.set(this.detailOrig);
        this.detailMesh.geometry.attributes.position.needsUpdate = true;
        this.detailMesh.geometry.computeVertexNormals();
      }
      if (this.hits) {
        for (const k in this.hits) this.hits[k] = 0;
        for (const k in this.parts) {
          const part = this.parts[k];
          if (part.userData.gone) continue;
          part.userData.droop = false;
          part.position.copy(this.partHome[k].p);
          part.rotation.copy(this.partHome[k].r);
        }
        this.crack.visible = false;
        for (const m of this.headSide) m.color.setHex(0xfff6d8);
      }
    }

    exhaustWorld(out) {
      return out.copy(this.exhaustLocal).applyQuaternion(this.group.quaternion).add(this.group.position);
    }

    dispose() {
      this.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      for (const m of this.mats) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
      if (this.group.parent) this.group.parent.remove(this.group);
    }
  }

  G.CarModel = CarModel;
})();
