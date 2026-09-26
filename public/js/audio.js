/**
 * Audio Harmonic Engine (Web Audio API)
 * Progressive acoustic tone synthesizer providing pleasant, non-jarring cues
 * replacing openpilot's sudden binary alarm before torque saturation.
 */

class AudioHarmonicEngine {
  constructor() {
    this.ctx = null;
    this.osc1 = null;
    this.osc2 = null;
    this.gainNode = null;
    this.filterNode = null;
    this.isPlaying = false;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    // Dual oscillator setup for pleasant harmonic tone
    this.osc1 = this.ctx.createOscillator();
    this.osc2 = this.ctx.createOscillator();
    this.gainNode = this.ctx.createGain();
    this.filterNode = this.ctx.createBiquadFilter();

    this.osc1.type = 'sine';
    this.osc2.type = 'triangle';
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.setValueAtTime(600, this.ctx.currentTime);

    this.gainNode.gain.setValueAtTime(0.0001, this.ctx.currentTime);

    this.osc1.connect(this.gainNode);
    this.osc2.connect(this.gainNode);
    this.gainNode.connect(this.filterNode);
    this.filterNode.connect(this.ctx.destination);

    this.osc1.start();
    this.osc2.start();
    this.isPlaying = true;
  }

  update(frequencyHz, volume, audioEnabled = true) {
    if (!audioEnabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    if (frequencyHz > 0 && volume > 0) {
      // Gentle harmonic glide
      this.osc1.frequency.setTargetAtTime(frequencyHz, now, 0.08);
      this.osc2.frequency.setTargetAtTime(frequencyHz * 1.5, now, 0.08); // Perfect fifth harmonic
      this.gainNode.gain.setTargetAtTime(Math.min(0.25, volume * 0.25), now, 0.08);
    } else {
      this.gainNode.gain.setTargetAtTime(0.0001, now, 0.15);
    }
  }

  mute() {
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
    }
  }
}

window.AudioHarmonicEngine = AudioHarmonicEngine;
