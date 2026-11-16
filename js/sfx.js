/* Aser's Road: sound effects (all synthesised with WebAudio, no audio files) */
'use strict';

/* ---------- Sound: everything is synthesised with WebAudio (no files) ---------- */
const Sfx = (() => {
  let ctx = null, master = null, bus = null, musicBus = null, delaySend = null, noiseBuf = null, on = true, ready = false;
  let eng = null, wind = null, amb = null, pad = null, nextNote = 0, nextBird = 0, nextCricket = 0, lastZone = -1, lastBump = 0, engineOn = false;
  const ROOTS = [146.83, 164.81, 130.81, 110.0, 146.83];
  const PENT = [0, 2, 4, 7, 9, 12, 14, 16];
  const noiseSrc = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; };
  function env(g, t, a, peak, d) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function tone(type, f, t, a, peak, d, dest, f2) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d); env(g, t, a, peak, d); o.connect(g); g.connect(dest || bus); o.start(t); o.stop(t + a + d + 0.05); return g; }
  function burst(t, dur, peak, type, f1, f2, q) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = type; f.frequency.setValueAtTime(f1, t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur); f.Q.value = q || 0.8; env(g, t, Math.min(0.05, dur * 0.3), peak, dur); s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.1); }
  function init() {
    if (ctx) { if (ctx.state === 'suspended' && on) ctx.resume(); return true; }
    try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false; ctx = new AC(); } catch (e) { return false; }
    try {
      master = ctx.createGain(); master.gain.value = on ? 0.6 : 0; master.connect(ctx.destination);
      bus = ctx.createGain(); bus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      // engine: a smooth low sine hum plus a quiet octave, and a soft road hush
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), ef = ctx.createBiquadFilter(), eg = ctx.createGain(), g2 = ctx.createGain();
      o1.type = 'sine'; o2.type = 'sine'; g2.gain.value = 0.35; ef.type = 'lowpass'; ef.frequency.value = 260; eg.gain.value = 0;
      o1.frequency.value = 52; o2.frequency.value = 104; o1.connect(ef); o2.connect(g2); g2.connect(ef); ef.connect(eg); eg.connect(bus); o1.start(); o2.start(); eng = { o1, o2, f: ef, g: eg };
      const ns = ctx.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true; const nf = ctx.createBiquadFilter(), ng = ctx.createGain(); nf.type = 'lowpass'; nf.frequency.value = 500; ng.gain.value = 0; ns.connect(nf); nf.connect(ng); ng.connect(bus); ns.start(); wind = { g: ng };
      ready = true;
    } catch (e) { ready = false; }
    return ready;
  }
  function chime(zone) { if (!ready) return; const t = ctx.currentTime; tone('sine', 660, t, 0.01, 0.1, 0.5, bus); tone('sine', 880, t + 0.12, 0.01, 0.1, 0.7, bus); }
  function horn() { if (!ready) return; const t = ctx.currentTime; tone('triangle', 349, t, 0.03, 0.07, 0.32, bus); tone('triangle', 440, t, 0.03, 0.06, 0.32, bus); }
  function bump(k) { if (!ready) return; const t = ctx.currentTime; lastBump = t; tone('sine', 90, t, 0.005, 0.25 * (k || 1), 0.2, bus, 45); }
  function curbOk() { return ready && ctx.currentTime - lastBump > 0.6; }
  function whoosh() {}
  function tire() {}
  function uturn() {}
  function ignition() { if (!ready) return; engineOn = true; }
  function toggle() { on = !on; if (!ctx) return on; if (on) { ctx.resume(); } master.gain.setTargetAtTime(on ? 0.6 : 0, ctx.currentTime, 0.05); return on; }
  function update(dt, s) {
    if (!ready || !on || ctx.state !== 'running') return;
    const t = ctx.currentTime, sp = s.sp;
    const f = 52 + sp * 46;
    eng.o1.frequency.setTargetAtTime(f, t, 0.4); eng.o2.frequency.setTargetAtTime(f * 2, t, 0.4);
    eng.f.frequency.setTargetAtTime(220 + sp * 220, t, 0.4);
    eng.g.gain.setTargetAtTime(engineOn && s.began ? 0.05 + s.thr * 0.02 + sp * 0.03 : 0, t, 0.5);
    wind.g.gain.setTargetAtTime(s.began ? 0.008 + sp * 0.05 : 0, t, 0.5);
  }
  return { init, update, chime, horn, bump, whoosh, tire, uturn, ignition, toggle, curbOk, get on() { return on; }, suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }, resume() { if (ctx && on && ctx.state === 'suspended') ctx.resume(); } };
})();
