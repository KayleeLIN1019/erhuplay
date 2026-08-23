import { pitchById } from "./game-core.js";

export class ErhuSynth {
  constructor() {
    this.context = null;
    this.output = null;
    this.voice = null;
    this.noiseBuffer = null;
    this.muted = false;
  }

  async unlock() {
    if (!this.context) this.createContext();
    if (this.context.state === "suspended") await this.context.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.output || !this.context) return;
    this.output.gain.setTargetAtTime(muted ? 0.0001 : 0.72, this.context.currentTime, 0.03);
    if (muted) this.endTone();
  }

  beginTone(pitchId, direction, intensity = 0.55) {
    if (!this.context || this.muted) return;
    if (this.voice) {
      this.updateTone(pitchId, intensity);
      return;
    }

    const now = this.context.currentTime;
    const frequency = pitchById(pitchId).frequency;
    const fundamental = this.context.createOscillator();
    const harmonic = this.context.createOscillator();
    const vibrato = this.context.createOscillator();
    const vibratoDepth = this.context.createGain();
    const toneGain = this.context.createGain();
    const harmonicGain = this.context.createGain();
    const bowNoise = this.context.createBufferSource();
    const noiseFilter = this.context.createBiquadFilter();
    const noiseGain = this.context.createGain();
    const bodyFilter = this.context.createBiquadFilter();
    const nasalFilter = this.context.createBiquadFilter();
    const warmth = this.context.createBiquadFilter();
    const envelope = this.context.createGain();

    fundamental.setPeriodicWave(this.createErhuWave());
    fundamental.frequency.value = frequency;
    fundamental.detune.value = direction === "pull" ? -1.7 : 1.7;
    harmonic.type = "sine";
    harmonic.frequency.value = frequency * 2.003;
    vibrato.type = "sine";
    vibrato.frequency.value = 4.8;
    vibratoDepth.gain.setValueAtTime(0.08, now);
    vibratoDepth.gain.linearRampToValueAtTime(1.15, now + 0.28);

    bowNoise.buffer = this.noiseBuffer;
    bowNoise.loop = true;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1220;
    noiseFilter.Q.value = 0.72;
    bodyFilter.type = "peaking";
    bodyFilter.frequency.value = 760;
    bodyFilter.Q.value = 0.9;
    bodyFilter.gain.value = 5.4;
    nasalFilter.type = "peaking";
    nasalFilter.frequency.value = 1450;
    nasalFilter.Q.value = 1.05;
    nasalFilter.gain.value = 2.1;
    warmth.type = "lowpass";
    warmth.frequency.value = 2550;
    warmth.Q.value = 0.65;

    const level = this.level(intensity);
    toneGain.gain.value = level;
    harmonicGain.gain.value = level * 0.1;
    noiseGain.gain.value = 0.0045 * Math.max(0.35, intensity);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.72, now + 0.075);

    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(fundamental.frequency);
    fundamental.connect(toneGain);
    harmonic.connect(harmonicGain);
    toneGain.connect(bodyFilter);
    harmonicGain.connect(bodyFilter);
    bowNoise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(bodyFilter);
    bodyFilter.connect(nasalFilter);
    nasalFilter.connect(warmth);
    warmth.connect(envelope);
    envelope.connect(this.output);

    fundamental.start(now);
    harmonic.start(now);
    vibrato.start(now);
    bowNoise.start(now);
    this.voice = { fundamental, harmonic, vibrato, bowNoise, toneGain, harmonicGain, noiseGain, bodyFilter, warmth, envelope };
  }

  updateTone(pitchId, intensity = 0.55) {
    if (!this.context || !this.voice || this.muted) return;
    const now = this.context.currentTime;
    const frequency = pitchById(pitchId).frequency;
    const level = this.level(intensity);
    this.voice.fundamental.frequency.setTargetAtTime(frequency, now, 0.04);
    this.voice.harmonic.frequency.setTargetAtTime(frequency * 2.003, now, 0.04);
    this.voice.toneGain.gain.setTargetAtTime(level, now, 0.035);
    this.voice.harmonicGain.gain.setTargetAtTime(level * 0.1, now, 0.05);
    this.voice.noiseGain.gain.setTargetAtTime(0.0045 * Math.max(0.35, intensity), now, 0.04);
    this.voice.bodyFilter.frequency.setTargetAtTime(710 + intensity * 165, now, 0.06);
    this.voice.warmth.frequency.setTargetAtTime(2200 + intensity * 700, now, 0.08);
  }

  endTone() {
    if (!this.context || !this.voice) return;
    const voice = this.voice;
    const now = this.context.currentTime;
    voice.envelope.gain.cancelScheduledValues(now);
    voice.envelope.gain.setValueAtTime(Math.max(0.0001, voice.envelope.gain.value), now);
    voice.envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    for (const source of [voice.fundamental, voice.harmonic, voice.vibrato, voice.bowNoise]) {
      try { source.stop(now + 0.21); } catch { /* already stopped */ }
    }
    this.voice = null;
  }

  createContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContextClass();
    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 7;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    this.output = this.context.createGain();
    this.output.gain.value = this.muted ? 0.0001 : 0.72;
    this.output.connect(compressor);
    compressor.connect(this.context.destination);

    const frames = Math.floor(this.context.sampleRate * 1.1);
    this.noiseBuffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const channel = this.noiseBuffer.getChannelData(0);
    let filtered = 0;
    for (let index = 0; index < frames; index += 1) {
      filtered = filtered * 0.91 + (Math.random() * 2 - 1) * 0.09;
      channel[index] = filtered;
    }
  }

  createErhuWave() {
    const real = new Float32Array(12);
    const imag = new Float32Array(12);
    imag[1] = 0.88;
    imag[2] = 0.13;
    imag[3] = 0.31;
    imag[4] = 0.075;
    imag[5] = 0.14;
    imag[6] = 0.045;
    imag[7] = 0.07;
    imag[8] = 0.028;
    imag[9] = 0.035;
    imag[10] = 0.018;
    return this.context.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  level(intensity) {
    return 0.105 * Math.max(0.28, Math.min(1, intensity));
  }
}
