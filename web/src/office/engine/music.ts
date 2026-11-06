// Adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// src/client/music.ts: the jukebox's lo-fi, synthesized with Web Audio: warm keys on a four-chord loop over a
// soft kick, a hat and a round bass. Much shorter here: one tune, no rounds, no tape wobble or crackle.
const BPM = 78;
const CHORDS = [[48, 55, 59, 64], [45, 52, 55, 60], [50, 57, 60, 65], [43, 50, 53, 59]]; // Cmaj7 Am7 Dm7 G7 (MIDI)
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class Lofi {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer = 0;
  private step = 0;
  private at = 0;
  /** Called on every beat (the jukebox's lights pulse to it). */
  onBeat: (() => void) | null = null;
  get playing() {
    return !!this.timer;
  }

  start() {
    if (this.timer) return;
    const ctx = (this.ctx ??= new AudioContext());
    void ctx.resume();
    this.out = ctx.createGain();
    this.out.gain.value = 0.18;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    this.out.connect(lp).connect(ctx.destination);
    this.at = ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = 0;
    this.out?.disconnect();
    this.out = null;
  }

  private note(f: number, at: number, len: number, vol: number, type: OscillatorType) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(this.out!);
    o.start(at);
    o.stop(at + len + 0.05);
  }

  private noise(at: number, len: number, vol: number) {
    const ctx = this.ctx!, b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = ctx.createBufferSource(), g = ctx.createGain(), hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    s.buffer = b;
    g.gain.value = vol;
    s.connect(hp).connect(g).connect(this.out!);
    s.start(at);
  }

  /** Schedules the 8th notes due in the next 300 ms. */
  private schedule() {
    const ctx = this.ctx!, eighth = 30 / BPM;
    while (this.at < ctx.currentTime + 0.3) {
      const s = this.step, at = this.at + (s % 2 ? eighth * 0.12 : 0); // swing
      const chord = CHORDS[Math.floor(s / 8) % 4];
      if (s % 8 === 0) for (const m of chord) this.note(hz(m + 12), at, eighth * 7, 0.05, 'triangle');
      if (s % 8 === 3 || s % 8 === 6) for (const m of chord.slice(1)) this.note(hz(m + 12), at, eighth * 1.5, 0.025, 'sine');
      if (s % 4 === 0) this.note(hz(chord[0] - 12), at, eighth * 3, 0.16, 'sine');
      if (s % 8 === 0 || s % 8 === 5) { this.note(55, at, 0.25, 0.5, 'sine'); }
      if (s % 8 === 4) this.noise(at, 0.18, 0.18);
      this.noise(at, 0.04, 0.05);
      if (s % 2 === 0) window.setTimeout(() => this.onBeat?.(), Math.max(0, (at - ctx.currentTime) * 1000));
      this.step++;
      this.at += eighth;
    }
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
  }
}
