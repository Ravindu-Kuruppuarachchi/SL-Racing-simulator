// Tiny synthesized engine sounds. Each vehicle tweaks the same synth:
// base pitch, pitch rise with revs, "putt" rate, how choppy it is, filter tone.
const PROFILES = {
  tuktuk: { base: 45, range: 70, putt: 12, chop: 1, tone: 500, volume: 1 }, // two-stroke putt-putt
  bike: { base: 70, range: 160, putt: 22, chop: 0.8, tone: 900, volume: 1 },
  hatchback: { base: 55, range: 90, putt: 30, chop: 0.3, tone: 450, volume: 0.8 },
  lorry: { base: 40, range: 60, putt: 14, chop: 0.8, tone: 420, volume: 1.1 }, // small diesel truck
  hybrid: { base: 90, range: 60, putt: 40, chop: 0.1, tone: 300, volume: 0.4 }, // mostly electric hum
  van: { base: 42, range: 65, putt: 20, chop: 0.5, tone: 400, volume: 1 }, // smooth turbo diesel
  jeep: { base: 34, range: 45, putt: 9, chop: 1, tone: 380, volume: 1.2 }, // gruff diesel
  // SL Racing
  buggy: { base: 60, range: 150, putt: 26, chop: 0.7, tone: 800, volume: 1 }, // buzzy flat-four
  rally: { base: 70, range: 170, putt: 34, chop: 0.5, tone: 900, volume: 1 }, // turbo four
  roadster: { base: 75, range: 160, putt: 38, chop: 0.35, tone: 1000, volume: 0.9 },
  muscle: { base: 38, range: 110, putt: 16, chop: 0.9, tone: 600, volume: 1.3 }, // big V8 burble
  truck: { base: 42, range: 100, putt: 18, chop: 0.8, tone: 550, volume: 1.3 },
  supercar: { base: 85, range: 220, putt: 48, chop: 0.25, tone: 1300, volume: 1.1 }, // screaming V10
};

export class EngineSound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.profile = PROFILES.tuktuk;
  }

  setVehicle(id) {
    this.profile = PROFILES[id] ?? PROFILES.tuktuk;
  }

  // Browsers only allow audio after a user gesture, so call this from a click.
  unlock(muted) {
    this.muted = muted;
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 500;
    // amplitude wobble gives the "putt-putt" character
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'square';
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.02;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.lfo.connect(this.lfoGain).connect(this.gain.gain);
    this.osc.connect(this.filter).connect(this.gain).connect(ctx.destination);
    this.osc.start();
    this.lfo.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted) this.setLevel(0, false);
  }

  setLevel(wheelSpin, throttle) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const p = this.profile;
    const rpm = Math.min(wheelSpin / 40, 1);
    const on = !this.muted;
    this.osc.frequency.setTargetAtTime(p.base + rpm * p.range + (throttle ? p.base * 0.3 : 0), t, 0.08);
    this.lfo.frequency.setTargetAtTime(p.putt + rpm * p.putt * 2, t, 0.08);
    this.filter.frequency.setTargetAtTime(p.tone, t, 0.1);
    this.gain.gain.setTargetAtTime(on ? (throttle ? 0.05 : 0.025) * p.volume : 0, t, 0.1);
    this.lfoGain.gain.setTargetAtTime(on ? 0.02 * p.volume * p.chop : 0, t, 0.1);
  }
}
