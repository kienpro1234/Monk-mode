// Web Audio API Synthesized Temple & Zen Sound Engine (100% Offline, STREAM_ALARM Override Style)

class ZenSoundEngine {
  private ctx: AudioContext | null = null;
  private alarmInterval: number | null = null;

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Chuông Chùa Trầm Vang (Resonant Bronze Temple Bell - Level 1 Notification & Meditation Start)
   */
  public playTempleBell(volume = 0.85) {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      // Fundamental & harmonic partials of an ancient bronze temple bell (Dai Hong Chung)
      const partials = [
        { freq: 146.83, amp: 1.0, decay: 4.5 },  // D3 fundamental
        { freq: 293.66, amp: 0.65, decay: 3.8 }, // D4 octave
        { freq: 349.23, amp: 0.45, decay: 3.1 }, // F4 minor third overtone
        { freq: 440.0, amp: 0.5, decay: 2.7 },   // A4 fifth
        { freq: 587.33, amp: 0.3, decay: 2.0 },  // D5
        { freq: 880.0, amp: 0.18, decay: 1.4 },  // High shimmer
      ];

      // Wooden striker transient thud
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.008));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(volume * 0.6, now);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);

      partials.forEach((p) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(p.freq, now);
        // Subtle pitch beat
        osc.frequency.exponentialRampToValueAtTime(p.freq * 0.998, now + p.decay);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(volume * p.amp * 0.35, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + p.decay + 0.05);
      });
    } catch {
      // Ignore audio errors if blocked
    }
  }

  /**
   * Mõ Chùa (Wooden Fish Percussion Click for Pomodoro & Alerts)
   */
  public playWoodenFish(volume = 0.6) {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.09);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(volume * 0.5, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Ignore
    }
  }

  /**
   * Âm Thanh Đóng Triện Trầm Đục (Heavy Woodblock Stamp Thud - Section 3.5)
   */
  public playWoodblockStampSound() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      // Deep sub-bass impact thud
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(115, now);
      subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.38);

      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.linearRampToValueAtTime(1.0, now + 0.012);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.45);

      // Wood grain slap transient
      const bufSize = Math.floor(ctx.sampleRate * 0.12);
      const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const output = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.025));
      }
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuf;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(240, now);
      bandpass.Q.setValueAtTime(1.5, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.95, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

      whiteNoise.connect(bandpass);
      bandpass.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      whiteNoise.start(now);

      // Follow with a solemn resonant bell chime
      setTimeout(() => this.playTempleBell(0.75), 180);
    } catch {
      // Ignore
    }
  }

  /**
   * Chuông Cảnh Báo Phá Giới Luật (Mountain Law Violation Gong)
   */
  public playViolationGong() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      const freqs = [98, 103.8, 196, 207.65, 311.13];
      freqs.forEach((f) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, now);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, now);
        filter.frequency.exponentialRampToValueAtTime(140, now + 2.5);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 2.9);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Cảnh Báo Cực Đoan Cấp Độ 2 (Relentless Nagging Engine Continuous Alarm)
   */
  public startRelentlessAlarm() {
    this.stopRelentlessAlarm();
    const triggerBurst = () => {
      this.playTempleBell(1.0);
      setTimeout(() => this.playWoodenFish(0.9), 400);
      setTimeout(() => this.playWoodenFish(0.9), 750);
      setTimeout(() => this.playWoodenFish(0.9), 1100);
    };
    triggerBurst();
    this.alarmInterval = window.setInterval(triggerBurst, 3200);
  }

  public stopRelentlessAlarm() {
    if (this.alarmInterval !== null) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
  }
}

export const soundEngine = new ZenSoundEngine();
