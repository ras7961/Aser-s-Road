/* Aser's Road: canvas textures for the billboards and signs */
'use strict';

/* =====================================================================
   Texture helpers (canvas based, drawn once per panel)
   ===================================================================== */
function canvasTex(w, h, draw, opt) {
  const o = Object.assign({ aniso: 4, srgb: true }, opt);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (o.srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = o.aniso;
  return t;
}
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function wrapText(g, text, maxW) {
  const words = String(text).split(' '); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
function panelTexture(o) {
  const w = o.w || 768, h = o.h || 540, s = w / 768;
  return canvasTex(w, h, (g) => {
    g.scale(s, s); const W = 768, H = h / s, acc = o.accent || '#ffc857', P = 44;
    g.fillStyle = o.bg || 'rgba(7,11,13,.97)'; rr(g, 0, 0, W, H, 30); g.fill();
    g.save(); rr(g, 0, 0, W, H, 30); g.clip(); g.fillStyle = acc; g.fillRect(0, 0, W, 14); g.restore();
    g.strokeStyle = acc; g.globalAlpha = .7; g.lineWidth = 3; rr(g, 2, 2, W - 4, H - 4, 28); g.stroke(); g.globalAlpha = 1;
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    let y = P + 34; g.font = '500 28px "JetBrains Mono",ui-monospace,monospace'; g.fillStyle = acc; g.fillText((o.kicker || '').toUpperCase(), P, y);
    if (o.badge) { g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.62)'; g.font = '500 22px "JetBrains Mono",ui-monospace,monospace'; g.fillText(o.badge.toUpperCase(), W - P, y); g.textAlign = 'left'; }
    let ts = o.titleSize || 92, lines;
    for (;;) { g.font = `800 ${ts}px "Bricolage Grotesque",system-ui,sans-serif`; lines = wrapText(g, o.title, W - P * 2); if (lines.length <= 2 || ts <= 54) break; ts -= 6; }
    y += ts * 0.95 + 14; g.fillStyle = o.fg || '#ffffff';
    for (const ln of lines.slice(0, 2)) { g.fillText(ln, P, y); y += ts * 1.02; }
    y -= ts * 0.02;
    if (o.sub) { y += 4; g.font = `600 ${o.subSize || 42}px "Hanken Grotesk",system-ui,sans-serif`; g.fillStyle = acc; g.fillText(o.sub, P, y); y += 14; }
    if (o.body) {
      const bs = o.bodySize || 42; g.font = `500 ${bs}px "Hanken Grotesk",system-ui,sans-serif`; g.fillStyle = o.dim || 'rgba(255,255,255,.92)'; y += 10;
      for (const ln of wrapText(g, o.body, W - P * 2).slice(0, o.maxLines || 3)) { y += bs * 1.32; g.fillText(ln, P, y); }
    }
    if (o.tags) {
      g.font = '600 28px "JetBrains Mono",ui-monospace,monospace'; const rows = [[]]; let rw = 0;
      for (const t of o.tags) { const tw = g.measureText(t).width + 34; if (rw + tw > W - P * 2 && rows[rows.length - 1].length) { rows.push([]); rw = 0; } rows[rows.length - 1].push({ t, tw }); rw += tw + 12; }
      rows.forEach((row, ri) => { let x = P; const ty = H - P - 2 - (rows.length - 1 - ri) * 58; for (const k of row) { g.fillStyle = 'rgba(255,255,255,.14)'; rr(g, x, ty - 36, k.tw, 48, 24); g.fill(); g.fillStyle = '#fff'; g.fillText(k.t, x + 17, ty); x += k.tw + 12; } });
    }
  });
}
function gateTexture(num, name, kicker, accent) {
  return canvasTex(1024, 256, (g) => {
    g.fillStyle = 'rgba(7,11,13,.97)'; rr(g, 0, 0, 1024, 256, 36); g.fill();
    g.save(); rr(g, 0, 0, 1024, 256, 36); g.clip(); g.fillStyle = accent; g.fillRect(0, 0, 1024, 16); g.restore();
    g.textBaseline = 'alphabetic'; g.fillStyle = accent; g.font = '600 38px "JetBrains Mono",ui-monospace,monospace'; g.fillText(kicker.toUpperCase(), 48, 80);
    g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText(num + ' / 05', 976, 80); g.textAlign = 'left';
    let s = 150; g.font = `800 ${s}px "Bricolage Grotesque",system-ui,sans-serif`;
    while (g.measureText(name).width > 930 && s > 60) { s -= 6; g.font = `800 ${s}px "Bricolage Grotesque",system-ui,sans-serif`; }
    g.fillStyle = '#fff'; g.fillText(name, 44, 226);
  });
}
function heroPanelTexture() {
  return canvasTex(1536, 960, (g) => {
    g.fillStyle = 'rgba(7,11,13,.97)'; rr(g, 0, 0, 1536, 960, 56); g.fill();
    g.save(); rr(g, 0, 0, 1536, 960, 56); g.clip(); g.fillStyle = '#ffc857'; g.fillRect(0, 0, 1536, 24); g.restore();
    g.textBaseline = 'alphabetic'; g.fillStyle = '#ffc857'; g.font = '600 44px "JetBrains Mono",ui-monospace,monospace'; g.fillText('PORTFOLIO  ·  ADDIS ABABA', 80, 118);
    g.fillStyle = '#fff'; g.font = '600 104px "Bricolage Grotesque",system-ui,sans-serif'; g.fillText(CONTENT.hello, 76, 270);
    let s = 300; g.font = `800 ${s}px "Bricolage Grotesque",system-ui,sans-serif`;
    while (g.measureText(CONTENT.name).width > 1380 && s > 120) { s -= 8; g.font = `800 ${s}px "Bricolage Grotesque",system-ui,sans-serif`; }
    g.fillText(CONTENT.name, 70, 270 + s * 0.82);
    g.font = '700 44px "Hanken Grotesk",system-ui,sans-serif'; g.fillStyle = '#fff'; let y = 270 + s * 0.82 + 84;
    for (const ln of wrapText(g, CONTENT.tagline, 1380).slice(0, 2)) { g.fillText(ln, 80, y); y += 70; }
    g.fillStyle = '#ffc857'; g.font = '600 48px "Hanken Grotesk",system-ui,sans-serif'; g.fillText('Keep driving  →', 80, 900);
  }, { aniso: 8 });
}
function bioPanelTexture() {
  return canvasTex(1536, 960, (g) => {
    g.fillStyle = 'rgba(7,11,13,.97)'; rr(g, 0, 0, 1536, 960, 56); g.fill();
    g.save(); rr(g, 0, 0, 1536, 960, 56); g.clip(); g.fillStyle = '#ffc857'; g.fillRect(0, 0, 1536, 24); g.restore();
    g.textBaseline = 'alphabetic'; g.fillStyle = '#ffc857'; g.font = '600 44px "JetBrains Mono",ui-monospace,monospace'; g.fillText('A BIT ABOUT ME', 80, 118);
    g.fillStyle = '#fff'; g.font = '600 68px "Bricolage Grotesque",system-ui,sans-serif'; let y = 270;
    for (const ln of wrapText(g, CONTENT.intro, 1380).slice(0, 6)) { g.fillText(ln, 80, y); y += 92; }
    g.fillStyle = '#ffc857'; g.font = '600 48px "Hanken Grotesk",system-ui,sans-serif'; g.fillText('Keep driving  →', 80, 900);
  }, { aniso: 8 });
}
function signTexture(am, en, dist) {
  return canvasTex(512, 256, (g) => {
    g.fillStyle = '#14519b'; rr(g, 0, 0, 512, 256, 18); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 8; rr(g, 12, 12, 488, 232, 12); g.stroke();
    g.fillStyle = '#fff'; g.textBaseline = 'alphabetic'; g.font = '600 66px "Noto Sans Ethiopic","Nyala",system-ui,sans-serif'; g.fillText(am, 40, 108);
    g.font = '800 64px "Hanken Grotesk",system-ui,sans-serif'; g.fillText(en, 40, 188);
    g.textAlign = 'right'; g.font = '600 44px "JetBrains Mono",monospace'; g.fillText(dist, 472, 232 - 14); g.textAlign = 'left';
    g.fillStyle = '#ffc857'; g.beginPath(); g.moveTo(440, 56); g.lineTo(480, 56); g.lineTo(460, 22); g.closePath(); g.fill();
  });
}
function glowTexture(inner, outer) {
  return canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }, { aniso: 1 });
}
const crossBand = (z, pad) => { const m = (((-z - 50) % 100) + 100) % 100; return m < (pad || 7) || m > 100 - (pad || 7); };

/* geometry helpers: extruded side profile (front at -u, rear at +u) and a plain merge */
function extrudeProfile(pts, width, bevel) {
  const b = bevel == null ? 0.05 : bevel;
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, width - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -(width - b * 2) / 2); g.rotateY(-Math.PI / 2);
  return g;
}
function mergeGeos(list) {
  const arr = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of arr) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of arr) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return m;
}
