const CHORDS = Object.freeze([
  [110, 164.81, 220],
  [98, 146.83, 196],
  [130.81, 196, 261.63],
  [87.31, 130.81, 174.61]
]);

export class AmbientAudio {
  constructor(audioWindow = window) {
    this.audioWindow = audioWindow;
    this.context = null;
    this.master = null;
    this.voices = [];
    this.enabled = false;
    this.chordIndex = 0;
    this.nextChordAt = 0;
  }

  async toggle() {
    const Context = this.audioWindow.AudioContext || this.audioWindow.webkitAudioContext;
    if (!Context) return false;
    if (!this.context) {
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
    this.enabled = !this.enabled;
    const now = this.context.currentTime;
    if (this.enabled) {
      this.startVoices(now);
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(.42, now, 1.4);
      this.nextChordAt = now + 11;
    } else {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0, now, .45);
      this.stopVoices(now + 2.5);
    }
    return this.enabled;
  }

  startVoices(now) {
    this.stopVoices(now);
    this.voices = CHORDS[0].map((frequency, index) => {
      const oscillator = this.context.createOscillator();
      const voiceGain = this.context.createGain();
      oscillator.type = index === 1 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      voiceGain.gain.value = index === 1 ? .11 : .075;
      oscillator.connect(voiceGain);
      voiceGain.connect(this.master);
      oscillator.start(now);
      return { oscillator, voiceGain };
    });
    this.chordIndex = 0;
  }

  stopVoices(stopAt) {
    for (const voice of this.voices) {
      try {
        voice.oscillator.stop(stopAt);
      } catch {
        // An oscillator can already be scheduled to stop when toggled quickly.
      }
    }
    this.voices = [];
  }

  update() {
    if (!this.enabled || !this.context || this.context.currentTime < this.nextChordAt) return;
    this.chordIndex = (this.chordIndex + 1) % CHORDS.length;
    const now = this.context.currentTime;
    const chord = CHORDS[this.chordIndex];
    for (let index = 0; index < this.voices.length; index++) {
      this.voices[index].oscillator.frequency.setTargetAtTime(chord[index], now, 2.8);
    }
    this.nextChordAt = now + 11;
  }

  play(frequency, duration = .16, type = "sine", volume = .025) {
    if (!this.context || this.context.state !== "running") return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
