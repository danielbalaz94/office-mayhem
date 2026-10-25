const MELODY = Object.freeze([
  659.25, 783.99, 987.77, 783.99, 587.33, 698.46, 880, 698.46,
  523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 1046.5
]);
const CHORDS = Object.freeze([
  [110, 164.81, 220],
  [98, 146.83, 196],
  [130.81, 196, 261.63],
  [87.31, 130.81, 174.61]
]);
const NOTE_INTERVAL = .36;

export class GameAudio {
  constructor(audioWindow = window) {
    this.audioWindow = audioWindow;
    this.context = null;
    this.master = null;
    this.volume = .65;
    this.musicEnabled = false;
    this.noteIndex = 0;
    this.nextNoteAt = 0;
  }

  ensureContext() {
    const Context = this.audioWindow.AudioContext || this.audioWindow.webkitAudioContext;
    if (!Context) return false;
    if (!this.context) {
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
    }
    return true;
  }

  async prepare() {
    if (!this.ensureContext()) return false;
    if (this.context.state === "suspended") await this.context.resume();
    return true;
  }

  async toggleMusic() {
    if (!await this.prepare()) return false;
    this.musicEnabled = !this.musicEnabled;
    if (this.musicEnabled) {
      this.noteIndex = 0;
      this.nextNoteAt = this.context.currentTime + .05;
    }
    return this.musicEnabled;
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master) {
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, .03);
    }
  }

  update() {
    if (!this.musicEnabled || !this.context || this.context.state !== "running") return;
    while (this.nextNoteAt < this.context.currentTime + .12) {
      const noteIndex = this.noteIndex % MELODY.length;
      const noteAt = this.nextNoteAt;
      const melodyNote = MELODY[noteIndex] / 2;
      this.play(melodyNote, .32, "sine", .022, noteAt);
      this.play(melodyNote, .3, "triangle", .006, noteAt);
      if (noteIndex % 4 === 0) {
        for (const frequency of CHORDS[Math.floor(noteIndex / 4)]) {
          this.play(frequency, 1.25, "sine", .008, noteAt);
        }
      }
      this.nextNoteAt += NOTE_INTERVAL;
      this.noteIndex++;
    }
  }

  playWaterRequest() {
    this.playSequence([784, 1046.5], .13, .18, .045);
  }

  playMissionComplete() {
    this.playSequence([523.25, 659.25, 783.99, 1046.5], .12, .24, .05);
  }

  playSequence(notes, spacing, duration, volume) {
    if (!this.context || this.context.state !== "running") return;
    const startAt = this.context.currentTime;
    notes.forEach((frequency, index) => {
      this.play(frequency, duration, "triangle", volume, startAt + index * spacing);
    });
  }

  play(frequency, duration = .16, type = "sine", volume = .025, startAt = this.context?.currentTime) {
    if (!this.context || this.context.state !== "running" || startAt === undefined) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(volume, startAt);
    gain.gain.exponentialRampToValueAtTime(.001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration);
  }
}
