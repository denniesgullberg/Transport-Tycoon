/**
 * sound.ts
 * Retro sound effects generated with the Web Audio API. No audio files needed.
 *
 * Browsers block audio until the player interacts with the page, so call
 * sound.attachUnlock() once at startup. After that, sound.play("build") etc.
 */

export type Sfx =
  | "click" | "build" | "demolish" | "cash" | "error"
  | "breakdown" | "whistle" | "horn" | "newYear" | "crash";

const STORAGE_KEY = "tycoon-sound-muted";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private _muted = false;
  private _volume = 0.4;
  private musicGain: GainNode | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private _music = false;
  private _musicVolume = 0.25;
  private nextBeat = 0;
  private beat = 0;

  constructor() {
    try { this._muted = localStorage.getItem(STORAGE_KEY) === "1"; } catch { /* storage unavailable */ }
  }

  /** Call once. Creates the audio context on the first click, key press or touch. */
  attachUnlock(): void {
    const unlock = () => {
      this.ensure();
      if (this._music) this.startMusic();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  private ensure(): boolean {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : this._volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return true;
  }

  get muted() { return this._muted; }
  get volume() { return this._volume; }

  setMuted(m: boolean): void {
    this._muted = m;
    try { localStorage.setItem(STORAGE_KEY, m ? "1" : "0"); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : this._volume;
  }

  // ----------------------------------------------------------------- music
  // A gentle looping tune built from a chord progression, scheduled a little ahead.

  get music() { return this._music; }

  setMusic(on: boolean): void {
    this._music = on;
    if (on) this.startMusic(); else this.stopMusic();
  }

  setMusicVolume(v: number): void {
    this._musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicGain) this.musicGain.gain.value = this._musicVolume;
  }

  private startMusic(): void {
    if (this.musicTimer || !this.ctx) return;   // starts for real after the first tap unlocks audio
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this._musicVolume;
    this.musicGain.connect(this.ctx.destination);
    this.nextBeat = this.ctx.currentTime + 0.1; this.beat = 0;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 200);
  }

  private stopMusic(): void {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (this.musicGain) { this.musicGain.disconnect(); this.musicGain = null; }
  }

  private scheduleMusic(): void {
    if (!this.ctx || !this.musicGain) return;
    const spb = 60 / 96 / 2;                        // eighth notes at 96 bpm
    // I - vi - IV - V in C, two bars each; melody notes are scale steps over the chord root
    const roots = [48, 45, 41, 43];
    const tune = [0, 4, 7, 4, 9, 7, 4, 2, 0, 3, 7, 3, 5, 3, 0, -1, 0, 4, 9, 7, 5, 4, 2, 4, 2, 5, 7, 11, 9, 7, 5, 2];
    while (this.nextBeat < this.ctx.currentTime + 0.6) {
      const bar = Math.floor(this.beat / 16) % 4, step = this.beat % 32;
      const root = roots[bar], t = this.nextBeat - this.ctx.currentTime;
      if (this.beat % 4 === 0) this.note(root - 12, spb * 3.6, "triangle", 0.5, t);
      if (this.beat % 2 === 0) this.note(root + 12 + tune[step], spb * 1.7, "square", 0.08, t);
      if (this.beat % 8 === 4) this.note(root + 7, spb * 3, "sine", 0.18, t);
      this.nextBeat += spb; this.beat++;
    }
  }

  private note(midi: number, dur: number, type: OscillatorType, vol: number, delay: number): void {
    if (!this.ctx || !this.musicGain) return;
    const t0 = this.ctx.currentTime + Math.max(0, delay), f = 440 * Math.pow(2, (midi - 69) / 12);
    const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = type; osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.musicGain); osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.master && !this._muted) this.master.gain.value = this._volume;
  }

  // ------------------------------------------------------------ primitives

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, cutoff: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  // ----------------------------------------------------------------- sounds

  play(name: Sfx): void {
    if (this._muted || !this.ensure()) return;
    switch (name) {
      case "click":
        this.tone(900, 0.04, "square", 0.12);
        break;
      case "build":
        this.noise(0.12, 0.25, 700);
        this.tone(140, 0.15, "triangle", 0.3, 90);
        break;
      case "demolish":
        this.noise(0.4, 0.5, 450);
        this.tone(90, 0.35, "sawtooth", 0.25, 35);
        break;
      case "cash":
        this.tone(1318, 0.08, "sine", 0.25);
        this.tone(1760, 0.2, "sine", 0.25, undefined, 0.08);
        break;
      case "error":
        this.tone(170, 0.22, "sawtooth", 0.25, 120);
        break;
      case "breakdown":
        this.tone(240, 0.5, "sawtooth", 0.25, 60);
        this.noise(0.3, 0.2, 900, 0.1);
        break;
      case "whistle":
        this.tone(880, 0.55, "triangle", 0.22, 960);
        this.tone(1110, 0.55, "triangle", 0.16, 1180);
        break;
      case "horn":
        this.tone(330, 0.3, "square", 0.1);
        this.tone(415, 0.3, "square", 0.1);
        break;
      case "newYear":
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, "triangle", 0.22, undefined, i * 0.12));
        break;
      case "crash":
        this.noise(0.8, 0.7, 1200);
        this.tone(110, 0.6, "sawtooth", 0.4, 30);
        break;
    }
  }
}

export const sound = new SoundEngine();

/*
 * HOW TO USE
 *
 *   // once, e.g. in main.tsx or your App component's first effect:
 *   sound.attachUnlock();
 *
 *   // in the game:
 *   sound.play("build");        // when something is placed
 *   sound.play("cash");         // when a delivery pays out (rate-limit this, e.g. max 1 per 300 ms)
 *   sound.play("breakdown");    // from tickWorldDay events
 *   sound.play("newYear");      // on the new year event
 *
 *   // a mute button:
 *   <button onClick={() => sound.setMuted(!sound.muted)}>{sound.muted ? "Sound off" : "Sound on"}</button>
 */
