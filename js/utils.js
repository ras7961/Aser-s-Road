/* Aser's Road: small helpers (math, Addis time, clipboard) */
'use strict';

/* ---------- small utilities ---------- */
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pad2 = (n) => String(n).padStart(2, '0');

/* ---------- Addis Ababa time (GMT+3, no DST) ---------- */
function addisHour() { return ((Date.now() / 3600000) + 3) % 24; }
function fmtHour(h) { const m = Math.floor((h % 1) * 60); return pad2(Math.floor(h) % 24) + ':' + pad2(m); }

/* ---------- Copy helper (clipboard may be refused inside the viewer) ---------- */
async function copyText(text, el, btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {}
  if (!ok && el) {
    try { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {}
  }
  if (btn) { const old = btn.textContent; btn.textContent = ok ? 'Copied' : 'Press Ctrl+C'; setTimeout(() => { btn.textContent = old; }, 1600); }
}
