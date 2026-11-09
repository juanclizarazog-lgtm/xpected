/*
 * Xpected · paisaje sonoro generativo (Web Audio API).
 * Música original sintetizada en tiempo real: pads con acordes extendidos, bajo sub, arpegio con eco
 * y "aire" filtrado. Nunca se reproduce sola (WCAG 1.4.2): el usuario la activa y controla el volumen.
 * Reacciona a los datos: los goles en vivo provocan un barrido armónico neutro (sin celebración de apuestas).
 */
(function () {
  'use strict';
  const XP = window.XP;
  const st = XP.LS.get('audio', { on: false, volume: 0.55, ui: true });
  const A = (XP.audio = { on: false, volume: st.volume, uiOn: st.ui, ctx: null });

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // Progresión en La menor con extensiones: Am9 → Fmaj9 → Cmaj9 → G6/9
  const CHORDS = [
    [45, 57, 60, 64, 67, 71],
    [41, 53, 57, 60, 64, 67],
    [36, 48, 55, 59, 62, 64],
    [43, 55, 59, 62, 64, 69],
  ];
  const CHORD_SEC = 8;
  let ctx, master, comp, analyser, padBus, padFilter, reverb, revSend, delay, delayFb, arpBus, airGain, lfo, lfoGain;
  let schedTimer = 0, nextChordAt = 0, chordIdx = 0, nextArpAt = 0, freq;

  function impulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function build() {
    ctx = A.ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.85;
    freq = new Uint8Array(analyser.frequencyBinCount);
    master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);

    reverb = ctx.createConvolver(); reverb.buffer = impulse(5, 2.6);
    revSend = ctx.createGain(); revSend.gain.value = 0.55;
    revSend.connect(reverb); reverb.connect(master);

    padFilter = ctx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 900; padFilter.Q.value = 0.7;
    lfo = ctx.createOscillator(); lfo.frequency.value = 0.045;
    lfoGain = ctx.createGain(); lfoGain.gain.value = 520;
    lfo.connect(lfoGain); lfoGain.connect(padFilter.frequency); lfo.start();
    padBus = ctx.createGain(); padBus.gain.value = 0.085;
    padFilter.connect(padBus); padBus.connect(master); padBus.connect(revSend);

    delay = ctx.createDelay(2); delay.delayTime.value = 0.75;
    delayFb = ctx.createGain(); delayFb.gain.value = 0.38;
    const delayTone = ctx.createBiquadFilter(); delayTone.type = 'lowpass'; delayTone.frequency.value = 2600;
    delay.connect(delayTone); delayTone.connect(delayFb); delayFb.connect(delay);
    arpBus = ctx.createGain(); arpBus.gain.value = 0.05;
    arpBus.connect(master); arpBus.connect(delay); delayTone.connect(revSend); delayTone.connect(master);

    // aire: ruido rosado aproximado con banda móvil
    const nb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048; nd[i] = (b0 + b1 + b2) * 0.6; }
    const noise = ctx.createBufferSource(); noise.buffer = nb; noise.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.9;
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.03;
    const lfo2g = ctx.createGain(); lfo2g.gain.value = 1400;
    lfo2.connect(lfo2g); lfo2g.connect(bp.frequency); lfo2.start();
    airGain = ctx.createGain(); airGain.gain.value = 0.02;
    noise.connect(bp); bp.connect(airGain); airGain.connect(revSend); airGain.connect(master);
    noise.start();
  }

  function voice(f, t, dur, detune, type, gainPeak, dest) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gainPeak, t + Math.min(2.8, dur * 0.35));
    g.gain.setValueAtTime(gainPeak, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur + 2.5);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 2.6);
  }

  function chord(t) {
    const ch = CHORDS[chordIdx % CHORDS.length];
    chordIdx++;
    ch.forEach((n, i) => {
      if (i === 0) { voice(mtof(n), t, CHORD_SEC, 0, 'sine', 0.55, padBus); return; }
      voice(mtof(n), t, CHORD_SEC, -7, 'sawtooth', 0.11, padFilter);
      voice(mtof(n), t, CHORD_SEC, 7, 'sawtooth', 0.11, padFilter);
      if (i % 2) voice(mtof(n + 12), t + 0.4, CHORD_SEC, 3, 'triangle', 0.06, padFilter);
    });
  }

  function pluck(t, n, vel) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(n);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(n + 12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g); o2.connect(g); g.connect(arpBus);
    o.start(t); o2.start(t); o.stop(t + 1.7); o2.stop(t + 1.7);
  }

  function schedule() {
    const now = ctx.currentTime;
    while (nextChordAt < now + 0.5) { chord(nextChordAt); nextChordAt += CHORD_SEC; }
    while (nextArpAt < now + 0.5) {
      const ch = CHORDS[(chordIdx + CHORDS.length - 1) % CHORDS.length];
      if (Math.random() < 0.42) {
        const tones = ch.slice(2);
        const n = tones[Math.floor(Math.random() * tones.length)] + (Math.random() < 0.5 ? 12 : 24);
        pluck(nextArpAt, n, 0.35 + Math.random() * 0.4);
      }
      nextArpAt += 0.375;
    }
  }

  A.start = async function () {
    if (!ctx) build();
    if (ctx.state === 'suspended') await ctx.resume();
    if (A.on) return;
    A.on = true;
    const t = ctx.currentTime;
    nextChordAt = t + 0.05; nextArpAt = t + 2;
    schedTimer = setInterval(schedule, 120);
    schedule();
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(A.volume * 0.7, t + 3);
    persist();
    XP.bus.emit('audio', { on: true });
  };

  A.stop = function () {
    if (!ctx || !A.on) return;
    A.on = false;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + 1.2);
    clearInterval(schedTimer);
    setTimeout(() => { if (!A.on && ctx) ctx.suspend(); }, 1400);
    persist();
    XP.bus.emit('audio', { on: false });
  };

  A.toggle = () => (A.on ? A.stop() : A.start());

  A.setVolume = function (v) {
    A.volume = Math.max(0, Math.min(1, v));
    if (ctx && A.on) master.gain.setTargetAtTime(A.volume * 0.7, ctx.currentTime, 0.2);
    persist();
  };
  A.setUi = function (v) { A.uiOn = v; persist(); };

  /** Nivel de audio 0..1 para visuales reactivos. */
  A.level = function () {
    if (!A.on || !analyser) return 0;
    analyser.getByteFrequencyData(freq);
    let s = 0;
    for (let i = 2; i < 40; i++) s += freq[i];
    return Math.min(1, s / (38 * 190));
  };
  A.bands = function (n) {
    const out = new Array(n).fill(0);
    if (!A.on || !analyser) return out;
    analyser.getByteFrequencyData(freq);
    const per = Math.floor(48 / n);
    for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < per; k++) s += freq[2 + i * per + k]; out[i] = s / (per * 255); }
    return out;
  };

  /** Microsonidos de interfaz, muy suaves, solo con el sonido activo. */
  let lastUi = 0;
  A.ui = function (kind) {
    if (!A.on || !A.uiOn || !ctx) return;
    const now = performance.now();
    if (kind === 'hover' && now - lastUi < 70) return;
    lastUi = now;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    const f = kind === 'click' ? 660 : kind === 'tick' ? 1320 : 1760;
    o.frequency.setValueAtTime(f, t);
    if (kind === 'click') o.frequency.exponentialRampToValueAtTime(330, t + 0.12);
    const peak = kind === 'click' ? 0.06 : kind === 'tick' ? 0.012 : 0.02;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'click' ? 0.18 : 0.08));
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.2);
  };

  /** Barrido armónico neutro cuando hay gol en vivo. */
  XP.bus.on('goal', () => {
    if (!A.on || !ctx) return;
    const t = ctx.currentTime + 0.05;
    [69, 76, 81, 88].forEach((n, i) => pluck(t + i * 0.09, n, 0.3));
  });

  function persist() { XP.LS.set('audio', { on: A.on, volume: A.volume, ui: A.uiOn }); }

  // Si el usuario lo dejó activado, se reanuda con su primera interacción (los navegadores lo exigen).
  if (st.on) {
    const resume = () => { A.start(); window.removeEventListener('pointerdown', resume); window.removeEventListener('keydown', resume); };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
  }
})();
