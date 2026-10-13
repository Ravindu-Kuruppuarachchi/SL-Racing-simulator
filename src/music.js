// Background music, synthesised with Web Audio (nothing to license). Kept soft on purpose:
// warm pad chords, a gentle plucked melody or arpeggio, a round bass and light drums.
// A small step sequencer schedules notes a little ahead of time (8 steps a bar).

// chords as MIDI notes; melody: [step within the 8-bar loop, MIDI note, steps long]
const SONGS = {
  // the menus: slow and airy
  menu: {
    bpm: 84,
    chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 64]], // Cmaj7 Am7 Fmaj7 G6
    bass: [0, null, null, null, 7, null, null, null],
    melody: [
      [0, 76, 3], [4, 79, 2], [6, 76, 2], [8, 72, 3], [12, 76, 4], [16, 69, 3], [20, 72, 2], [22, 76, 2], [24, 74, 4], [28, 71, 2], [30, 67, 2],
      [32, 76, 3], [36, 79, 2], [38, 81, 2], [40, 79, 3], [44, 76, 4], [48, 77, 3], [52, 76, 2], [54, 74, 2], [56, 72, 6],
    ],
    arp: null,
    kick: [1, 0, 0, 0, 0, 0, 0, 0],
    rim: [0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0],
  },
  // driving: a little quicker, an arpeggio instead of a tune
  drive: {
    bpm: 108,
    chords: [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]], // C G Am F
    bass: [0, null, 0, null, 7, null, 0, 12],
    melody: [],
    arp: [0, 1, 2, 3, 2, 1, 0, 2],
    kick: [1, 0, 0, 0, 1, 0, 0, 0],
    rim: [0, 0, 1, 0, 0, 0, 1, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1],
  },
};

const STEPS = 8; // per bar
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

export class Music {
  constructor() {
    this.ctx = null;
    this.volume = 0.5;
    this.song = null;
    this.name = null;
    this.timer = null;
    this.paused = false;
  }

  // Browsers only allow audio after a user gesture, so call this from a tap.
  unlock() {
    if (this.ctx) {
      if (!this.paused) this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume * 0.1125;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3800; // nothing harsh up top
    this.bus = ctx.createGain();
    this.bus.connect(tone).connect(this.master).connect(ctx.destination);
    // a soft echo for space
    const echo = ctx.createDelay();
    echo.delayTime.value = 0.34;
    const fb = ctx.createGain();
    fb.gain.value = 0.25;
    const wet = ctx.createBiquadFilter();
    wet.type = 'lowpass';
    wet.frequency.value = 2200;
    this.send = ctx.createGain();
    this.send.gain.value = 0.35;
    this.send.connect(echo).connect(wet).connect(fb).connect(echo);
    wet.connect(this.master);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v * 0.1125, this.ctx.currentTime, 0.1);
    if (v <= 0) this.stop();
    else if (this.name && !this.timer) this.play(this.name);
  }

  play(name) {
    this.name = name;
    if (!this.ctx || this.volume <= 0 || this.paused) return;
    if (this.song === SONGS[name] && this.timer) return;
    this.stop();
    this.song = SONGS[name];
    this.step = 0;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 50);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /** The app went to the background: silence everything until resume(). */
  suspend() {
    this.paused = true;
    this.stop();
    this.ctx?.suspend();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (!this.ctx) return;
    this.ctx.resume();
    if (this.name) {
      this.song = null; // restart the loop cleanly
      this.play(this.name);
    }
  }

  schedule() {
    const song = this.song;
    const dur = 60 / song.bpm / 2; // an eighth note
    const loop = STEPS * 8;
    while (this.next < this.ctx.currentTime + 0.25) {
      const st = this.step % loop;
      const inBar = st % STEPS;
      const chord = song.chords[Math.floor(st / STEPS) % 4];
      const t = this.next;
      if (inBar === 0) for (const n of chord) this.pad(hz(n), t, dur * STEPS);
      const b = song.bass[inBar];
      if (b !== null) this.bass(hz(chord[0] - 24 + b), t, dur * 2.5);
      for (const [ms, note, l] of song.melody) if (ms === st) this.pluck(hz(note), t, dur * l + 0.4, 0.13);
      if (song.arp) this.pluck(hz(chord[song.arp[inBar]] + 12), t, dur * 1.8, 0.07);
      if (song.kick[inBar]) this.kick(t);
      if (song.rim[inBar]) this.hit(t, 2600, 0.06, 0.05);
      if (song.hat[inBar]) this.hit(t, 9000, 0.03, 0.025);
      this.next += dur;
      this.step++;
    }
  }

  // warm chord pad: two slightly detuned triangles, slow attack and release
  pad(freq, t, len) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.028, t + 0.4);
    g.gain.setValueAtTime(0.028, t + len - 0.3);
    g.gain.linearRampToValueAtTime(0, t + len + 0.4);
    g.connect(this.bus);
    for (const detune of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(g);
      o.start(t);
      o.stop(t + len + 0.5);
    }
  }

  // a soft plucked note (like a marimba or kalimba): a sine with a quiet octave, quick decay
  pluck(freq, t, len, vol) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, t + len);
    g.connect(this.bus);
    g.connect(this.send);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    o.connect(g);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o2.connect(g2).connect(g);
    for (const x of [o, o2]) {
      x.start(t);
      x.stop(t + len + 0.05);
    }
  }

  bass(freq, t, len) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + len + 0.05);
  }

  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.22);
  }

  hit(t, freq, len, vol) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = freq > 5000 ? 'highpass' : 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.02);
  }
}
