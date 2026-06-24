// WebAudio kit for Tide Line. iOS-safe: lazy ctx on first gesture, one shared
// noise buffer, no per-pointermove voices (litter clears are discrete events),
// hard voice cap. A soft looping sea ambience runs while playing.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let resumed = false;
let muted = false;

let voices = 0;
const MAX_VOICES = 12;

let ambGain: GainNode | null = null;
let ambNodes: AudioNode[] = [];

function ensure() {
  if (ctx) return;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 1.2);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
}

export function unlockAudio() {
  ensure();
  if (ctx && !resumed) {
    ctx.resume().catch(() => {});
    resumed = true;
  }
}

export function setMuted(m: boolean) {
  muted = m;
  if (ambGain && ctx) ambGain.gain.value = m ? 0 : 0.12;
}

function ready(): boolean {
  return !!ctx && !!master && ctx.state === 'running' && !muted;
}
function takeVoice(): boolean {
  if (voices >= MAX_VOICES) return false;
  voices++;
  return true;
}
function freeVoice(after: number) {
  setTimeout(() => {
    voices = Math.max(0, voices - 1);
  }, after);
}

// Clearing one piece of litter — a short filtered noise "swish" + soft blip.
// pitch rises slightly with combo so a fast sweep feels musical.
export function playClear(combo = 0) {
  if (!ready() || !takeVoice()) return;
  const c = ctx!;
  const t = c.currentTime;
  const pitch = 1 + Math.min(combo, 8) * 0.04;

  const src = c.createBufferSource();
  src.buffer = noise!;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(900 * pitch, t);
  bp.frequency.exponentialRampToValueAtTime(2600 * pitch, t + 0.12);
  bp.Q.value = 0.8;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  src.connect(bp);
  bp.connect(ng);
  ng.connect(master!);
  src.start(t);
  src.stop(t + 0.2);

  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(520 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(880 * pitch, t + 0.07);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  o.connect(g);
  g.connect(master!);
  o.start(t);
  o.stop(t + 0.16);

  freeVoice(220);
}

// Stretch restored — a warm rising major arpeggio swell.
export function playBloom() {
  if (!ready()) return;
  const c = ctx!;
  const t0 = c.currentTime;
  const notes = [523, 659, 784, 1046, 1318];
  notes.forEach((f, i) => {
    const t = t0 + i * 0.09;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g);
    g.connect(master!);
    o.start(t);
    o.stop(t + 0.55);
  });
}

// Releasing a creature onto a shore — a gentle water "plip".
export function playRelease() {
  if (!ready() || !takeVoice()) return;
  const c = ctx!;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(320, t + 0.13);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.26, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(g);
  g.connect(master!);
  o.start(t);
  o.stop(t + 0.22);
  freeVoice(230);
}

export function playTap() {
  if (!ready() || !takeVoice()) return;
  const c = ctx!;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(560, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  o.connect(g);
  g.connect(master!);
  o.start(t);
  o.stop(t + 0.09);
  freeVoice(100);
}

// Soft, endless sea wash — two detuned filtered-noise layers gently breathing.
export function startAmbience() {
  ensure();
  if (!ctx || !master || ambGain) return;
  const c = ctx;
  ambGain = c.createGain();
  ambGain.gain.value = muted ? 0 : 0.12;
  ambGain.connect(master);

  for (let i = 0; i < 2; i++) {
    const src = c.createBufferSource();
    src.buffer = noise!;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500 + i * 250;
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfo.frequency.value = 0.12 + i * 0.05;
    lfoG.gain.value = 0.5;
    const layer = c.createGain();
    layer.gain.value = 0.5;
    lfo.connect(lfoG);
    lfoG.connect(layer.gain);
    src.connect(lp);
    lp.connect(layer);
    layer.connect(ambGain);
    src.start();
    lfo.start();
    ambNodes.push(src, lfo);
  }
}

export function stopAmbience() {
  for (const n of ambNodes) {
    try {
      (n as OscillatorNode).stop?.();
    } catch {
      /* ignore */
    }
    try {
      n.disconnect();
    } catch {
      /* ignore */
    }
  }
  ambNodes = [];
  if (ambGain) {
    try {
      ambGain.disconnect();
    } catch {
      /* ignore */
    }
    ambGain = null;
  }
}
