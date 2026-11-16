/* Aser's Road: input, intro screen, mode switching and start-up */
'use strict';

/* ---------- Input (keyboard + touch) ---------- */
const input = { up: false, down: false, left: false, right: false, any: false };
const KEYMAP = { w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' };
let siteMode = false;
function setSoundUI() { const b = $('#soundBtn'); if (b) { b.classList.toggle('off', !Sfx.on); $('#soundText').textContent = Sfx.on ? 'Sound on' : 'Sound off'; } }
function onKey(e, v) {
  if (siteMode || !road) return;
  const key = e.key.toLowerCase(), k = KEYMAP[key];
  if (!road.began) { if (v && (key === 'enter' || key === ' ')) { e.preventDefault(); beginDrive(); } return; }
  if (k) { input[k] = v; if (v) input.any = true; e.preventDefault(); return; }
  if (!v) return;
  if (key === ' ' || key === 'q') { e.preventDefault(); road.uturn(); }
  else if (key === 'h') road.horn();
  else if (key === 'r') road.restart();
  else if (key === 'm') { Sfx.toggle(); setSoundUI(); }
  else if (key === 't') road.cycleTime();
  else if (key === 'c') $('#camText').textContent = road.cycleCam();
}
addEventListener('keydown', (e) => { if (e.ctrlKey || e.metaKey || e.altKey) return; onKey(e, true); });
addEventListener('keyup', (e) => onKey(e, false));
addEventListener('blur', () => { input.up = input.down = input.left = input.right = false; });
document.querySelectorAll('#touch button').forEach((b) => {
  const k = b.dataset.k;
  const on = (e) => { e.preventDefault(); if (k === 'uturn') { if (road) road.uturn(); return; } if (k === 'horn') { if (road) road.horn(); return; } input[k] = true; input.any = true; b.classList.add('down'); };
  const off = (e) => { e.preventDefault(); if (k === 'uturn' || k === 'horn') return; input[k] = false; b.classList.remove('down'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
});

/* ---------- Mode switching + entry screen ---------- */
let road = null, roadFailed = false;
function greeting(h) { return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night'; }
function tickClock() { const h = addisHour(), el = $('#inClock'); if (el) el.textContent = greeting(h) + ' from Addis Ababa  ·  ' + fmtHour(h); }
setInterval(tickClock, 15000); tickClock();
window.introReady = () => { const b = $('#startBtn'); if (!b) return; b.disabled = false; $('.in-start-t').textContent = 'Start the engine'; $('#intro').classList.add('ready'); };
function beginDrive() {
  if (!road || road.began) return;
  road.begin(); $('#intro').classList.add('gone'); $('#app').classList.remove('intro-on'); setSoundUI();
}
function setSiteMode(on) {
  siteMode = on;
  document.body.classList.toggle('site-mode', on);
  try { if (on) history.replaceState(null, '', '#site'); else history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  input.up = input.down = input.left = input.right = false;
  if (on) { if (road) road.pause(); Sfx.suspend(); window.scrollTo(0, 0); }
  else startRoad();
}
function startRoad() {
  if (roadFailed) { setSiteMode(true); return; }
  if (!road) {
    try { road = createRoad(); }
    catch (err) { console.error(err); roadFailed = true; siteMode = true; document.body.classList.add('site-mode'); return; }
  }
  road.resume(); Sfx.resume();
  if (road.began) { $('#intro').classList.add('gone'); $('#app').classList.remove('intro-on'); } else { $('#intro').classList.remove('gone'); $('#app').classList.add('intro-on'); }
  const cv = $('#road-canvas'); if (cv) { try { cv.focus({ preventScroll: true }); } catch (e) {} }
}
$('#siteBtn').addEventListener('click', () => setSiteMode(true));
$('#skipBtn').addEventListener('click', () => setSiteMode(true));
$('#startBtn').addEventListener('click', beginDrive);
$('#ctaSite').addEventListener('click', () => setSiteMode(true));
$('#timeBtn').addEventListener('click', () => { if (road) road.cycleTime(); });
$('#camBtn').addEventListener('click', () => { if (road) $('#camText').textContent = road.cycleCam(); });
$('#uturnBtn').addEventListener('click', () => { if (road && road.began) road.uturn(); });
$('#ctaBack').addEventListener('click', () => { if (road && road.began) road.uturn(); });
const doRestart = () => { if (road && road.began) road.restart(); };
$('#ctaRestart').addEventListener('click', doRestart);
$('#restartBtn').addEventListener('click', doRestart);
$('#soundBtn').addEventListener('click', () => { if (!road || !road.began) { Sfx.init(); } Sfx.toggle(); setSoundUI(); });
$('#ctaMail').textContent = CONTENT.contact.email;
$('#ctaTitle').textContent = CONTENT.contact.cta;
$('#ctaCopy').addEventListener('click', (e) => copyText(CONTENT.contact.email, $('#ctaMail'), e.currentTarget));
addEventListener('hashchange', () => { const want = location.hash === '#site'; if (want !== siteMode) setSiteMode(want); });
document.addEventListener('visibilitychange', () => { if (!road) return; if (document.hidden) { road.pause(); Sfx.suspend(); } else if (!siteMode) { road.resume(); Sfx.resume(); } });

buildSite();

/* ---------- boot: wait for fonts so the canvas panels use the right type ---------- */
function boot() {
  if (!window.THREE) { roadFailed = true; $('#intro').classList.add('gone'); setSiteMode(true); return; }
  const fonts = document.fonts, loads = fonts ? Promise.all([
    fonts.load('800 40px "Bricolage Grotesque"'), fonts.load('600 40px "Bricolage Grotesque"'),
    fonts.load('400 20px "Hanken Grotesk"'), fonts.load('500 20px "Hanken Grotesk"'), fonts.load('600 20px "Hanken Grotesk"'), fonts.load('500 20px "JetBrains Mono"'), fonts.load('600 20px "JetBrains Mono"'),
    fonts.load('600 40px "Noto Sans Ethiopic"', 'ፒያሳ')
  ]).catch(() => {}) : Promise.resolve();
  Promise.race([loads, new Promise((r) => setTimeout(r, 3000))]).then(() => {
    if (location.hash === '#site') { siteMode = true; document.body.classList.add('site-mode'); $('#intro').classList.add('gone'); return; }
    startRoad();
    if (roadFailed) $('#intro').classList.add('gone');
  });
}

/* Start once three.js has loaded (index.html fires this event). */
if (window.THREE_READY) boot(); else window.addEventListener('three-ready', boot, { once: true });
