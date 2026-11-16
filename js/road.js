/* Aser's Road: the 3D road: world, buildings, traffic, your car, camera and game loop */
'use strict';

/* =====================================================================
   createRoad — renderer, world, player, traffic, loop
   ===================================================================== */
function createRoad() {
  const T = THREE;
  const canvas = $('#road-canvas');
  const coarse = matchMedia('(pointer:coarse)').matches;
  const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
  let level = (coarse || mem <= 2 || cores <= 4) ? 1 : 2;           // 2 high, 1 medium, 0 low (adaptive)
  const shadowsOn = () => level >= 1;
  const shadowSize = () => (level >= 2 ? 2048 : 1024);
  const trafficMax = () => (level >= 2 ? 40 : level === 1 ? 28 : 16);
  const texW = () => (level >= 2 ? 768 : 640);

  const renderer = new T.WebGLRenderer({ canvas, antialias: level >= 1, powerPreference: 'high-performance' });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = shadowsOn(); renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.background = new T.Color(0xcfe4f4); scene.fog = new T.Fog(0xcfe4f4, 85, 260);
  const camera = new T.PerspectiveCamera(42, 1, 0.5, 520);

  /* ---- registries: things that react to day/night ---- */
  const reg = { emi: [], glow: [], col: [], anim: [] };
  const regEmi = (mat, d, n) => { reg.emi.push({ mat, d, n }); return mat; };
  const regGlow = (mat, base, min) => { reg.glow.push({ mat, base, min: min || 0 }); return mat; };
  const regCol = (mat, d, n) => { reg.col.push({ mat, d: new T.Color(d), n: new T.Color(n) }); return mat; };
  function applyNight(n) {
    for (const e of reg.emi) e.mat.emissiveIntensity = lerp(e.d, e.n, n);
    for (const g of reg.glow) { g.mat.opacity = g.base * lerp(g.min, 1, n); g.mat.visible = g.mat.opacity > 0.01; }
    for (const c of reg.col) c.mat.color.copy(c.d).lerp(c.n, n);
  }
  const envMats = [];   // metallic paints that follow the day/night reflection level

  /* ---- zones ---- */
  const ZONE_LEN = 200, ROAD_W = 17.2;
  const KEYS = ['ground', 'sky', 'night', 'hemiS', 'hemiG', 'sun', 'accent'];
  const Z = (o) => { for (const k of KEYS) o[k] = new T.Color(o[k]); o.hex = '#' + o.accent.getHexString(); return o; };
  const ZONES = [
    Z({ id: 'hero',       name: 'Hero',       ground: 0xa6b98a, sky: 0xcfe4f4, night: 0x0c1528, hemiS: 0xdcecff, hemiG: 0x8fa070, sun: 0xfff0d2, sunI: 3.0, accent: 0xffc857, density: 0.35 }),
    Z({ id: 'works',      name: 'Works',      ground: 0x8e8aab, sky: 0xcfc9f2, night: 0x150d30, hemiS: 0xdad4ff, hemiG: 0x6a5f90, sun: 0xfff0e8, sunI: 2.8, accent: 0x5cf0ff, density: 1.0 }),
    Z({ id: 'experience', name: 'Experience', ground: 0x9ca6ab, sky: 0xdce7ee, night: 0x0a1824, hemiS: 0xe3efff, hemiG: 0x8a979e, sun: 0xffffff, sunI: 3.1, accent: 0x2fb5b0, density: 0.9 }),
    Z({ id: 'about',      name: 'About',      ground: 0xc58f60, sky: 0xf4d7b2, night: 0x1c1013, hemiS: 0xffe6c8, hemiG: 0xa8764a, sun: 0xffcf94, sunI: 2.9, accent: 0xe9a23b, density: 0.3 }),
    Z({ id: 'contact',    name: 'Contact',    ground: 0x8fb7a9, sky: 0xd0eaf0, night: 0x0a1b24, hemiS: 0xe0f4f6, hemiG: 0x7fa496, sun: 0xfff3dc, sunI: 3.0, accent: 0xffc857, density: 0.15 })
  ];
  ZONES.forEach((z, i) => { z.i = i; z.z0 = -ZONE_LEN * i; z.z1 = -ZONE_LEN * (i + 1); z.group = new T.Group(); z.built = false; scene.add(z.group); });
  const A = { sunI: 3, density: 0.3 }; KEYS.forEach((k) => { A[k] = new T.Color(); });
  function blendZones(z) {
    const pos = clamp(-z / ZONE_LEN, 0, 4.999), t = pos - 0.75, k = Math.floor(t), w = smooth(0, 0.5, t - k);
    const a = ZONES[clamp(k, 0, 4)], b = ZONES[clamp(k + 1, 0, 4)];
    for (const key of KEYS) A[key].copy(a[key]).lerp(b[key], w);
    A.sunI = lerp(a.sunI, b.sunI, w); A.density = lerp(a.density, b.density, w);
  }

  /* ---- lights ---- */
  const hemi = new T.HemisphereLight(0xffffff, 0x888888, 1); scene.add(hemi);
  const sun = new T.DirectionalLight(0xffffff, 3); sun.castShadow = shadowsOn(); scene.add(sun, sun.target);
  const sc = sun.shadow.camera; sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 240;
  sun.shadow.mapSize.set(shadowSize(), shadowSize()); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  const moon = new T.DirectionalLight(0x8fa8ff, 0.5); moon.position.set(-30, 60, 25); scene.add(moon);

  /* ---- reflection environment for metallic paint ---- */
  const envTex = (() => {
    const s = new T.Scene(), geo = new T.SphereGeometry(60, 32, 16), col = [], p = geo.attributes.position, c = new T.Color();
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 60; if (y > 0) c.set(0x9cc6f2).lerp(new T.Color(0xfff0dc), 1 - Math.pow(y, 0.6)); else c.set(0xfff0dc).lerp(new T.Color(0x5a5646), Math.min(1, -y * 1.6)); col.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    s.add(new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    const box = (x, y, z, w, h, d, k) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({ color: new T.Color(0xffffff).multiplyScalar(k) })); m.position.set(x, y, z); s.add(m); };
    box(0, 48, 10, 40, 1, 14, 3.2); box(-45, 14, 0, 1, 12, 30, 1.8); box(45, 14, 0, 1, 12, 30, 1.8);
    const pm = new T.PMREMGenerator(renderer); const rt = pm.fromScene(s, 0.03); pm.dispose(); return rt.texture;
  })();

  /* ---- ground (follows the player, texture offset keeps it fixed in world space) ---- */
  const gtex = canvasTex(256, 256, (g, w, h) => {
    const id = g.createImageData(w, h), r = rng(7);
    for (let i = 0; i < w * h; i++) { const v = 226 + r() * 29; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    g.putImageData(id, 0, 0);
    for (let i = 0; i < 70; i++) { const x = r() * w, y = r() * h, rad = 18 + r() * 40, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, r() < .5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.09)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  }, { aniso: 2 });
  gtex.wrapS = gtex.wrapT = T.RepeatWrapping; gtex.repeat.set(700 / 24, 700 / 24);
  const groundMat = new T.MeshStandardMaterial({ color: 0xa6b98a, map: gtex, roughness: 1, metalness: 0 });
  const ground = new T.Mesh(new T.PlaneGeometry(700, 700), groundMat); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);


  /* =====================================================================
     The boulevard: divided road, palm median, golden lamps, paved sidewalks,
     junctions and roundabouts (Addis Ababa style)
     ===================================================================== */
  const ROAD_TOP = 40, ROAD_END = -946, ROAD_LEN = ROAD_TOP - ROAD_END, MED = 1.6, CW = 8.6, SW = 13.4;
  const CROSS_Z = []; for (let k = 0; k < 9; k++) CROSS_Z.push(-50 - 100 * k);
  const ROUND_Z = [-150, -450, -750], RB_R = 19, ISLAND_R = 8.3;
  const JUN = CROSS_Z.map((z) => ({ z, rb: ROUND_Z.includes(z) }));
  const nearJunction = (z, pad) => JUN.some((j) => Math.abs(z - j.z) < (j.rb ? RB_R + 3 : (pad == null ? 8 : pad)));
  const segs = (gap) => { const out = []; let top = ROAD_TOP; for (const j of JUN) { out.push([top, j.z + gap(j)]); top = j.z - gap(j); } out.push([top, ROAD_END]); return out; };

  const roadTex = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#2b3034'; g.fillRect(0, 0, w, h); const r = rng(3);
    for (let i = 0; i < 3200; i++) { g.fillStyle = r() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.14)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    const px = (x) => w / 2 + x * (w / ROAD_W);
    g.fillStyle = 'rgba(238,238,228,.92)';
    for (const x of [-1.95, 1.95, -8.35, 8.35]) g.fillRect(px(x) - 2.5, 0, 5, h);
    g.fillStyle = 'rgba(238,238,228,.88)'; for (let y = 0; y < h; y += 128) { g.fillRect(px(-5.1) - 2.5, y, 5, 64); g.fillRect(px(5.1) - 2.5, y, 5, 64); }
  }, { aniso: 8 });
  roadTex.wrapT = T.RepeatWrapping; roadTex.repeat.set(1, ROAD_LEN / 24);
  const roadMat = new T.MeshStandardMaterial({ map: roadTex, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const roadMesh = new T.Mesh(new T.PlaneGeometry(ROAD_W, ROAD_LEN), roadMat);
  roadMesh.rotation.x = -Math.PI / 2; roadMesh.position.set(0, 0.03, (ROAD_TOP + ROAD_END) / 2); roadMesh.receiveShadow = true; scene.add(roadMesh);

  // cross streets
  const crossTex = canvasTex(1024, 64, (g, w, h) => {
    g.fillStyle = '#2b3034'; g.fillRect(0, 0, w, h); const r = rng(5);
    for (let i = 0; i < 600; i++) { g.fillStyle = r() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.14)'; g.fillRect(r() * w, r() * h, 2, 2); }
    g.fillStyle = 'rgba(236,236,226,.85)'; for (let x = 0; x < w; x += 69) g.fillRect(x, h / 2 - 2, 34, 4);
    g.fillStyle = 'rgba(236,236,226,.8)'; g.fillRect(0, 3, w, 3); g.fillRect(0, h - 6, w, 3);
  }, { aniso: 8 });
  const crossMat = new T.MeshStandardMaterial({ map: crossTex, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -0.5 });
  const crossGeo = new T.PlaneGeometry(130, 7);
  for (const cz of CROSS_Z) { const m = new T.Mesh(crossGeo, crossMat); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.022, cz); m.receiveShadow = true; scene.add(m); }

  // median planter + palms, striped curbs, paved sidewalks
  const planterMat = new T.MeshStandardMaterial({ color: 0x4f7d3c, roughness: 1 });
  const paveTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#b7b1a3'; g.fillRect(0, 0, w, h); const r = rng(9);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#c4bdad' : '#aaa496'; g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); if ((x + y) % 4 === 0) { g.fillStyle = '#c9a96a'; g.fillRect(x * 32 + 11, y * 32 + 11, 10, 10); } }
    for (let i = 0; i < 250; i++) { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(r() * w, r() * h, 2, 2); }
  }, { aniso: 8 });
  paveTex.wrapS = paveTex.wrapT = T.RepeatWrapping;
  const paveMat = new T.MeshStandardMaterial({ map: paveTex, roughness: 0.9 });
  const curbBlocks = [];
  const curbLine = (x, a, b, hgt, wid) => { for (let z = a; z > b; z -= 1.2) curbBlocks.push({ x, z: z - 0.6, h: hgt, w: wid, c: (Math.round((a - z) / 1.2) % 2) ? 0x15171a : 0xf1f1ec }); };
  for (const [a, b] of segs((j) => (j.rb ? 21 : 8))) {
    const L = a - b; if (L < 1) continue;
    const m = new T.Mesh(new T.BoxGeometry(MED * 2 - 0.5, 0.3, L), planterMat); m.position.set(0, 0.15, (a + b) / 2); m.receiveShadow = true; scene.add(m);
    curbLine(-(MED - 0.1), a, b, 0.28, 0.4); curbLine(MED - 0.1, a, b, 0.28, 0.4);
  }
  for (const [a, b] of segs((j) => (j.rb ? 21 : 4.8))) {
    const L = a - b; if (L < 1) continue;
    for (const s of [-1, 1]) {
      const geo = new T.PlaneGeometry(SW - CW, L), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ((SW - CW) / 2.4), uv.getY(i) * (L / 2.4));
      const m = new T.Mesh(geo, paveMat); m.rotation.x = -Math.PI / 2; m.position.set(s * (CW + SW) / 2, 0.13, (a + b) / 2); m.receiveShadow = true; scene.add(m);
      curbLine(s * (CW + 0.1), a, b, 0.2, 0.4);
    }
  }
  { const geo = new T.BoxGeometry(1, 1, 1), mat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), im = new T.InstancedMesh(geo, mat, curbBlocks.length), mm = new T.Matrix4(), q = new T.Quaternion(), c = new T.Color();
    curbBlocks.forEach((b, i) => { mm.compose(new T.Vector3(b.x, b.h / 2, b.z), q, new T.Vector3(b.w, b.h, 1.15)); im.setMatrixAt(i, mm); im.setColorAt(i, c.set(b.c)); });
    im.frustumCulled = false; im.receiveShadow = true; scene.add(im); }

  // golden multi-globe lamps (median double-arm + sidewalk singles)
  const gold = new T.MeshStandardMaterial({ color: 0xd2a03a, metalness: 0.7, roughness: 0.4 });
  const globeMat = regCol(new T.MeshBasicMaterial({ color: 0xe9e6d8, toneMapped: false }), 0xe9e6d8, 0xfff0c0);
  const cluster = (() => { const l = []; const mk = (x, y, z) => { const g = new T.SphereGeometry(0.3, 8, 6); g.translate(x, y, z); l.push(g); }; mk(0, 0.5, 0); mk(0.55, 0.12, 0); mk(-0.55, 0.12, 0); mk(0, 0.12, 0.55); mk(0, 0.12, -0.55); return mergeGeos(l); })();
  const lampZs = [], sideLampZs = [];
  for (let k = 0; ; k++) { const z = -14 - 26 * k; if (z < -935) break; if (!nearJunction(z, 10)) lampZs.push(z); }
  for (let k = 0; ; k++) { const z = -27 - 26 * k; if (z < -935) break; if (!nearJunction(z, 10)) sideLampZs.push(z); }
  const poleGeo = new T.CylinderGeometry(0.1, 0.17, 7.6, 8); poleGeo.translate(0, 3.8, 0);
  const barGeo = new T.BoxGeometry(5.2, 0.14, 0.14); barGeo.translate(0, 7.5, 0);
  const sidePoleGeo = new T.CylinderGeometry(0.08, 0.14, 6.6, 8); sidePoleGeo.translate(0, 3.3, 0);
  const total = lampZs.length, totalS = sideLampZs.length * 2;
  const mP = new T.InstancedMesh(mergeGeos([poleGeo, barGeo]), gold, total), mC = new T.InstancedMesh(cluster, globeMat, total * 2);
  const sP = new T.InstancedMesh(sidePoleGeo, gold, totalS), sC = new T.InstancedMesh(cluster, globeMat, totalS);
  const poolMat = regGlow(new T.MeshBasicMaterial({ map: glowTexture('rgba(255,215,160,.9)', 'rgba(255,215,160,0)'), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0 }), 0.6, 0);
  const pools = new T.InstancedMesh(new T.PlaneGeometry(13, 13), poolMat, total * 2 + totalS);
  const halo = []; { const o = new T.Matrix4(); let pi = 0;
    lampZs.forEach((z, i) => { mP.setMatrixAt(i, o.makeTranslation(0, 0, z)); for (const s of [-1, 1]) { mC.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), o.makeTranslation(s * 2.6, 7.7, z)); halo.push(s * 2.6, 8.4, z); pools.setMatrixAt(pi++, new T.Matrix4().compose(new T.Vector3(s * 4.9, 0.07, z), new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, 0)), new T.Vector3(1, 1, 1))); } });
    let si = 0; sideLampZs.forEach((z) => { for (const s of [-1, 1]) { sP.setMatrixAt(si, o.makeTranslation(s * 12.6, 0.13, z)); sC.setMatrixAt(si, o.makeTranslation(s * 12.6, 6.7, z)); halo.push(s * 12.6, 7.4, z); pools.setMatrixAt(pi++, new T.Matrix4().compose(new T.Vector3(s * 10.4, 0.15, z), new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, 0)), new T.Vector3(1, 1, 1))); si++; } }); }
  [mP, mC, sP, sC, pools].forEach((m) => { m.frustumCulled = false; scene.add(m); }); mP.castShadow = shadowsOn();
  { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(halo, 3));
    const m = regGlow(new T.PointsMaterial({ size: 4.2, map: glowTexture('rgba(255,236,190,1)', 'rgba(255,236,190,0)'), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0, color: 0xffe2a0 }), 0.85, 0);
    const p = new T.Points(g, m); p.frustumCulled = false; scene.add(p); }
  // palms down the median
  const palmTrunk = new T.CylinderGeometry(0.16, 0.26, 5.2, 6); palmTrunk.translate(0, 2.6, 0);
  const palmCrown = (() => { const l = []; for (let i = 0; i < 8; i++) { const g = new T.ConeGeometry(0.3, 3.6, 3); g.translate(0, 1.8, 0); g.rotateZ(-(Math.PI / 2 - 0.55)); g.rotateY(i * Math.PI / 4); g.translate(0, 5.2, 0); l.push(g); } const t = new T.SphereGeometry(0.34, 6, 5); t.translate(0, 5.25, 0); l.push(t); return mergeGeos(l); })();
  const palmTrunkMat = stdMat0(0x8a6a45), palmLeafMat = stdMat0(0x2f7a43);
  function stdMat0(c) { return new T.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }); }
  { const list = []; for (let k = 0; ; k++) { const z = -8 - 9 * k; if (z < -940) break; if (nearJunction(z, 7)) continue; list.push(z); }
    const a = new T.InstancedMesh(palmTrunk, palmTrunkMat, list.length), b = new T.InstancedMesh(palmCrown, palmLeafMat, list.length), o = new T.Object3D(), r = rng(77);
    list.forEach((z, i) => { o.position.set((r() - 0.5) * 0.4, 0.3, z); o.rotation.set(0, r() * 6, 0); const s = 0.9 + r() * 0.35; o.scale.set(s, s, s); o.updateMatrix(); a.setMatrixAt(i, o.matrix); b.setMatrixAt(i, o.matrix); });
    [a, b].forEach((m) => { m.frustumCulled = false; scene.add(m); }); a.castShadow = b.castShadow = shadowsOn(); }

  /* ---- distant city glow (warm points beyond the verge; fade in at night) ---- */
  { const n = 1500, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), r = rng(11), c = new T.Color();
    for (let i = 0; i < n; i++) { const side = r() < .5 ? -1 : 1; pos[i * 3] = side * (60 + r() * 130); pos[i * 3 + 1] = 0.6 + r() * 12; pos[i * 3 + 2] = 70 - r() * 1180; c.set(r() < .7 ? 0xffd9a0 : (r() < .5 ? 0xbfd6ff : 0xffb27a)).multiplyScalar(0.6 + r() * 0.6); col.set([c.r, c.g, c.b], i * 3); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    const m = regGlow(new T.PointsMaterial({ size: 1.6, map: glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0 }), 0.95, 0);
    const pts = new T.Points(g, m); pts.frustumCulled = false; scene.add(pts); }

  /* =====================================================================
     Zone builders. Layout rule: the road sits on the LEFT of the screen,
     every content page stands on the RIGHT (x = 23), dressing fills the rest.
     ===================================================================== */
  const TILT = -55 * Math.PI / 180;               // panels face the camera
  const RIGHT = 23;
  const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), V3 = new T.Vector3(), S3 = new T.Vector3(), C = new T.Color();
  const mat4 = (x, y, z, sx, sy, sz, ry) => { Q.setFromEuler(E.set(0, ry || 0, 0)); return new T.Matrix4().compose(V3.set(x, y, z), Q, S3.set(sx, sy == null ? sx : sy, sz == null ? sx : sz)); };
  function inst(group, geo, mat, items, cast, recv) {
    if (!items.length) return null;
    const mesh = new T.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { mesh.setMatrixAt(i, it.m); if (it.c != null) mesh.setColorAt(i, C.set(it.c)); });
    mesh.castShadow = !!cast && shadowsOn(); mesh.receiveShadow = !!recv; mesh.frustumCulled = false; group.add(mesh); return mesh;
  }
  const stdMat = (c, r, m) => new T.MeshStandardMaterial({ color: c, roughness: r == null ? 0.85 : r, metalness: m || 0, flatShading: true });
  function panel(group, tex, x, y, z, w, h, ry, glowHex) {
    const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: T.DoubleSide });
    const m = new T.Mesh(new T.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.set(TILT, ry || 0, 0, 'YXZ'); group.add(m);
    if (glowHex) { const gm = regGlow(new T.MeshBasicMaterial({ map: glowTexture('rgba(255,255,255,.7)', 'rgba(255,255,255,0)'), color: glowHex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.2 }), 0.2, 0.12); gm.side = T.DoubleSide; const gg = new T.Mesh(new T.PlaneGeometry(w * 1.4, h * 1.6), gm); gg.position.copy(m.position); gg.rotation.copy(m.rotation); gg.translateZ(-0.3); group.add(gg); }
    return m;
  }
  function sidePanel(z, tex, u, w, h, acc, y, x) {
    const g = new T.Group(); g.position.set(x == null ? RIGHT : x, 0, z.z0 - u); const pm = panel(g, tex, 0, y || 4.8, 0, w, h, 0, acc);
    const stem = regEmi(new T.MeshStandardMaterial({ color: 0x15171a, emissive: new T.Color(acc), emissiveIntensity: 0.5, roughness: 0.5 }), 0.5, 2.0);
    for (const s of [-1, 1]) { const st = new T.Mesh(new T.BoxGeometry(0.22, 2.4, 0.22), stem); st.position.set(s * w * 0.3, 1.2, 0.5); st.castShadow = shadowsOn(); g.add(st); }
    z.group.add(g); return pm;
  }
  function gateSign(z, accHex, num, name, kicker) { sidePanel(z, gateTexture(num, name, kicker, accHex), 14, 17, 4.25, accHex, 3.4); }
  const free = (z0, u, pad) => !nearJunction(z0 - u, pad == null ? 9 : pad);
  const aFree = (z0, u) => free(z0, u, 10);

  /* shared low-poly assets */
  const trunkGeo = new T.CylinderGeometry(0.22, 0.34, 2.4, 5); trunkGeo.translate(0, 1.2, 0);
  const coneGeo = new T.ConeGeometry(1.9, 4.2, 6); coneGeo.translate(0, 4.2, 0);
  const coneGeo2 = new T.ConeGeometry(1.4, 3.2, 6); coneGeo2.translate(0, 6.0, 0);
  const blobGeo = new T.IcosahedronGeometry(1.7, 0); blobGeo.translate(0, 3.6, 0);
  const eucTrunk = new T.CylinderGeometry(0.13, 0.22, 11, 5); eucTrunk.translate(0, 5.5, 0);
  const eucTop = (() => { const a = new T.ConeGeometry(1.5, 6.5, 6); a.translate(0, 10.2, 0); const b = new T.ConeGeometry(1.1, 4.5, 6); b.translate(0, 13, 0); return mergeGeos([a, b]); })();
  const acaciaTrunk = new T.CylinderGeometry(0.14, 0.26, 3.6, 5); acaciaTrunk.translate(0, 1.8, 0);
  const acaciaTop = new T.SphereGeometry(2.8, 8, 5); acaciaTop.scale(1, 0.26, 1); acaciaTop.translate(0, 4.1, 0);
  const rockGeo = new T.DodecahedronGeometry(1, 0), hillGeo = new T.SphereGeometry(1, 12, 8);
  const matTrunk = stdMat(0x5b4331), matLeaf = stdMat(0xffffff), matRock = stdMat(0x8d8a80), matHill = stdMat(0xffffff, 1);
  const eucMat = stdMat(0xffffff);
  const hutWall = new T.CylinderGeometry(2.1, 2.2, 2.2, 10); hutWall.translate(0, 1.1, 0);
  const hutRoof = new T.ConeGeometry(3.0, 2.8, 10); hutRoof.translate(0, 3.5, 0);
  const matHutWall = stdMat(0xc9a77a), matThatch = stdMat(0xb08a4a);
  const flowerGeo = new T.IcosahedronGeometry(0.22, 0); flowerGeo.translate(0, 0.25, 0); const matFlower = new T.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffb300, emissiveIntensity: 0.25, roughness: 0.6 });
  const kioskBody = new T.BoxGeometry(2.4, 2.4, 2.4); kioskBody.translate(0, 1.2, 0); const kioskAwn = new T.BoxGeometry(3.0, 0.14, 1.3); kioskAwn.translate(0, 2.5, 1.5);
  const fenceTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#2d7d4a'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + 4, 0, 3, h); } g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h - 4, w, 4); }, { aniso: 4 });
  fenceTex.wrapS = fenceTex.wrapT = T.RepeatWrapping; fenceTex.repeat.set(1.5, 1);
  const fenceGeo = new T.BoxGeometry(12, 2.8, 0.16); fenceGeo.translate(0, 1.4, 0); const fenceMat = new T.MeshStandardMaterial({ map: fenceTex, roughness: 0.7, metalness: 0.2 });
  const kioskMat = stdMat(0xffffff), awnMat = stdMat(0xffffff);

  /* facades: warm mid-rise and lit glass towers */
  const midMap = canvasTex(256, 256, (g) => { g.fillStyle = '#e4dccb'; g.fillRect(0, 0, 256, 256); for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) { const x = cx * 64, y = cy * 64; g.fillStyle = '#cfc6b3'; g.fillRect(x, y, 64, 3); g.fillStyle = '#2b3a42'; g.fillRect(x + 8, y + 10, 48, 40); g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(x + 8, y + 10, 48, 8); } }, { aniso: 4 });
  const midEmi = canvasTex(256, 256, (g) => { const q = rng(8); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256); for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) if (q() < 0.6) { g.fillStyle = q() < .8 ? '#ffe0a0' : '#aee8e4'; g.fillRect(cx * 64 + 8, cy * 64 + 10, 48, 40); } }, { aniso: 4 });
  const towMap = canvasTex(256, 256, (g) => { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#34506b'); gr.addColorStop(1, '#15232f'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 4; cx++) { g.fillStyle = 'rgba(160,200,230,.22)'; g.fillRect(cx * 64 + 4, cy * 32 + 4, 56, 24); } g.fillStyle = '#c9a24a'; for (let cx = 0; cx < 4; cx++) g.fillRect(cx * 64 + 30, 0, 4, 256); }, { aniso: 4 });
  const towEmi = canvasTex(256, 256, (g) => { const q = rng(15); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256); for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 4; cx++) if (q() < 0.5) { g.fillStyle = '#ffd890'; g.fillRect(cx * 64 + 4, cy * 32 + 4, 56, 24); } g.fillStyle = '#ffd27a'; for (let cx = 0; cx < 4; cx++) g.fillRect(cx * 64 + 29, 0, 6, 256); }, { aniso: 4 });
  [midMap, midEmi, towMap, towEmi].forEach((t) => { t.wrapS = t.wrapT = T.RepeatWrapping; });
  const midMat = regEmi(new T.MeshStandardMaterial({ map: midMap, emissiveMap: midEmi, emissive: 0xffffff, emissiveIntensity: 0.03, roughness: 0.78 }), 0.03, 1.0);
  const towMat = regEmi(new T.MeshStandardMaterial({ map: towMap, emissiveMap: towEmi, emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.3, metalness: 0.25 }), 0.12, 1.2);
  const bGeoCache = {};
  function bGeo(type, h) { const k = type + h; if (!bGeoCache[k]) { const g = new T.BoxGeometry(9, h, 9); g.translate(0, h / 2, 0); const uv = g.attributes.uv, ry = type === 'tower' ? h / 8 : h / 4.5; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * ry); bGeoCache[k] = g; } return bGeoCache[k]; }
  function flushBuildings(z, B) { for (const k in B) inst(z.group, B[k].geo, B[k].type === 'tower' ? towMat : midMat, B[k].items, true, true); }
  function addB(B, type, h, x, zz, tint, sx, sz) { const k = type + h; (B[k] = B[k] || { geo: bGeo(type, h), type, items: [] }).items.push({ m: mat4(x, 0, zz, sx || 1, 1, sz || 1, 0), c: tint == null ? 0xffffff : tint }); }

  /* blue Addis road signs */
  const SIGNS = [['ፒያሳ', 'Piassa', '2.1 km'], ['ቦሌ', 'Bole', '4.4 km'], ['መስቀል አደባባይ', 'Meskel Sq.', '1.2 km'], ['አራት ኪሎ', 'Arat Kilo', '3.0 km'], ['መገናኛ', 'Megenagna', '6.8 km'], ['ሜክሲኮ', 'Mexico', '1.8 km']];
  const signTex = SIGNS.map((s) => signTexture(s[0], s[1], s[2]));
  const signPoleMat = stdMat(0x2a2e33, 0.6, 0.4);

  /* the shared Addis street dressing for a zone */
  function dress(z, o) {
    const r = rng(o.seed), B = {}, euc = [], eucT = [], fences = [], kiosks = [], awns = [], flow = [], huts = [], hutR = [], tr = [], tp = [], rk = [];
    const tints = o.tints || [0xffffff, 0xf1d9b8, 0xd8e6ef, 0xe9e3c8];
    if (o.left) for (let u = 5; u < 197; u += o.left.step) { if (!free(z.z0, u, 13)) continue; const hs = o.left.hs; const kind = r() < o.left.tower ? 'tower' : 'mid'; const h = kind === 'tower' ? [18, 24, 30][Math.floor(r() * 3)] : hs[Math.floor(r() * hs.length)]; addB(B, kind, h, -(o.left.x + r() * 3), z.z0 - u, kind === 'tower' ? 0xffffff : tints[Math.floor(r() * tints.length)], 0.9 + r() * 0.3, 0.9 + r() * 0.3); }
    if (o.rightB) for (let u = 7; u < 197; u += o.rightB.step) { if (!free(z.z0, u, 13)) continue; const kind = r() < o.rightB.tower ? 'tower' : 'mid'; const h = kind === 'tower' ? [20, 28, 36][Math.floor(r() * 3)] : o.rightB.hs[Math.floor(r() * o.rightB.hs.length)]; addB(B, kind, h, o.rightB.x + r() * 4, z.z0 - u, kind === 'tower' ? 0xffffff : tints[Math.floor(r() * tints.length)]); }
    flushBuildings(z, B);
    for (let i = 0; i < (o.euc || 0); i++) { const left = r() < 0.6, x = left ? -(17 + r() * 42) : (34 + r() * 36), u = r() * 200; if (!free(z.z0, u, 6)) continue; const s = 0.8 + r() * 0.6, g = z.z0 - u; euc.push({ m: mat4(x, 0, g, s) }); eucT.push({ m: mat4(x, 0, g, s), c: C.set(0x5c8461).offsetHSL((r() - .5) * .04, 0, (r() - .5) * .1).getHex() }); }
    inst(z.group, eucTrunk, matTrunk, euc, true); inst(z.group, eucTop, eucMat, eucT, true);
    if (o.fence) for (let u = 6; u < 190; u += 12.5) { if (r() > o.fence || !free(z.z0, u, 8)) continue; fences.push({ m: mat4(-14.4, 0, z.z0 - u, 1) }); }
    inst(z.group, fenceGeo, fenceMat, fences, false, true);
    if (o.kiosk) for (let u = 8; u < 190; u += 9) { if (r() > o.kiosk || !free(z.z0, u, 8)) continue; const c = [0xffc83a, 0x2f86d6, 0xd94c3a, 0x3aa56a][Math.floor(r() * 4)]; kiosks.push({ m: mat4(-11.4, 0.13, z.z0 - u, 1), c: 0xf2ead8 }); awns.push({ m: mat4(-11.4, 0.13, z.z0 - u, 1), c }); }
    inst(z.group, kioskBody, kioskMat, kiosks, true, true); inst(z.group, kioskAwn, awnMat, awns, false);
    if (o.signs) { let n = 0; for (let tries = 0; tries < 40 && n < o.signs; tries++) { const u = 10 + r() * 180; if (!free(z.z0, u, 9) || lampZs.some((lz) => Math.abs(lz - (z.z0 - u)) < 5) || sideLampZs.some((lz) => Math.abs(lz - (z.z0 - u)) < 5)) continue; const g = new T.Group(); g.position.set(-12.6, 0.13, z.z0 - u); const pole = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 3.4, 6), signPoleMat); pole.position.y = 1.7; g.add(pole); const bm = new T.Mesh(new T.PlaneGeometry(5, 2.5), new T.MeshBasicMaterial({ map: signTex[(n + o.seed) % signTex.length], toneMapped: false, side: T.DoubleSide })); bm.position.y = 3.9; bm.rotation.set(TILT, 0, 0); g.add(bm); z.group.add(g); n++; } }
    if (o.flowers) for (let i = 0; i < o.flowers; i++) { const left = r() < 0.6, cx = left ? -(16 + r() * 40) : (33 + r() * 30), cu = r() * 200; if (!free(z.z0, cu, 6)) continue; for (let k = 0; k < 12; k++) flow.push({ m: mat4(cx + (r() - 0.5) * 6, 0, z.z0 - cu + (r() - 0.5) * 6, 0.7 + r() * 0.8) }); }
    inst(z.group, flowerGeo, matFlower, flow, false);
    if (o.huts) for (let i = 0; i < o.huts; i++) { const x = -(18 + r() * 38), u = r() * 195, g = z.z0 - u; if (!free(z.z0, u, 8)) continue; const s = 0.9 + r() * 0.4; huts.push({ m: mat4(x, 0, g, s), c: C.set(0xc9a77a).offsetHSL(0, 0, (r() - .5) * .08).getHex() }); hutR.push({ m: mat4(x, 0, g, s) }); }
    inst(z.group, hutWall, matHutWall, huts, true, true); inst(z.group, hutRoof, matThatch, hutR, true);
    if (o.trees) for (let u = 6; u < 196; u += 7 + r() * 8) { if (!free(z.z0, u, 8)) continue; const left = r() < 0.65, x = left ? -(16 + r() * 36) : (34 + r() * 30), s = 0.8 + r() * 0.7, g = z.z0 - u; const col = C.set(o.trees).offsetHSL((r() - .5) * .05, 0, (r() - .5) * .12).getHex(); if (o.acacia) { tr.push({ m: mat4(x, 0, g, s, s, s, r() * 6) }); tp.push({ m: mat4(x, 0, g, s, s, s, r() * 6), c: col }); } else { tr.push({ m: mat4(x, 0, g, s) }); tp.push({ m: mat4(x, 0, g, s), c: col }); } }
    inst(z.group, o.acacia ? acaciaTrunk : trunkGeo, matTrunk, tr, true); inst(z.group, o.acacia ? acaciaTop : coneGeo, matLeaf, tp, true);
    for (let i = 0; i < 24; i++) { const left = r() < 0.6, u = r() * 200; if (!free(z.z0, u, 6)) continue; rk.push({ m: mat4(left ? -(15 + r() * 30) : (34 + r() * 26), 0.2, z.z0 - u, 0.5 + r() * 0.9, 0.35 + r() * 0.5, 0.5 + r() * 0.9, r() * 6) }); }
    inst(z.group, rockGeo, matRock, rk, true);
    const hills = []; for (let i = 0; i < 10; i++) { const left = i % 2 === 0; hills.push({ m: mat4(left ? -(115 + r() * 40) : (110 + r() * 40), -8, z.z0 - 10 - i * 19, 36 + r() * 20, 18 + r() * 10, 30 + r() * 14), c: C.set(o.hill || 0x7f9b72).offsetHSL(0, 0, (r() - .5) * .08).getHex() }); }
    inst(z.group, hillGeo, matHill, hills, false, false);
  }

  /* roundabouts: tricolour curb, planted island, monument */
  const triTex = canvasTex(96, 16, (g) => { g.fillStyle = '#078930'; g.fillRect(0, 0, 32, 16); g.fillStyle = '#fcdd09'; g.fillRect(32, 0, 32, 16); g.fillStyle = '#da121a'; g.fillRect(64, 0, 32, 16); }, { aniso: 2 });
  triTex.wrapS = triTex.wrapT = T.RepeatWrapping; triTex.repeat.set(8, 1);
  const stone = stdMat(0x7c8289, 0.9), bronze = new T.MeshStandardMaterial({ color: 0x2f3f38, metalness: 0.55, roughness: 0.45, flatShading: true });
  function lionMonument(g) {
    const add = (geo, mat, x, y, zz, rx, rz) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, zz); if (rx) m.rotation.x = rx; if (rz) m.rotation.z = rz; m.castShadow = shadowsOn(); m.receiveShadow = true; g.add(m); return m; };
    add(new T.CylinderGeometry(4.6, 4.9, 0.45, 8), stone, 0, 0.55, 0); add(new T.BoxGeometry(4.0, 3.2, 4.0), stone, 0, 2.4, 0);
    add(new T.CylinderGeometry(0.62, 0.62, 0.12, 16), bronze, 0, 2.5, 2.05, Math.PI / 2); add(new T.BoxGeometry(2.4, 1.0, 0.1), bronze, 0, 2.7, 2.03);
    add(new T.BoxGeometry(4.3, 0.45, 4.3), stone, 0, 4.2, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new T.BoxGeometry(0.62, 2.4, 0.62), stone, sx * 1.55, 5.6, sz * 1.55);
    add(new T.BoxGeometry(4.5, 0.55, 4.5), stone, 0, 7.05, 0);
    const y0 = 7.3; add(new T.CapsuleGeometry(0.55, 1.5, 4, 8), bronze, 0, y0 + 0.95, 0, Math.PI / 2);
    add(new T.SphereGeometry(0.48, 10, 8), bronze, 0, y0 + 1.5, 1.55); add(new T.IcosahedronGeometry(0.7, 0), new T.MeshStandardMaterial({ color: 0x1b2420, roughness: 0.9, flatShading: true }), 0, y0 + 1.4, 1.3);
    add(new T.BoxGeometry(0.3, 0.26, 0.3), bronze, 0, y0 + 1.35, 2.0);
    for (const sx of [-1, 1]) { add(new T.BoxGeometry(0.28, 1.0, 0.28), bronze, sx * 0.36, y0 + 0.4, -0.85); if (sx < 0) add(new T.BoxGeometry(0.28, 1.0, 0.28), bronze, sx * 0.36, y0 + 0.4, 0.85); }
    const paw = add(new T.BoxGeometry(0.28, 1.0, 0.28), bronze, 0.36, y0 + 0.95, 1.1, -0.9);
    add(new T.CylinderGeometry(0.04, 0.04, 2.4, 6), gold, 0.4, y0 + 2.2, 1.0); add(new T.BoxGeometry(0.5, 0.09, 0.09), gold, 0.4, y0 + 3.2, 1.0); add(new T.BoxGeometry(0.09, 0.5, 0.09), gold, 0.4, y0 + 3.1, 1.0);
    add(new T.TorusGeometry(0.62, 0.08, 6, 14, Math.PI * 1.2), bronze, 0, y0 + 1.1, -1.5, 0, Math.PI / 2);
  }
  function fountainMonument(g) {
    const water = regEmi(new T.MeshStandardMaterial({ color: 0x2a6f9c, emissive: 0x5cc8ff, emissiveIntensity: 0.25, roughness: 0.2, metalness: 0.3 }), 0.25, 1.5);
    const add = (geo, mat, y) => { const m = new T.Mesh(geo, mat); m.position.y = y; m.castShadow = shadowsOn(); g.add(m); return m; };
    add(new T.CylinderGeometry(5.2, 5.4, 0.7, 28), stone, 0.7); add(new T.CylinderGeometry(4.6, 4.6, 0.2, 28), water, 1.1);
    add(new T.CylinderGeometry(0.9, 1.3, 3.0, 12), stone, 2.2); add(new T.CylinderGeometry(2.6, 1.2, 0.7, 20), stone, 3.8); add(new T.CylinderGeometry(2.3, 2.3, 0.15, 20), water, 4.2);
    add(new T.ConeGeometry(0.4, 4, 8), water, 6.2);
  }
  function roundabout(z, cz, kind) {
    const disc = new T.Mesh(new T.CircleGeometry(RB_R, 64), new T.MeshStandardMaterial({ color: 0x2b3034, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(0, 0.034, cz); disc.receiveShadow = true; scene.add(disc);
    const ringLine = new T.Mesh(new T.RingGeometry(13.4, 13.55, 72), new T.MeshBasicMaterial({ color: 0xeeeee4, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); ringLine.rotation.x = -Math.PI / 2; ringLine.position.set(0, 0.04, cz); scene.add(ringLine);
    const curb = new T.Mesh(new T.CylinderGeometry(ISLAND_R, ISLAND_R, 0.4, 56), new T.MeshStandardMaterial({ map: triTex, roughness: 0.8 })); curb.position.set(0, 0.2, cz); curb.receiveShadow = true; z.group.add(curb);
    const grass = new T.Mesh(new T.CylinderGeometry(ISLAND_R - 0.45, ISLAND_R - 0.45, 0.46, 56), new T.MeshStandardMaterial({ color: 0x4f8a3c, roughness: 1 })); grass.position.set(0, 0.23, cz); grass.receiveShadow = true; z.group.add(grass);
    const g = new T.Group(); g.position.set(0, 0.42, cz); (kind === 'lion' ? lionMonument : fountainMonument)(g); z.group.add(g);
    const r = rng(cz), fl = [], pt = [], pc = [];
    for (let i = 0; i < 46; i++) { const a = r() * 6.283, rr2 = 5.6 + r() * 1.6; fl.push({ m: mat4(Math.cos(a) * rr2, 0.42, cz + Math.sin(a) * rr2, 0.8 + r() * 0.6) }); }
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.2; const px = Math.cos(a) * 6.6, pz = cz + Math.sin(a) * 6.6; pt.push({ m: mat4(px, 0.4, pz, 0.9) }); }
    inst(z.group, flowerGeo, matFlower, fl, false); inst(z.group, palmTrunk, palmTrunkMat, pt, true); inst(z.group, palmCrown, palmLeafMat, pt, true);
    const glowRing = regEmi(new T.MeshStandardMaterial({ color: 0x222, emissive: 0xffc857, emissiveIntensity: 0.3, roughness: 0.5 }), 0.3, 2.0);
    const ring = new T.Mesh(new T.TorusGeometry(ISLAND_R + 0.2, 0.09, 6, 64), glowRing); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.45, cz); z.group.add(ring);
  }

  /* ---------- 0 HERO ---------- */
  function buildHero(z) {
    dress(z, { seed: 21, left: { step: 19, x: 28, hs: [8, 10, 12], tower: 0.1 }, rightB: { step: 34, x: 52, hs: [8, 12], tower: 0.1 }, euc: 46, fence: 0.5, kiosk: 0.35, signs: 4, trees: 0x3f7a45, flowers: 4, hill: 0x7f9b72 });
    sidePanel(z, heroPanelTexture(), 4, 17, 10.6, '#ffc857', 5.2);
    sidePanel(z, bioPanelTexture(), 70, 17, 10.6, '#ffc857', 5.2);
    roundabout(z, -150, 'lion');
    const line = new T.Mesh(new T.PlaneGeometry(CW - 1.8, 0.5), new T.MeshBasicMaterial({ color: 0xffc857 })); line.rotation.x = -Math.PI / 2; line.position.set(5.1, 0.06, 8); z.group.add(line);
  }

  /* ---------- 1 WORKS ---------- */
  function buildWorks(z) {
    dress(z, { seed: 33, left: { step: 17, x: 27, hs: [10, 14, 18], tower: 0.2 }, rightB: { step: 30, x: 54, hs: [12, 18], tower: 0.3 }, euc: 20, fence: 0.25, kiosk: 0.3, signs: 4, trees: 0x6a5fb0, flowers: 0, tints: [0xffd1e8, 0xcfe9ff, 0xe0d4ff, 0xfff1c0, 0xcff5e4], hill: 0x8a7fb0 });
    const r = rng(34), accents = ['#5cf0ff', '#ff6fb5', '#ffc857', '#9b8cff', '#6dffb0', '#ff9a62'], us = [24, 38, 68, 94, 122, 170];
    CONTENT.works.forEach((w, i) => {
      const acc = accents[i % accents.length], u = us[i % us.length];
      const tex = panelTexture({ w: texW(), h: Math.round(texW() * 0.98), kicker: 'Project ' + pad2(i + 1) + ' · ' + w.kind, badge: '', title: w.title, body: w.desc, tags: w.tags, accent: acc, bg: 'rgba(12,8,30,.97)', maxLines: 4, bodySize: 36 });
      const pm = sidePanel(z, tex, u, 14.5, 14.2, acc, 6.2); reg.anim.push((t) => { pm.position.y = 6.2 + Math.sin(t * 1.2 + i) * 0.18; });
    });
    const shapes = [], cols = [0x5cf0ff, 0xff6fb5, 0xffc857, 0x9b8cff]; const shardMat = regEmi(new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.2, flatShading: true }), 0.25, 1.1);
    for (let i = 0; i < 30; i++) { const left = r() < 0.6, u = 6 + r() * 190; if (!free(z.z0, u, 7)) continue; shapes.push({ x: left ? -(16 + r() * 16) : (33 + r() * 16), y: 1.6 + r() * 6, z: z.z0 - u, s: 0.6 + r() * 1.3, ph: r() * 6, c: cols[i % 4] }); }
    const sm = new T.InstancedMesh(new T.OctahedronGeometry(0.7, 0), shardMat, shapes.length); sm.frustumCulled = false; sm.castShadow = shadowsOn(); shapes.forEach((s, i) => sm.setColorAt(i, C.set(s.c))); z.group.add(sm);
    const dummy = new T.Object3D(); reg.anim.push((t) => { shapes.forEach((s, i) => { dummy.position.set(s.x, s.y + Math.sin(t + s.ph) * 0.35, s.z); dummy.rotation.set(t * 0.4 + s.ph, t * 0.6, 0); dummy.scale.setScalar(s.s); dummy.updateMatrix(); sm.setMatrixAt(i, dummy.matrix); }); sm.instanceMatrix.needsUpdate = true; });
    const strip = regEmi(new T.MeshStandardMaterial({ color: 0x111, emissive: 0x5cf0ff, emissiveIntensity: 0.7, roughness: 0.4 }), 0.7, 2.4);
    for (const s of [-1, 1]) { const b = new T.Mesh(new T.BoxGeometry(0.14, 0.14, 190), strip); b.position.set(s * 13.5, 0.2, z.z0 - 100); z.group.add(b); }
    gateSign(z, z.hex, '02', 'Works', 'Selected projects');
  }

  /* ---------- 2 EXPERIENCE ---------- */
  function buildExperience(z) {
    dress(z, { seed: 45, left: { step: 16, x: 26, hs: [10, 14], tower: 0.6 }, rightB: { step: 22, x: 52, hs: [12, 16], tower: 0.6 }, euc: 14, fence: 0.2, kiosk: 0.2, signs: 4, trees: 0x4f8a62, flowers: 0, tints: [0xffffff, 0xd8e6ef, 0xe9e3c8], hill: 0x9aa8a8 });
    const rail = regEmi(new T.MeshStandardMaterial({ color: 0x20353a, emissive: 0x2fb5b0, emissiveIntensity: 0.5, roughness: 0.5 }), 0.5, 2.0);
    for (const s of [-1, 1]) { const b = new T.Mesh(new T.BoxGeometry(0.16, 0.16, 190), rail); b.position.set(s * 13.5, 0.22, z.z0 - 100); z.group.add(b); }
    [24, 74, 108, 176].forEach((u, i) => {
      const j = CONTENT.experience[i]; if (!j) return;
      const tex = panelTexture({ w: texW(), kicker: j.years, h: Math.round(texW() * 0.8), badge: 'Role ' + (i + 1), title: j.role, sub: j.org, subSize: 32, body: j.desc || j.place, bodySize: 34, accent: '#2fb5b0', bg: 'rgba(6,20,28,.97)', maxLines: 3 });
      sidePanel(z, tex, u, 14, 11.2, '#2fb5b0', 5.2);
      const node = new T.Mesh(new T.CylinderGeometry(0.6, 0.6, 0.4, 16), rail); node.position.set(13.5, 0.3, z.z0 - u); z.group.add(node);
    });
    roundabout(z, -450, 'fountain');
    gateSign(z, z.hex, '03', 'Experience', 'Where I have worked');
  }

  /* ---------- 3 ABOUT ---------- */
  function buildAbout(z) {
    dress(z, { seed: 57, left: { step: 30, x: 30, hs: [6, 8], tower: 0 }, euc: 30, fence: 0.15, kiosk: 0.3, signs: 3, trees: 0x6f8a3a, acacia: true, flowers: 14, huts: 14, tints: [0xf3dfc0, 0xe9c9a0, 0xffe9cf], hill: 0xb9854f });
    const wall = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#e9d9bd'; g.fillRect(0, 0, w, h); const cs = ['#2f7a4f', '#e0a63a', '#b8402e']; for (let i = 0; i < 3; i++) { g.fillStyle = cs[i]; g.fillRect(0, 10 + i * 6, w, 3); } for (let x = 0; x < w; x += 16) { g.fillStyle = '#2b2118'; g.beginPath(); g.moveTo(x, 50); g.lineTo(x + 8, 32); g.lineTo(x + 16, 50); g.fill(); } }, { aniso: 4 });
    wall.wrapS = T.RepeatWrapping; wall.repeat.set(3, 1); const wm = stdMat(0xffffff, 0.9); wm.map = wall;
    for (const u of [30, 100, 180]) { if (!free(z.z0, u, 8)) continue; const b = new T.Mesh(new T.BoxGeometry(0.6, 1.1, 6), wm); b.position.set(-13.2, 0.7, z.z0 - u); b.castShadow = shadowsOn(); z.group.add(b); }
    const A1 = CONTENT.about, acc = '#e9a23b', bg = 'rgba(30,17,12,.97)';
    const T4 = Math.round(texW() * 0.86), G = A1.skillGroups, jn = (g) => g.items.join(', ');
    const items = [
      { u: 20, tex: panelTexture({ w: texW(), h: T4, kicker: 'About', title: 'The short story', body: A1.roadStory[0], bodySize: 38, accent: acc, bg, maxLines: 5 }), h: 12.4 },
      { u: 58, tex: panelTexture({ w: texW(), h: T4, kicker: 'About', title: 'What I care about', body: A1.roadStory[1], bodySize: 38, accent: acc, bg, maxLines: 5 }), h: 12.4 },
      { u: 96, tex: panelTexture({ w: texW(), h: T4, kicker: 'Skills', title: 'Languages & web', body: [jn(G[0]), jn(G[1]), jn(G[2])].join('. ') + '.', bodySize: 34, accent: acc, bg, titleSize: 80, maxLines: 5 }), h: 12.4 },
      { u: 134, tex: panelTexture({ w: texW(), h: T4, kicker: 'Skills', title: 'AI & blockchain', body: [jn(G[3]), jn(G[4])].join('. ') + '.', bodySize: 34, accent: acc, bg, titleSize: 80, maxLines: 5 }), h: 12.4 },
      { u: 176, tex: panelTexture({ w: texW(), h: Math.round(texW() * 0.7), kicker: 'Good to know', title: A1.facts[0], body: A1.facts.slice(1).join('  ·  '), accent: acc, bg, titleSize: 70, bodySize: 36, maxLines: 3 }), h: 9.8 }
    ];
    items.forEach((p) => { let u = p.u; if (!free(z.z0, u, 12)) u += 14; sidePanel(z, p.tex, u, 14, p.h, acc, 4.6 + (p.h - 9.8) / 2); });
    roundabout(z, -750, 'lion');
    gateSign(z, z.hex, '04', 'About', 'A bit about me');
  }

  /* ---------- 4 CONTACT ---------- */
  const PLAZA = { x: 0, z: -962, r: 17 };
  function buildContact(z) {
    dress(z, { seed: 69, left: { step: 34, x: 30, hs: [8, 10], tower: 0.1 }, euc: 20, fence: 0.1, kiosk: 0.15, signs: 2, trees: 0x4f8a62, flowers: 8, hill: 0x86a99b });
    const disc = new T.Mesh(new T.CylinderGeometry(PLAZA.r, PLAZA.r + 0.4, 0.3, 48), stdMat(0xd8d5c8, 0.9)); disc.position.set(PLAZA.x, 0.12, PLAZA.z); disc.receiveShadow = true; z.group.add(disc);
    const ringMat = regEmi(new T.MeshStandardMaterial({ color: 0x2a2a20, emissive: 0xffc857, emissiveIntensity: 0.6, roughness: 0.4 }), 0.6, 2.4);
    const ring = new T.Mesh(new T.TorusGeometry(PLAZA.r - 1.2, 0.18, 8, 64), ringMat); ring.rotation.x = Math.PI / 2; ring.position.set(PLAZA.x, 0.4, PLAZA.z); z.group.add(ring);
    const ring2 = new T.Mesh(new T.TorusGeometry(5.5, 0.14, 8, 48), ringMat); ring2.rotation.x = Math.PI / 2; ring2.position.set(PLAZA.x, 0.4, PLAZA.z - 5); z.group.add(ring2);
    const beam = regGlow(new T.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), 0.18, 0.5);
    const bm = new T.Mesh(new T.CylinderGeometry(1.4, 3.2, 30, 20, 1, true), beam); bm.position.set(PLAZA.x, 15, PLAZA.z - 5); z.group.add(bm);
    const core = new T.Mesh(new T.OctahedronGeometry(1.5, 0), regEmi(new T.MeshStandardMaterial({ color: 0xffe9b5, emissive: 0xffc857, emissiveIntensity: 0.9, roughness: 0.3, flatShading: true }), 0.9, 2.6)); core.position.set(PLAZA.x, 4.4, PLAZA.z - 5); z.group.add(core);
    reg.anim.push((t) => { core.rotation.y = t * 0.7; core.position.y = 4.4 + Math.sin(t * 1.3) * 0.3; });
    // flag poles in the national colours
    const flagCols = [0x078930, 0xfcdd09, 0xda121a];
    for (const sx of [-1, 1]) { const pole = new T.Mesh(new T.CylinderGeometry(0.08, 0.1, 9, 6), gold); pole.position.set(sx * 12.5, 4.5, PLAZA.z + 9); z.group.add(pole); flagCols.forEach((c, i) => { const f = new T.Mesh(new T.BoxGeometry(2.8, 0.55, 0.06), new T.MeshStandardMaterial({ color: c, roughness: 0.8 })); f.position.set(sx * 12.5 + 1.5, 8.5 - i * 0.55, PLAZA.z + 9); z.group.add(f); reg.anim.push((t) => { f.rotation.y = Math.sin(t * 2 + i * 0.5) * 0.12; }); }); }
    const c = CONTENT.contact;
    const tex = panelTexture({ w: texW() + 256, h: Math.round((texW() + 256) * 0.7), kicker: 'Contact', badge: 'The end of the road', title: c.cta, titleSize: 84, sub: c.email, body: c.phone + '   ' + c.links.map((l) => l.value).join('   '), bodySize: 30, accent: '#ffc857', bg: 'rgba(10,15,18,.97)', maxLines: 3 });
    const grp = new T.Group(); grp.position.set(PLAZA.x, 0, PLAZA.z - 14); panel(grp, tex, 0, 6.2, 0, 17, 10.5, 0, '#ffc857'); z.group.add(grp);
    gateSign(z, z.hex, '05', 'Contact', 'Say hello');
  }
  const BUILD = [buildHero, buildWorks, buildExperience, buildAbout, buildContact];
  ZONES.forEach((z, i) => { BUILD[i](z); z.built = true; });

  /* =====================================================================
     Player car + driver
     ===================================================================== */
  const car = new T.Group(); scene.add(car);
  const paint = new T.MeshPhysicalMaterial({ color: 0x0f4a38, metalness: 0.85, roughness: 0.27, clearcoat: 1, clearcoatRoughness: 0.12, envMap: envTex, envMapIntensity: 1 });
  envMats.push(paint);
  const trim = new T.MeshStandardMaterial({ color: 0x14181a, roughness: 0.5, metalness: 0.3 });
  const chrome = new T.MeshStandardMaterial({ color: 0xc9ced2, metalness: 1, roughness: 0.25, envMap: envTex }); envMats.push(chrome);
  const glassMat = new T.MeshPhysicalMaterial({ color: 0x9fb8c4, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.1, side: T.DoubleSide, depthWrite: false });
  const leather = new T.MeshStandardMaterial({ color: 0x3a2c24, roughness: 0.8 });
  const part = (geo, mat, x, y, z, cast) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast !== false && shadowsOn(); m.receiveShadow = true; car.add(m); return m; };

  const sidePts = [[-2.1, .45], [-2.1, .8], [-1.4, .95], [-.5, .95], [1.4, 1.0], [2.1, .95], [2.1, .45], [1.72, .45], [1.72, .72], [.9, .72], [.9, .45], [-.9, .45], [-.9, .72], [-1.72, .72], [-1.72, .45]];
  const sideGeo = extrudeProfile(sidePts, 0.34, 0.04);
  part(sideGeo, paint, -0.78, 0, 0); part(sideGeo, paint, 0.78, 0, 0);
  part(extrudeProfile([[-2.1, .5], [-2.1, .8], [-1.4, .98], [-.55, .98], [-.55, .5]], 1.22, 0.04), paint, 0, 0, 0);
  part(extrudeProfile([[.9, .5], [.9, .98], [1.4, 1.03], [2.1, .97], [2.1, .5]], 1.22, 0.04), paint, 0, 0, 0);
  part(new T.BoxGeometry(1.5, 0.08, 2.6), leather, 0, 0.55, 0.15, false);
  part(new T.BoxGeometry(1.9, 0.22, 0.22), trim, 0, 0.55, -2.14); part(new T.BoxGeometry(1.9, 0.2, 0.2), trim, 0, 0.55, 2.14);
  part(new T.BoxGeometry(1.0, 0.16, 0.05), trim, 0, 0.74, -2.12, false);                  // grille
  for (const s of [-1, 1]) part(new T.BoxGeometry(0.03, 0.035, 3.7), chrome, s * 0.955, 0.87, 0.1, false);   // beltline
  // cockpit
  part(new T.BoxGeometry(1.5, 0.28, 0.42), trim, 0, 0.98, -0.72);                           // dash
  for (const sx of [-0.4, 0.4]) { part(new T.BoxGeometry(0.5, 0.16, 0.55), leather, sx, 0.66, 0.4, false); const b = part(new T.BoxGeometry(0.5, 0.62, 0.13), leather, sx, 0.98, 0.7, false); b.rotation.x = 0.16; }
  const hoop = part(new T.TorusGeometry(0.78, 0.05, 6, 18, Math.PI), trim, 0, 0.98, 1.02); hoop.scale.y = 0.65;
  const ws = part(new T.PlaneGeometry(1.56, 0.5), glassMat, 0, 1.2, -0.5, false); ws.rotation.x = -0.64;
  for (const s of [-1, 1]) { const a = part(new T.BoxGeometry(0.05, 0.56, 0.05), chrome, s * 0.78, 1.2, -0.5, false); a.rotation.x = -0.64; }
  const wsTop = part(new T.BoxGeometry(1.6, 0.04, 0.05), chrome, 0, 1.46, -0.31, false);
  // steering wheel
  const swPivot = new T.Group(); swPivot.position.set(-0.4, 1.1, -0.38); swPivot.rotation.x = -0.9; car.add(swPivot);
  const sw = new T.Mesh(new T.TorusGeometry(0.2, 0.032, 6, 18), trim); swPivot.add(sw);
  const swHub = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.04, 8), chrome); swHub.rotation.x = Math.PI / 2; sw.add(swHub);
  // wheels
  const tireMat = new T.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 });
  const rimMat = new T.MeshStandardMaterial({ color: 0xb9c0c5, metalness: 0.9, roughness: 0.3, envMap: envTex }); envMats.push(rimMat);
  const tireGeo = new T.CylinderGeometry(0.38, 0.38, 0.3, 18); tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new T.CylinderGeometry(0.23, 0.23, 0.32, 10); rimGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz, front] of [[-1.02, -1.3, 1], [1.02, -1.3, 1], [-1.02, 1.3, 0], [1.02, 1.3, 0]]) {
    const pivot = new T.Group(); pivot.position.set(wx, 0.38, wz); car.add(pivot);
    const spin = new T.Group(); pivot.add(spin);
    const tire = new T.Mesh(tireGeo, tireMat); tire.castShadow = shadowsOn(); spin.add(tire);
    const rim = new T.Mesh(rimGeo, rimMat); spin.add(rim);
    const spoke = new T.Mesh(new T.BoxGeometry(0.33, 0.07, 0.4), trim); spin.add(spoke);
    wheels.push({ pivot, spin, front });
  }
  // lights
  const headMat = regCol(new T.MeshBasicMaterial({ color: 0xe6ecee, toneMapped: false }), 0xe6ecee, 0xfff1c0);
  for (const s of [-1, 1]) { part(new T.BoxGeometry(0.38, 0.1, 0.06), headMat, s * 0.62, 0.8, -2.12, false); }
  const tailMat = new T.MeshStandardMaterial({ color: 0x300a0a, emissive: 0xff2410, emissiveIntensity: 0.5 });
  for (const s of [-1, 1]) part(new T.BoxGeometry(0.46, 0.09, 0.05), tailMat, s * 0.58, 0.82, 2.11, false);
  const beamMat = regGlow(new T.MeshBasicMaterial({ map: glowTexture('rgba(255,236,190,.85)', 'rgba(255,236,190,0)'), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0 }), 0.32, 0);
  const beam1 = new T.Mesh(new T.PlaneGeometry(7, 13), beamMat); beam1.rotation.x = -Math.PI / 2; beam1.position.set(0, 0.12, -9); car.add(beam1);
  const spot = new T.SpotLight(0xfff0cc, 0, 46, 0.62, 0.55, 1.2); spot.position.set(0, 1, -1.8); spot.target.position.set(0, 0, -16); car.add(spot, spot.target);
  const shadowBlob = new T.Mesh(new T.PlaneGeometry(3.4, 5.6), new T.MeshBasicMaterial({ map: glowTexture('rgba(0,0,0,.45)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false })); shadowBlob.rotation.x = -Math.PI / 2; shadowBlob.position.y = 0.06; car.add(shadowBlob);

  /* driver: simplified, friendly, medium-brown skin, short black curls, neat casual shirt */
  const skin = new T.MeshStandardMaterial({ color: 0x9a6542, roughness: 0.7 });
  const hairM = new T.MeshStandardMaterial({ color: 0x0b0a0a, roughness: 0.95 });
  const shirt = new T.MeshStandardMaterial({ color: 0x6f8f7b, roughness: 0.85 });
  const dark = new T.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.5 });
  const driver = new T.Group(); driver.position.set(-0.4, 0.62, 0.42); car.add(driver);
  const torso = new T.Group(); driver.add(torso);
  const chest = new T.Mesh(new T.CapsuleGeometry(0.22, 0.34, 4, 10), shirt); chest.scale.set(1.28, 1, 0.78); chest.position.y = 0.6; chest.castShadow = shadowsOn(); torso.add(chest);
  const collar = new T.Mesh(new T.TorusGeometry(0.1, 0.025, 6, 12), new T.MeshStandardMaterial({ color: 0xe9ece6, roughness: 0.8 })); collar.rotation.x = Math.PI / 2; collar.position.set(0, 0.98, -0.01); torso.add(collar);
  const neck = new T.Mesh(new T.CylinderGeometry(0.07, 0.08, 0.14, 8), skin); neck.position.y = 1.04; torso.add(neck);
  const head = new T.Group(); head.position.y = 1.2; torso.add(head);
  const skull = new T.Mesh(new T.SphereGeometry(0.19, 16, 12), skin); skull.scale.set(0.92, 1.06, 1); skull.castShadow = shadowsOn(); head.add(skull);
  const cap = new T.Mesh(new T.SphereGeometry(0.205, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM); cap.position.set(0, 0.02, 0.025); cap.rotation.x = 0.4; cap.scale.set(0.94, 1.06, 1.02); head.add(cap);
  { const q = rng(2); for (let i = 0; i < 26; i++) { const th = q() * 1.05, ph = q() * Math.PI * 2, x = Math.sin(th) * Math.cos(ph), z = Math.sin(th) * Math.sin(ph), y = Math.cos(th); if (z < -0.35 && th > 0.7) continue; const c = new T.Mesh(new T.SphereGeometry(0.062, 6, 5), hairM); c.position.set(x * 0.205, y * 0.215 + 0.02, z * 0.2 + 0.05); head.add(c); } }
  for (const s of [-1, 1]) { const ear = new T.Mesh(new T.SphereGeometry(0.04, 6, 5), skin); ear.scale.set(0.5, 1, 0.8); ear.position.set(s * 0.175, -0.01, 0.01); head.add(ear); }
  const nose = new T.Mesh(new T.SphereGeometry(0.03, 6, 5), skin); nose.position.set(0, -0.02, -0.19); head.add(nose);
  const mouth = new T.Mesh(new T.BoxGeometry(0.07, 0.012, 0.01), new T.MeshStandardMaterial({ color: 0x3a1a14 })); mouth.position.set(0, -0.09, -0.178); head.add(mouth);
  const eyes = new T.Group(); head.add(eyes);
  for (const s of [-1, 1]) { const e = new T.Mesh(new T.SphereGeometry(0.02, 6, 5), dark); e.position.set(s * 0.065, 0.025, -0.175); eyes.add(e); const b = new T.Mesh(new T.BoxGeometry(0.06, 0.012, 0.012), hairM); b.position.set(s * 0.065, 0.065, -0.178); b.rotation.z = -s * 0.1; head.add(b); }
  function limb(a, b, r, mat) { const d = new T.Vector3().subVectors(b, a), len = d.length(); const m = new T.Mesh(new T.CylinderGeometry(r, r * 0.88, len, 7), mat); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); return m; }
  for (const s of [-1, 1]) {
    const sh = new T.Vector3(driver.position.x + s * 0.3, 0.62 + 0.85, 0.42 - 0.02), el = new T.Vector3(driver.position.x + s * 0.34, 1.02, 0.1), hd = new T.Vector3(driver.position.x + s * 0.18, 1.14, -0.3);
    const a1 = limb(sh, el, 0.07, shirt), a2 = limb(el, hd, 0.06, shirt), hand = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), skin); hand.position.copy(hd);
    car.add(a1, a2, hand);
  }
  const bodyG = new T.Mesh(new T.BoxGeometry(0.01, 0.01, 0.01)); bodyG.visible = false;

  /* =====================================================================
     Traffic (pooled)
     ===================================================================== */
  const bxg = (w, h, d, x, y, z) => { const g = new T.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  const wheelsGeo = (len, wid, r) => { const l = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const g = new T.CylinderGeometry(r, r, 0.26, 10); g.rotateZ(Math.PI / 2); g.translate(sx * (wid / 2 - 0.05), r, sz * len * 0.31); l.push(g); } return mergeGeos(l); };
  /* Addis Ababa street fleet: blue-and-white minibus taxis (Toyota HiAce style), blue-and-white Lada taxis, white Corolla sedans,
     Vitz hatchbacks, old Beetles and white Land Cruiser / Hilux pickups. `top` = parts painted white, `band` = tinted windows. */
  const KINDS = {
    minibus: { len: 4.9, wid: 1.9, r: 0.38, body: () => bxg(1.9, 0.85, 4.9, 0, 0.82, 0), glass: () => mergeGeos([bxg(1.93, 0.55, 4.2, 0, 1.52, 0.1), bxg(1.6, 0.5, 0.06, 0, 1.5, -2.43)]), top: () => mergeGeos([bxg(1.9, 0.14, 4.6, 0, 1.87, 0.05), bxg(1.9, 0.5, 0.6, 0, 1.5, -2.15), bxg(1.9, 0.1, 4.9, 0, 1.28, 0)]) },
    lada:    { len: 4.1, wid: 1.65, r: 0.33, body: () => bxg(1.65, 0.6, 4.1, 0, 0.6, 0), glass: () => bxg(1.5, 0.46, 2.1, 0, 1.12, -0.1), top: () => bxg(1.55, 0.07, 2.2, 0, 1.38, -0.1) },
    sedan:   { len: 4.5, wid: 1.8, r: 0.36, body: () => mergeGeos([bxg(1.8, 0.55, 4.5, 0, 0.62, 0), bxg(1.5, 0.06, 1.9, 0, 1.44, 0.25)]), glass: () => bxg(1.55, 0.5, 2.0, 0, 1.15, 0.25) },
    hatch:   { len: 3.7, wid: 1.7, r: 0.34, body: () => mergeGeos([bxg(1.7, 0.55, 3.7, 0, 0.62, 0), bxg(1.45, 0.06, 1.9, 0, 1.46, 0.5)]), glass: () => bxg(1.5, 0.52, 1.9, 0, 1.17, 0.5) },
    bubble:  { len: 3.9, wid: 1.55, r: 0.32, body: () => { const g = new T.SphereGeometry(1, 12, 9); g.scale(0.78, 0.6, 1.9); g.translate(0, 0.82, 0); return g; }, glass: () => { const g = new T.SphereGeometry(1, 10, 8); g.scale(0.66, 0.38, 0.9); g.translate(0, 1.16, 0.15); return g; } },
    bus:     { len: 11, wid: 2.5, r: 0.5, body: () => bxg(2.5, 1.1, 11, 0, 0.95, 0), glass: () => mergeGeos([bxg(2.54, 0.85, 10.2, 0, 2.05, 0.1), bxg(2.2, 0.85, 0.06, 0, 2.05, -5.52)]), top: () => mergeGeos([bxg(2.5, 0.2, 11, 0, 2.58, 0), bxg(2.54, 0.22, 11, 0, 1.58, 0)]) },
    luxury:  { len: 5.0, wid: 1.85, r: 0.37, body: () => mergeGeos([bxg(1.85, 0.5, 5.0, 0, 0.58, 0), bxg(1.6, 0.06, 2.3, 0, 1.36, 0.25), bxg(1.6, 0.06, 0.5, 0, 0.9, -1.7)]), glass: () => bxg(1.64, 0.44, 2.4, 0, 1.1, 0.25), shine: true },
    suv:     { len: 4.9, wid: 1.95, r: 0.45, body: () => mergeGeos([bxg(1.95, 0.8, 4.9, 0, 0.95, 0), bxg(1.85, 0.08, 3.4, 0, 1.84, 0.4)]), glass: () => bxg(1.9, 0.52, 3.4, 0, 1.5, 0.4), shine: true },
    pickup:  { len: 5.0, wid: 1.9, r: 0.42, body: () => mergeGeos([bxg(1.9, 0.7, 5.0, 0, 0.8, 0), bxg(1.9, 0.5, 1.6, 0, 1.4, -0.9), bxg(1.9, 0.3, 0.06, 0, 1.2, 1.7)]), glass: () => bxg(1.6, 0.4, 1.3, 0, 1.42, -0.85) }
  };
  const kindGeo = {}; for (const k in KINDS) { const K = KINDS[k]; kindGeo[k] = { body: K.body(), glass: K.glass(), wheels: wheelsGeo(K.len, K.wid, K.r), top: K.top ? K.top() : null }; }
  const whiteMat = new T.MeshStandardMaterial({ color: 0xf2f4f4, roughness: 0.5 });
  const tgGlass = new T.MeshStandardMaterial({ color: 0x1a2a33, roughness: 0.15, metalness: 0.4 });
  const tgTire = new T.MeshStandardMaterial({ color: 0x16181b, roughness: 0.9 });
  const tHeadMat = regCol(new T.MeshBasicMaterial({ color: 0xdfe5e8, toneMapped: false }), 0xdfe5e8, 0xfff1c0);
  const tTailMat = regEmi(new T.MeshStandardMaterial({ color: 0x300a0a, emissive: 0xff2410, emissiveIntensity: 0.4 }), 0.4, 2.2);
  const tBeamMat = regGlow(new T.MeshBasicMaterial({ map: glowTexture('rgba(255,236,190,.8)', 'rgba(255,236,190,0)'), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0 }), 0.55, 0);
  const tBeamGeo = new T.PlaneGeometry(5, 9);
  const PAL = { minibus: [0x1b5fb3, 0x1a56a3, 0x2368c0], lada: [0x1b5fb3, 0x1f63b8], sedan: [0xf2f3f3, 0xf2f3f3, 0xf2f3f3, 0xc0c4c8, 0x2b2f33, 0x1d3557], hatch: [0xf2f2f0, 0xc2c6ca, 0xa9322b, 0x2b2f33, 0x3b6a8c], luxury: [0x0d0f12, 0x15171b, 0xf4f4f2, 0xaeb3b8, 0x0f1c33, 0x4a1018, 0x1b1d20], suv: [0x0d0f12, 0x15171b, 0xf4f4f2, 0x2c3034], bubble: [0x9fd0e6, 0xf3f0e4, 0xd9b24a, 0xb53a2d, 0x6e8f5a], pickup: [0xf2f3f3, 0xf2f3f3, 0xc9c4b8, 0x4b5a3c] };
  PAL.bus = [[0xc8281e, 0xf2c230], [0x1b5fb3, 0xf2f4f4]]; /* city buses: red and yellow, blue and white */
  const ORDER = ['minibus', 'sedan', 'luxury', 'lada', 'minibus', 'hatch', 'bus', 'suv', 'bubble', 'sedan', 'luxury', 'lada', 'minibus', 'pickup', 'hatch', 'suv'];
  const SPEED = { luxury: 1.3, suv: 1.2, sedan: 1.05, hatch: 1, bubble: 0.85, lada: 0.9, minibus: 1.05, pickup: 1, bus: 0.8 };
  const pool = [];
  for (let i = 0; i < 40; i++) {
    const kind = ORDER[i % ORDER.length], K = KINDS[kind], G = kindGeo[kind], pal = PAL[kind];
    const grp = new T.Group(); grp.visible = false;
    const pick = kind === 'bus' ? pal[Math.floor(i / ORDER.length) % pal.length] : null;
    const pm = new T.MeshStandardMaterial({ color: pick ? pick[0] : pal[Math.floor(Math.random() * pal.length)], metalness: K.shine ? 0.85 : 0.5, roughness: K.shine ? 0.18 : 0.4, envMap: envTex, flatShading: kind === 'bubble' ? false : true }); envMats.push(pm);
    const b = new T.Mesh(G.body, pm); b.castShadow = shadowsOn(); grp.add(b);
    grp.add(new T.Mesh(G.glass, tgGlass)); grp.add(new T.Mesh(G.wheels, tgTire));
    if (G.top) grp.add(new T.Mesh(G.top, pick ? new T.MeshStandardMaterial({ color: pick[1], roughness: 0.5 }) : whiteMat));
    const hl = mergeGeos([bxg(0.3, 0.1, 0.05, -K.wid * 0.3, 0.75, -K.len / 2 - 0.01), bxg(0.3, 0.1, 0.05, K.wid * 0.3, 0.75, -K.len / 2 - 0.01)]);
    const tl = mergeGeos([bxg(0.3, 0.1, 0.05, -K.wid * 0.3, 0.78, K.len / 2 + 0.01), bxg(0.3, 0.1, 0.05, K.wid * 0.3, 0.78, K.len / 2 + 0.01)]);
    grp.add(new T.Mesh(hl, tHeadMat), new T.Mesh(tl, tTailMat));
    const bm = new T.Mesh(tBeamGeo, tBeamMat); bm.rotation.x = -Math.PI / 2; bm.position.set(0, 0.1, -K.len / 2 - 4); grp.add(bm);
    scene.add(grp);
    pool.push({ grp, kind, len: K.len, wid: K.wid, active: false, mode: 'lane', x: 0, z: 0, v: 0, cruise: 10, dir: -1, laneX: 2, tx: 2, yaw: 0, wait: 0, mult: 1, tvar: 0, horn: 0 });
  }
  let travel = -1, whooshCd = 0;
  const OPEN_CROSS = CROSS_Z.filter((cz) => !ROUND_Z.includes(cz));
  const LANES_F = [3.35, 6.85], LANES_O = [-3.35, -6.85];
  const crossBusy = (cz) => pool.filter((s) => s.active && s.mode === 'cross' && Math.abs(s.cz - cz) < 1).length;
  const ringBow = (zz, lx) => { for (const cz of ROUND_Z) { const dz = zz - cz; if (Math.abs(dz) < 10.4) { const need = Math.sqrt(10.4 * 10.4 - dz * dz) + 0.2; return Math.sign(lx) * Math.max(Math.abs(lx), need); } } return lx; };
  function spawn(s, initial) {
    const pz = P.z, ahead = OPEN_CROSS.filter((cz) => (cz - pz) * travel > 30 && (cz - pz) * travel < 190);
    const cz = ahead.length ? ahead[Math.floor(Math.random() * ahead.length)] : null;
    s.wait = 0;
    if (cz != null && Math.random() < 0.3 && crossBusy(cz) < 3) {
      s.mode = 'cross'; s.cz = cz; s.dirX = Math.random() < 0.5 ? 1 : -1; s.cruise = (10 + Math.random() * 10) * (SPEED[s.kind] || 1); s.v = initial ? s.cruise : s.cruise * 0.9;
      const lane = s.dirX > 0 ? 1.5 : -1.5; s.z = cz + lane; s.x = initial ? (Math.random() * 100 - 50) : -s.dirX * 58; s.yaw = s.dirX > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      s.mode = 'lane'; s.dir = Math.random() < 0.55 ? -1 : 1;
      const lanes = s.dir < 0 ? LANES_F : LANES_O; s.laneX = lanes[Math.floor(Math.random() * 2)]; s.x = s.tx = s.laneX;
      s.cruise = (s.dir < 0 ? 11 + Math.random() * 11 : 13 + Math.random() * 13) * (SPEED[s.kind] || 1); s.v = s.cruise; s.mult = 1; s.tvar = Math.random() * 3; s.horn = 0; s.yaw = s.dir < 0 ? 0 : Math.PI;
      for (let tries = 0; tries < 6; tries++) {
        s.z = pz + travel * (initial ? 25 + Math.random() * 150 : 120 + Math.random() * 50);
        if (s.z < ROAD_END + 12 || s.z > ROAD_TOP - 8) continue;
        if (!pool.some((o) => o !== s && o.active && o.mode === 'lane' && Math.abs(o.x - s.x) < 2.5 && Math.abs(o.z - s.z) < 16) && !ROUND_Z.some((rz) => Math.abs(rz - s.z) < 22)) break;
      }
    }
    s.active = true; s.grp.visible = true;
  }
  /* when you honk, the cars ahead of you in your direction speed up and slide to the next lane so you can pass */
  function honkTraffic() {
    for (const s of pool) {
      if (!s.active || s.mode !== 'lane' || s.dir !== travel) continue;
      const ahead = (s.z - P.z) * travel;
      if (ahead > 0 && ahead < 60 && Math.abs(s.x - P.x) < 4.5) s.horn = 3;
    }
  }
  const trafficHit = { t: 0 };
  function updateTraffic(dt) {
    const want = Math.round(trafficMax() * clamp(A.density, 0.1, 1));
    let activeN = 0; for (const s of pool) if (s.active) activeN++;
    whooshCd -= dt;
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i];
      if (!s.active) { if (i < want && activeN < want && Math.random() < dt * 3.5) { spawn(s, false); activeN++; } continue; }
      const rel = (s.z - P.z) * travel;
      if (s.mode === 'lane') {
        const fz = s.dir; s.tvar -= dt; if (s.tvar <= 0) { s.tvar = 2 + Math.random() * 4; s.mult = 0.7 + Math.random() * 0.6; } s.horn -= dt;
        let target = s.cruise * s.mult * (s.horn > 0 ? 1.7 : 1), tx = ringBow(s.z, s.laneX);
        const dz = (P.z - s.z) * fz, dxp = Math.abs(P.x - s.x);
        if (s.horn > 0 && dz < 0) { const lo = s.dir < 0 ? 2.4 : -8, hi = s.dir < 0 ? 8 : -2.4; tx = clamp(s.x + (s.x >= P.x ? 2.6 : -2.6), lo, hi); }
        if (dz > 0 && dz < 24 && dxp < 2.8) {
          const lo = s.dir < 0 ? 2.4 : -8, hi = s.dir < 0 ? 8 : -2.4;
          tx = clamp(s.x + (s.x >= P.x ? 2.6 : -2.6), lo, hi);
          if (dz < 11) target = Math.min(target, Math.max(0, Math.abs(P.v) * 0.8));
        }
        for (const o of pool) {
          if (o === s || !o.active || o.mode !== 'lane' || o.dir !== s.dir || Math.abs(o.x - s.x) > 2.2) continue;
          const d = (o.z - s.z) * fz, gap = d - (s.len + o.len) / 2 + 4.4; if (d > 0 && gap < 14) target = Math.min(target, o.v * 0.9, Math.max(0, gap) * 0.9);
        }
        s.v += clamp(target - s.v, -22 * dt, (s.horn > 0 ? 11 : 6) * dt);
        s.tx = tx; s.x = damp(s.x, s.tx, 2.6, dt); s.z += fz * s.v * dt;
        s.yaw = damp(s.yaw, (s.dir < 0 ? 0 : Math.PI) + (s.tx - s.x) * (s.dir < 0 ? 0.12 : -0.12), 5, dt);
        if (rel > 215 || rel < -75 || s.z < ROAD_END + 6 || s.z > ROAD_TOP - 6) { s.active = false; s.grp.visible = false; continue; }
        if (s.dir !== travel && Math.abs(s.z - P.z) < 2.5 && Math.abs(s.x - P.x) < 7 && Math.abs(P.v) > 6 && whooshCd <= 0) { Sfx.whoosh(); whooshCd = 0.8; }
      } else {
        let target = s.cruise;
        const aheadX = (P.x - s.x) * s.dirX, near = Math.abs(P.z - s.z) < 5.5;
        if (aheadX > 0 && aheadX < 14 && near) target = 0;
        for (const o of pool) { if (o === s || !o.active || o.mode !== 'cross' || o.cz !== s.cz || o.dirX !== s.dirX) continue; const d = (o.x - s.x) * s.dirX; if (d > 0 && d < 9) target = Math.min(target, o.v * 0.9); }
        s.v += clamp(target - s.v, -24 * dt, 6 * dt); s.x += s.dirX * s.v * dt;
        if (Math.abs(s.x) > 62 || rel > 260 || rel < -140) { s.active = false; s.grp.visible = false; continue; }
      }
      const ax = s.mode === 'lane' ? 0 : 1, hl = s.kind === 'bus' ? 4 : 1.05, ex = ax ? hl : 0, ez = ax ? 0 : hl;
      const pfx = -Math.sin(P.th) * 1.05, pfz = -Math.cos(P.th) * 1.05;
      let hit = false;
      for (const ps of [-1, 1]) for (const ts of (s.kind === 'bus' ? [-1, 0, 1] : [-1, 1])) {
        const dx = (P.x + pfx * ps) - (s.x + ex * ts), dz2 = (P.z + pfz * ps) - (s.z + ez * ts), d = Math.hypot(dx, dz2), min = s.kind === 'bus' ? 2.3 : 1.75;
        if (d < min && d > 0.001) { const pen = min - d, nx = dx / d, nz = dz2 / d; P.x += nx * pen * 0.6; P.z += nz * pen * 0.6; if (s.mode === 'lane') s.z -= nz * pen * 0.3; s.x -= nx * pen * 0.3; hit = true; }
      }
      if (hit && trafficHit.t <= 0) { P.v *= 0.55; trafficHit.t = 0.5; P.shake = 0.5; Sfx.bump(); }
      s.grp.position.set(s.x, 0.04, s.z); s.grp.rotation.y = s.yaw;
    }
    trafficHit.t -= dt;
  }

  /* =====================================================================
     Player physics (arcade), camera, day/night, UI, main loop
     ===================================================================== */
  const P = { x: 3.35, z: 14, v: 0, th: 0, steer: 0, pitch: 0, spin: 0, shake: 0, braking: false, ut: null };
  const MAXF = 26, MAXR = 14, NOIN = { up: false, down: false, left: false, right: false };
  let began = false, introBlend = 0, uTurnReq = false, hornReq = false;
  const wrapPi = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  function halfWAt(z) {
    let w = 8.3 + clamp((-946 - z) / 8, 0, 1) * 8.2;
    for (const cz of ROUND_Z) { const dz = Math.abs(z - cz); if (dz < RB_R) w = Math.max(w, Math.sqrt(RB_R * RB_R - dz * dz) - 1.3); }
    return w;
  }
  function updatePlayer(dt) {
    const I = began ? input : NOIN, up = I.up, dn = I.down, prevV = P.v;
    if (up) P.v += (P.v < 0 ? 34 : 13) * dt;
    else if (dn) P.v -= (P.v > 0 ? 30 : 11) * dt;
    else P.v -= Math.sign(P.v) * Math.min(Math.abs(P.v), 5.5 * dt);
    if (up && P.v > MAXF * 0.85) P.v -= (P.v - MAXF * 0.85) * 1.5 * dt;
    P.v = clamp(P.v, -MAXR, MAXF); P.braking = dn && P.v > 0.5;
    const sIn = (I.left ? 1 : 0) - (I.right ? 1 : 0), sp = Math.abs(P.v), grip = clamp(sp / 3.2, 0.3, 1);
    P.steer = damp(P.steer, sIn, sIn !== 0 ? 9 : 12, dt);
    if (uTurnReq && began && !P.ut) { P.ut = { from: P.th, dir: P.steer < -0.2 ? -1 : 1, t: 0 }; uTurnReq = false; Sfx.uturn(); }
    uTurnReq = false;
    if (P.ut) {
      P.ut.t += dt / 1.15; const k = clamp(P.ut.t, 0, 1), e = k * k * (3 - 2 * k);
      P.th = P.ut.from + P.ut.dir * Math.PI * e; P.v = damp(P.v, 7.5, 3, dt);
      if (k >= 1) { P.th = wrapPi(P.th); P.ut = null; }
    } else {
      P.th += P.steer * (2.3 / (1 + sp / 22)) * grip * (P.v < 0 ? -1 : 1) * dt;
      if (sIn === 0 && sp > 1.5 && P.z > -940) P.th = damp(P.th, Math.round(P.th / Math.PI) * Math.PI, 1.2 * grip, dt);   // steering assist: settle along the road, either way
      if (Math.abs(P.th) > Math.PI * 4) P.th = wrapPi(P.th);
    }
    P.x += -Math.sin(P.th) * P.v * dt; P.z += -Math.cos(P.th) * P.v * dt;
    // median: solid except at junctions
    if (!nearJunction(P.z, 6) && Math.abs(P.x) < 2.5) { const sgn = P.x >= 0 ? 1 : -1; P.x = sgn * 2.5; P.v *= 1 - 1.4 * dt; if (Math.abs(P.v) > 8 && Sfx.curbOk()) Sfx.bump(0.5); }
    // roundabout islands
    for (const cz of ROUND_Z) { const dx = P.x, dz = P.z - cz, d = Math.hypot(dx, dz); if (d < ISLAND_R + 1.0 && d > 0.001) { const nx = dx / d, nz = dz / d, push = ISLAND_R + 1.0; P.x = nx * push; P.z = cz + nz * push; P.v *= 1 - 2.2 * dt; if (Math.abs(P.v) > 8 && Sfx.curbOk()) Sfx.bump(0.6); } }
    const halfW = halfWAt(P.z);
    if (Math.abs(P.x) > halfW) { P.x = Math.sign(P.x) * halfW; if (!P.ut) P.th = damp(P.th, Math.round(P.th / Math.PI) * Math.PI, 6, dt); P.v *= 1 - 0.8 * dt; }
    if (P.z > 36) { P.z = 36; P.v *= 0.5; }
    if (P.z < -946) { const dx = P.x - PLAZA.x, dz = P.z - PLAZA.z, d = Math.hypot(dx, dz); if (d > 15.2) { P.x = PLAZA.x + dx / d * 15.2; P.z = PLAZA.z + dz / d * 15.2; if (!P.ut) P.v *= 1 - 0.8 * dt; } }
    P.pitch = damp(P.pitch, clamp((P.v - prevV) / Math.max(dt, 0.001) / 40, -0.5, 0.5) * 0.05, 6, dt);
    P.spin += P.v * dt / 0.38; P.shake = Math.max(0, P.shake - dt * 2);
    const vz = -Math.cos(P.th) * P.v; if (vz > 2) travel = 1; else if (vz < -2) travel = -1;
    car.position.set(P.x, 0.12, P.z);
    car.rotation.set(P.pitch, P.th, -P.steer * clamp(sp / MAXF, 0, 1) * 0.05, 'YXZ');
    for (const w of wheels) { w.spin.rotation.x = P.spin; if (w.front) w.pivot.rotation.y = P.steer * 0.45; }
    sw.rotation.z = -P.steer * 1.6;
    tailMat.emissiveIntensity = lerp(0.5, 1.4, nCur) + (P.braking ? 2.2 : 0) + (P.v < -0.5 ? 0.6 : 0);
    return { thr: up ? 1 : 0, vz };
  }
  /* driver idle animation */
  const anim = { blink: 2.5, blinkT: 0, look: 5, lookT: 0, lookTo: 0 };
  function updateDriver(dt, t) {
    anim.blink -= dt; if (anim.blink <= 0) { anim.blinkT = 0.13; anim.blink = 2.2 + Math.random() * 3.5; }
    anim.blinkT = Math.max(0, anim.blinkT - dt); eyes.scale.y = anim.blinkT > 0 ? 0.08 : 1;
    anim.look -= dt; if (anim.look <= 0) { anim.lookTo = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.35); anim.lookT = 1.2 + Math.random(); anim.look = 4 + Math.random() * 5; }
    anim.lookT -= dt; if (anim.lookT <= 0) anim.lookTo = 0;
    const sp = clamp(Math.abs(P.v) / MAXF, 0, 1);
    head.rotation.y = damp(head.rotation.y, anim.lookTo + P.steer * 0.35, 4, dt);
    head.rotation.x = Math.sin(t * 1.7) * 0.012 + P.pitch * 2;
    torso.rotation.z = -P.steer * 0.07 + Math.sin(t * 1.3) * 0.012;
    torso.rotation.x = -sp * 0.07 + (P.braking ? 0.05 : 0);
    torso.position.y = Math.sin(t * 24) * 0.004 * sp;
  }

  /* day / night */
  let nCur = 0, lastN = -1, timeMode = 0, hourOverride = null, nFirst = true;
  const PRESETS = [{ n: 'Real time', h: null }, { n: 'Dawn', h: 6.3 }, { n: 'Noon', h: 12.5 }, { n: 'Dusk', h: 18.1 }, { n: 'Night', h: 22.5 }];
  function cycleTime() { timeMode = (timeMode + 1) % PRESETS.length; hourOverride = PRESETS[timeMode].h; }
  const cA = new T.Color(), warm = new T.Color(0xff8f5a), sunWarm = new T.Color(0xff9a50), nightHemiS = new T.Color(0x7088c8), nightHemiG = new T.Color(0x2c3550);
  function updateDayNight(dt, init) {
    const h = hourOverride != null ? hourOverride : addisHour();
    const elev = Math.sin((h - 6) / 12 * Math.PI), d = smooth(-0.1, 0.22, elev), nT = 1 - d;
    nCur = (nFirst || init) ? nT : damp(nCur, nT, 1.4, dt); nFirst = false;
    const n = nCur, dd = 1 - n, w = Math.pow(clamp(1 - Math.abs(elev) / 0.3, 0, 1), 1.5);
    cA.copy(A.night).lerp(A.sky, dd).lerp(warm, w * 0.4 * (0.3 + 0.7 * dd));
    scene.background.copy(cA); scene.fog.color.copy(cA); scene.fog.near = lerp(85, 55, n); scene.fog.far = lerp(260, 210, n);
    hemi.color.copy(nightHemiS).lerp(A.hemiS, dd); hemi.groundColor.copy(nightHemiG).lerp(A.hemiG, dd); hemi.intensity = lerp(1.25, 1.1, dd);
    const a = clamp((h - 6) / 12, -0.1, 1.1) * Math.PI;
    V3.set(Math.cos(a), Math.max(0.3, Math.sin(a)), 0.35).normalize().multiplyScalar(110);
    sun.position.set(P.x + V3.x, V3.y, P.z + V3.z); sun.target.position.set(P.x, 0, P.z);
    sun.color.copy(A.sun).lerp(sunWarm, w * 0.7); sun.intensity = A.sunI * dd; sun.visible = sun.intensity > 0.02;
    moon.position.set(P.x - 30, 60, P.z + 25); moon.intensity = 1.2 * n;
    renderer.toneMappingExposure = lerp(1.0, 1.2, n);
    groundMat.color.copy(A.ground);
    const ei = lerp(1, 0.3, n); for (const m of envMats) m.envMapIntensity = ei;
    spot.intensity = n * 260;
    if (Math.abs(n - lastN) > 0.003) { applyNight(n); lastN = n; }
    return { h, n, label: PRESETS[timeMode].n };
  }

  /* camera: the road sits on the left of the screen so the pages on the right stay in view */
  const camLook = new T.Vector3(), camPos = new T.Vector3(), wantLook = new T.Vector3(), PITCH = 55 * Math.PI / 180;
  let camSnap = true;
  /* camera modes: bird (angled, the default), tpp (behind the car), fpp (driver's eyes), top (straight down) */
  const CAM_MODES = ['bird', 'tpp', 'fpp', 'top'], CAM_LABEL = { bird: 'Bird\u2019s-eye', tpp: 'Third-person', fpp: 'First-person', top: 'Top-down' };
  let camMode = 'bird', camLookV = new T.Vector3();
  function updateCamera(dt, vz) {
    const aspect = camera.aspect, narrow = aspect < 0.8;
    const fovWant = camMode === 'fpp' ? (narrow ? 78 : 68) : camMode === 'tpp' ? (narrow ? 58 : 52) : (narrow ? 50 : 42);
    if (Math.abs(camera.fov - fovWant) > 0.05) { camera.fov = damp(camera.fov, fovWant, 8, dt); camera.updateProjectionMatrix(); }
    car.visible = camMode !== 'fpp';
    if (camMode === 'tpp' || camMode === 'fpp') {
      const fx = -Math.sin(P.th), fz = -Math.cos(P.th), sp = clamp(Math.abs(P.v) / MAXF, 0, 1);
      let px, py, pz, lx, ly, lz;
      if (camMode === 'tpp') { const back = 9 + sp * 3; px = P.x - fx * back; py = 3.8 + sp * 0.8; pz = P.z - fz * back; lx = P.x + fx * 9; ly = 1.2; lz = P.z + fz * 9; }
      else { px = P.x + fx * 0.15 + Math.cos(P.th) * -0.4; py = 1.3; pz = P.z + fz * 0.15 - Math.sin(P.th) * -0.4; lx = P.x + fx * 22; ly = 1.1 - P.pitch * 6; lz = P.z + fz * 22; }
      if (camSnap) { camera.position.set(px, py, pz); camLookV.set(lx, ly, lz); camSnap = false; }
      else { const kp = camMode === 'fpp' ? 30 : 6, kl = camMode === 'fpp' ? 14 : 6; camera.position.x = damp(camera.position.x, px, kp, dt); camera.position.y = damp(camera.position.y, py, kp, dt); camera.position.z = damp(camera.position.z, pz, kp, dt); camLookV.x = damp(camLookV.x, lx, kl, dt); camLookV.y = damp(camLookV.y, ly, kl, dt); camLookV.z = damp(camLookV.z, lz, kl, dt); }
      if (P.shake > 0) { camera.position.x += (Math.random() - 0.5) * P.shake * 0.3; camera.position.y += (Math.random() - 0.5) * P.shake * 0.25; }
      camera.lookAt(camLookV); camLook.set(P.x, 1, P.z);
      return;
    }
    const pitch = camMode === 'top' ? 87 * Math.PI / 180 : PITCH;
    const base = camMode === 'top' ? 42 : 30 + clamp(1 - aspect, 0, 0.6) * 22, d = base * (1 + clamp(Math.abs(P.v) / MAXF, 0, 1) * 0.2);
    const off = clamp((aspect - 0.95) * 10, 0, 11);
    wantLook.set(P.x * 0.5 + off, 0.6, P.z - 5 + clamp(vz * 0.2, -6, 6));
    if (camSnap) camLook.copy(wantLook); else { camLook.x = damp(camLook.x, wantLook.x, 4, dt); camLook.y = wantLook.y; camLook.z = damp(camLook.z, wantLook.z, 5, dt); }
    camPos.set(camLook.x, camLook.y + Math.sin(pitch) * d, camLook.z + Math.cos(pitch) * d);
    if (camSnap) { camera.position.copy(camPos); camSnap = false; }
    else { camera.position.x = damp(camera.position.x, camPos.x, 3.0, dt); camera.position.y = damp(camera.position.y, camPos.y, 2.2, dt); camera.position.z = damp(camera.position.z, camPos.z, 3.0, dt); }
    if (P.shake > 0) { camera.position.x += (Math.random() - 0.5) * P.shake * 0.5; camera.position.y += (Math.random() - 0.5) * P.shake * 0.4; }
    camera.lookAt(camLook);
  }
  function introCamera(t) {
    const a = 0.7 + t * 0.16, r = 15.5;
    camera.position.set(P.x + Math.sin(a) * r, 5.6 + Math.sin(t * 0.4) * 0.6, P.z + Math.cos(a) * r); camera.lookAt(P.x, 1.2, P.z);
  }

  /* HUD */
  const ui = { zone: -1, cta: false, night: null, time: '' };
  const stepsEl = $('#zoneSteps'); stepsEl.innerHTML = ZONES.map(() => '<li></li>').join('');
  const stepEls = Array.from(stepsEl.children), zoneNameEl = $('#zoneName'), toast = $('#zoneToast');
  function updateUI(dn) {
    const zi = clamp(Math.floor(-P.z / ZONE_LEN), 0, 4);
    if (zi !== ui.zone) {
      const first = ui.zone < 0; ui.zone = zi; zoneNameEl.textContent = ZONES[zi].name;
      stepEls.forEach((e, i) => { e.className = i < zi ? 'done' : i === zi ? 'on' : ''; });
      if (!first && began) { $('#toastK').textContent = pad2(zi + 1) + ' / 05'; $('#toastN').textContent = ZONES[zi].name; toast.classList.remove('show'); void toast.offsetWidth; toast.classList.add('show'); Sfx.chime(zi); }
    }
    const cta = zi === 4 && P.z < -905 && began; if (cta !== ui.cta) { ui.cta = cta; $('#cta').classList.toggle('on', cta); }
    const night = dn.n > 0.5; if (night !== ui.night) { ui.night = night; $('#app').classList.toggle('is-night', night); }
    const txt = hourOverride != null ? 'Preview · ' + dn.label : 'Addis ' + fmtHour(dn.h) + (night ? ' · Night' : ' · Day');
    if (txt !== ui.time) { ui.time = txt; $('#timeText').textContent = txt; }
    if (input.any && began && !ui.hint) { ui.hint = true; $('#hint').classList.add('gone'); try { localStorage.setItem('aser-road-seen', '1'); } catch (e) {} }
  }
  try { if (localStorage.getItem('aser-road-seen')) { $('#hint').hidden = true; ui.hint = true; } } catch (e) {}

  /* sizing + adaptive quality */
  function setDpr() { renderer.setPixelRatio(Math.min(devicePixelRatio || 1, level >= 2 ? 2 : level === 1 ? 1.5 : 1)); }
  function applyView() { const w = innerWidth, h = innerHeight; if (!began) { camera.setViewOffset(w, h, -w * 0.2 * (1 - introBlend), 0, w, h); } else if (introBlend < 1) { camera.setViewOffset(w, h, -w * 0.2 * (1 - introBlend), 0, w, h); } else camera.clearViewOffset(); }
  function resize() { const w = innerWidth, h = innerHeight; setDpr(); renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.8 ? 50 : 42; camera.updateProjectionMatrix(); applyView(); }
  addEventListener('resize', resize); resize();
  let frames = 0, acc = 0, lastAdapt = 0;
  function adapt(dt) {
    acc += dt; frames++;
    if (frames >= 90) {
      const avg = acc / frames; frames = 0; acc = 0;
      if (avg > 0.026 && level > 0 && performance.now() - lastAdapt > 2500) {
        level--; lastAdapt = performance.now(); setDpr();
        if (level === 0) { renderer.shadowMap.enabled = false; sun.castShadow = false; scene.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined) o.material.needsUpdate = true; }); }
        else { sun.shadow.mapSize.set(shadowSize(), shadowSize()); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
      }
    }
  }

  /* main loop */
  let running = false, raf = 0, last = 0, tAll = 0, firstFrame = true;
  function zoneCull() {
    for (const z of ZONES) { const dist = (P.z <= z.z0 && P.z >= z.z1) ? 0 : Math.min(Math.abs(P.z - z.z0), Math.abs(P.z - z.z1)); z.group.visible = dist < 280; }
  }
  function frame(now) {
    if (!running) return; raf = requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0.001, 0.05); last = now; tAll += dt;
    if (hornReq && began) { Sfx.horn(); honkTraffic(); } hornReq = false;
    const pr = updatePlayer(dt); updateTraffic(dt);
    blendZones(P.z); const dn = updateDayNight(dt, firstFrame);
    for (const f of reg.anim) f(tAll);
    updateDriver(dt, tAll);
    if (!began) introCamera(tAll);
    else { if (introBlend < 1) { introBlend = Math.min(1, introBlend + dt / 1.6); applyView(); } updateCamera(dt, pr.vz); }
    ground.position.set(P.x, 0, P.z); gtex.offset.set(P.x / 24, -P.z / 24);
    zoneCull(); updateUI(dn);
    Sfx.update(dt, { sp: clamp(Math.abs(P.v) / MAXF, 0, 1), thr: pr.thr, night: dn.n, zone: ui.zone, began });
    renderer.render(scene, camera); adapt(dt);
    if (firstFrame) { firstFrame = false; setTimeout(() => { if (window.introReady) window.introReady(); }, 400); }
  }
  for (const s of pool.slice(0, Math.round(trafficMax() * 0.4))) spawn(s, true);
  updateDayNight(0, true); blendZones(P.z); zoneCull();
  return {
    resume() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); },
    pause() { running = false; cancelAnimationFrame(raf); },
    cycleTime, uturn() { uTurnReq = true; }, horn() { hornReq = true; },
    cycleCam() { camMode = CAM_MODES[(CAM_MODES.indexOf(camMode) + 1) % CAM_MODES.length]; camSnap = true; camera.fov = camMode === 'fpp' ? 68 : camera.fov; return CAM_LABEL[camMode]; },
    get camLabel() { return CAM_LABEL[camMode]; },
    restart() {
      P.x = 3.35; P.z = 14; P.v = 0; P.th = 0; P.steer = 0; P.pitch = 0; P.ut = null; P.shake = 0; travel = -1; uTurnReq = false;
      for (const t of pool) { t.active = false; t.grp.visible = false; }
      for (const t of pool.slice(0, Math.round(trafficMax() * 0.4))) spawn(t, true);
      camSnap = true; camLook.set(P.x, 1, P.z); Sfx.chime(0);
    },
    begin() { if (began) return; began = true; camSnap = false; camLook.set(P.x, 1, P.z); introBlend = 0; Sfx.init(); Sfx.ignition(); },
    get began() { return began; }
  };
}
