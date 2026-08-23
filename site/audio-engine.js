import { pitchById } from "./game-core.js";

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

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
    this.output.gain.setTargetAtTime(muted ? 0.0001 : 0.64, this.context.currentTime, 0.035);
    if (muted) this.endTone();
  }

  beginTone(pitchId, direction, intensity = 0.55) {
    if (!this.context || this.muted) return;
    if (this.voice) {
      this.updateTone(pitchId, intensity);
      return;
    }

    const context = this.context;
    const now = context.currentTime;
    const frequency = pitchById(pitchId).frequency;
    const energy = clamp(intensity, 0.28, 1);

    const stringTone = context.createOscillator();
    const edgeTone = context.createOscillator();
    const vibrato = context.createOscillator();
    const vibratoDepth = context.createGain();
    const stringGain = context.createGain();
    const edgeGain = context.createGain();
    const sourceBus = context.createGain();

    const bowNoise = context.createBufferSource();
    const bowNoiseFilter = context.createBiquadFilter();
    const bowNoiseGain = context.createGain();
    const attackNoise = context.createBufferSource();
    const attackFilter = context.createBiquadFilter();
    const attackGain = context.createGain();

    const bowCurve = context.createWaveShaper();
    const bodyLowCut = context.createBiquadFilter();
    const bodyWarmth = context.createBiquadFilter();
    const lowerBody = context.createBiquadFilter();
    const middleBody = context.createBiquadFilter();
    const upperBody = context.createBiquadFilter();
    const envelope = context.createGain();

    stringTone.setPeriodicWave(this.createErhuWave());
    stringTone.frequency.value = frequency;
    stringTone.detune.value = direction === "pull" ? -1.2 : 1.2;

    edgeTone.type = "triangle";
    edgeTone.frequency.value = frequency * 2.006;
    edgeTone.detune.value = direction === "pull" ? 1.5 : -1.5;

    vibrato.type = "sine";
    vibrato.frequency.value = 5.05;
    vibratoDepth.gain.setValueAtTime(0, now);
    vibratoDepth.gain.setValueAtTime(0, now + 0.22);
    vibratoDepth.gain.linearRampToValueAtTime(5.2, now + 0.72);

    const level = this.level(energy);
    stringGain.gain.value = level;
    edgeGain.gain.value = level * (0.065 + energy * 0.035);
    sourceBus.gain.value = 0.86;

    bowNoise.buffer = this.noiseBuffer;
    bowNoise.loop = true;
    bowNoiseFilter.type = "bandpass";
    bowNoiseFilter.frequency.value = 1120 + energy * 670;
    bowNoiseFilter.Q.value = 0.58;
    bowNoiseGain.gain.value = 0.003 + energy * 0.0046;

    attackNoise.buffer = this.noiseBuffer;
    attackFilter.type = "bandpass";
    attackFilter.frequency.value = 2050 + energy * 900;
    attackFilter.Q.value = 0.75;
    attackGain.gain.setValueAtTime(0.018 + energy * 0.022, now);
    attackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.115);

    bowCurve.curve = this.createBowCurve();
    bowCurve.oversample = "2x";

    bodyLowCut.type = "highpass";
    bodyLowCut.frequency.value = 105;
    bodyLowCut.Q.value = 0.55;

    bodyWarmth.type = "lowpass";
    bodyWarmth.frequency.value = 2700 + energy * 900;
    bodyWarmth.Q.value = 0.48;

    lowerBody.type = "peaking";
    lowerBody.frequency.value = 455;
    lowerBody.Q.value = 1.15;
    lowerBody.gain.value = 3.8;

    middleBody.type = "peaking";
    middleBody.frequency.value = 890;
    middleBody.Q.value = 1.05;
    middleBody.gain.value = 3.1;

    upperBody.type = "peaking";
    upperBody.frequency.value = 1520;
    upperBody.Q.value = 1.25;
    upperBody.gain.value = 1.8;

    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.78, now + 0.052);
    envelope.gain.linearRampToValueAtTime(0.7, now + 0.17);

    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(stringTone.detune);
    vibratoDepth.connect(edgeTone.detune);
    stringTone.connect(stringGain).connect(sourceBus);
    edgeTone.connect(edgeGain).connect(sourceBus);
    bowNoise.connect(bowNoiseFilter).connect(bowNoiseGain).connect(sourceBus);
    attackNoise.connect(attackFilter).connect(attackGain).connect(sourceBus);
    sourceBus.connect(bowCurve);
    bowCurve.connect(bodyLowCut);
    bodyLowCut.connect(bodyWarmth);
    bodyWarmth.connect(lowerBody);
    lowerBody.connect(middleBody);
    middleBody.connect(upperBody);
    upperBody.connect(envelope).connect(this.output);

    stringTone.start(now);
    edgeTone.start(now);
    vibrato.start(now);
    bowNoise.start(now);
    attackNoise.start(now);
    attackNoise.stop(now + 0.16);

    this.voice = {
      stringTone,
      edgeTone,
      vibrato,
      bowNoise,
      attackNoise,
      stringGain,
      edgeGain,
      bowNoiseFilter,
      bowNoiseGain,
      bodyWarmth,
      middleBody,
      envelope,
    };
  }

  updateTone(pitchId, intensity = 0.55) {
    if (!this.context || !this.voice || this.muted) return;
    const now = this.context.currentTime;
    const frequency = pitchById(pitchId).frequency;
    const energy = clamp(intensity, 0.28, 1);
    const level = this.level(energy);

    this.voice.stringTone.frequency.cancelScheduledValues(now);
    this.voice.edgeTone.frequency.cancelScheduledValues(now);
    this.voice.stringTone.frequency.setTargetAtTime(frequency, now, 0.022);
    this.voice.edgeTone.frequency.setTargetAtTime(frequency * 2.006, now, 0.028);
    this.voice.stringGain.gain.setTargetAtTime(level, now, 0.025);
    this.voice.edgeGain.gain.setTargetAtTime(level * (0.065 + energy * 0.035), now, 0.04);
    this.voice.bowNoiseGain.gain.setTargetAtTime(0.003 + energy * 0.0046, now, 0.035);
    this.voice.bowNoiseFilter.frequency.setTargetAtTime(1120 + energy * 670, now, 0.055);
    this.voice.bodyWarmth.frequency.setTargetAtTime(2700 + energy * 900, now, 0.07);
    this.voice.middleBody.frequency.setTargetAtTime(850 + energy * 95, now, 0.08);
  }

  endTone() {
    if (!this.context || !this.voice) return;
    const voice = this.voice;
    const now = this.context.currentTime;
    voice.envelope.gain.cancelScheduledValues(now);
    voice.envelope.gain.setValueAtTime(Math.max(0.0001, voice.envelope.gain.value), now);
    voice.envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    for (const source of [voice.stringTone, voice.edgeTone, voice.vibrato, voice.bowNoise]) {
      try { source.stop(now + 0.24); } catch { /* source has already ended */ }
    }
    this.voice = null;
  }

  createContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContextClass();

    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 16;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.007;
    compressor.release.value = 0.2;

    const finalTone = this.context.createBiquadFilter();
    finalTone.type = "lowpass";
    finalTone.frequency.value = 5200;
    finalTone.Q.value = 0.35;

    this.output = this.context.createGain();
    this.output.gain.value = this.muted ? 0.0001 : 0.64;
    this.output.connect(compressor);
    compressor.connect(finalTone);
    finalTone.connect(this.context.destination);

    const frames = Math.floor(this.context.sampleRate * 1.2);
    this.noiseBuffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const channel = this.noiseBuffer.getChannelData(0);
    let brown = 0;
    for (let index = 0; index < frames; index += 1) {
      const white = Math.random() * 2 - 1;
      brown = brown * 0.965 + white * 0.035;
      channel[index] = clamp(brown * 2.7 + white * 0.08, -1, 1);
    }
  }

  createErhuWave() {
    const real = new Float32Array(15);
    const imag = new Float32Array(15);
    imag[1] = 0.94;
    imag[2] = 0.1;
    imag[3] = 0.27;
    imag[4] = 0.055;
    imag[5] = 0.12;
    imag[6] = 0.035;
    imag[7] = 0.064;
    imag[8] = 0.026;
    imag[9] = 0.035;
    imag[10] = 0.018;
    imag[11] = 0.022;
    imag[13] = 0.012;
    return this.context.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  createBowCurve() {
    const samples = 1024;
    const curve = new Float32Array(samples);
    for (let index = 0; index < samples; index += 1) {
      const x = (index * 2) / (samples - 1) - 1;
      curve[index] = Math.tanh(x * 1.65) * 0.87 + x * 0.13;
    }
    return curve;
  }

  level(intensity) {
    return 0.112 * clamp(intensity, 0.28, 1);
  }
}
