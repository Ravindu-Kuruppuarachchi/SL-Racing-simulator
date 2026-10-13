// Background music, synthesised with Web Audio (nothing to license): a relaxed baila-style
// groove for the menus and an upbeat one for driving. A small step sequencer schedules
// notes a little ahead of time; each song is a chord loop, a bass line, offbeat chord
// "chops", a pentatonic melody and drums.

const SONGS = {
  // 6/8 baila feel: 12 steps a bar (triplet eighths)
  menu: {
    bpm: 100, steps: 12, beat: 3,
    chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], // C G Am F
    bass: [0, null, null, 7, null, null, 0, null, 12, 7, null, null],
    chop: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0],
    shaker: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    lead: 'triangle', seed: 7, density: 0.45,
  },
  // driving: 16 steps a bar
  drive: {
    bpm: 128, steps: 16, beat: 4,
    chords: [[55, 59, 62], [60, 64, 67], [62, 66, 69], [60, 64, 67]], // G C D C
    bass: [0, null, 12, null, 0, null, 12, 7, 0, null, 12, null, 0, 7, 10, 12],
    chop: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    shaker: [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1],
    lead: 'square', seed: 21, density: 0.55,
  },
};

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A four-bar melody per song, played twice with the second half varied: [step, midi, steps long]
function compose(song) {
  const r = rng(song.seed);
  const phrase = [];
  for (let bar = 0; bar < 4; bar++) {
    const root = song.chords[bar][0];
    let s = 0;
    while (s < song.steps) {
      const strong = s % song.beat === 0;
      if (strong || r() < song.density) {
        // chord tones on the beat, pentatonic notes in between
        const note = strong ? song.chords[bar][Math.floor(r() * 3)] + 12 : root + 12 + PENTA[Math.floor(r() * PENTA.length)];
        const len = r() < 0.3 ? song.beat : r() < 0.6 ? 2 : 1;
        phrase.push([bar * song.steps + s, note, len]);
        s += len;
      } else s++;
    }
  }
  const varied = phrase.map(([st, n, l]) => [st + 4 * song.steps, st >= 2 * song.steps && r() < 0.5 ? n + (r() < 0.5 ? 2 : -3) : n, l]);
  return [...phrase, ...varied];
}

export class Music {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.song = null;
    this.name = null;
    this.timer = null;
  }

  // Browsers only allow audio after a user gesture, so call this from a tap.
  unlock() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume * 0.5;
    // a touch of warmth and space: low-pass, plus a short feedback echo
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200;
    const echo = this.ctx.createDelay();
    echo.delayTime.value = 0.28;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.22;
    this.bus = this.ctx.createGain();
    this.bus.connect(tone).connect(this.master).connect(this.ctx.destination);
    this.send = this.ctx.createGain();
    this.send.gain.value = 0.3;
    this.send.connect(echo).connect(fb).connect(echo);
    echo.connect(this.master);
    // noise for the drums
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.1);
    if (v <= 0) this.stop();
    else if (this.name && !this.timer) this.play(this.name);
  }

  play(name) {
    this.name = name;
    if (!this.ctx || this.volume <= 0) return;
    if (this.song === SONGS[name] && this.timer) return;
    this.stop();
    this.song = SONGS[name];
    this.melody = compose(this.song);
    this.step = 0;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 40);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    const song = this.song;
    const dur = 60 / song.bpm / song.beat; // seconds per step
    const loop = song.steps * 8;
    while (this.next < this.ctx.currentTime + 0.2) {
      const st = this.step % loop;
      const inBar = st % song.steps;
      const chord = song.chords[Math.floor(st / song.steps) % 4];
      const t = this.next;
      const b = song.bass[inBar];
      if (b !== null) this.tone('triangle', hz(chord[0] - 24 + b), t, dur * 1.6, 0.32);
      if (song.chop[inBar]) for (const n of chord) this.tone('square', hz(n), t, dur * 0.6, 0.035, 1800);
      for (const [ms, note, l] of this.melody) if (ms === st) this.tone(song.lead, hz(note), t, dur * l * 0.95, song.lead === 'square' ? 0.05 : 0.12, 2600, true);
      if (song.kick[inBar]) this.kick(t);
      if (song.snare[inBar]) this.hit(t, 1800, 0.18, 0.12);
      if (song.shaker[inBar]) this.hit(t, 8000, 0.04, inBar % song.beat === 0 ? 0.07 : 0.04);
      this.next += dur;
      this.step++;
    }
  }

  tone(type, freq, t, len, vol, cutoff = 0, echo = false) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + len);
    let out = o;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      out = o.connect(f);
    }
    out.connect(g).connect(this.bus);
    if (echo) g.connect(this.send);
    o.start(t);
    o.stop(t + len + 0.05);
  }

  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.25);
  }

  hit(t, freq, len, vol) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = freq > 4000 ? 'highpass' : 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.02);
  }
}
