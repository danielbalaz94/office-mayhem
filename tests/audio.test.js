import test from "node:test";
import assert from "node:assert/strict";
import { AmbientAudio } from "../src/audio.js";

class FakeParameter {
  constructor() {
    this.value = 0;
    this.targets = [];
  }

  setValueAtTime(value, time) {
    this.value = value;
    this.lastSetAt = time;
  }

  setTargetAtTime(value, time, constant) {
    this.targets.push({ value, time, constant });
    this.value = value;
  }

  cancelScheduledValues(time) {
    this.cancelledAt = time;
  }

  exponentialRampToValueAtTime(value, time) {
    this.ramp = { value, time };
  }
}

class FakeContext {
  constructor() {
    this.state = "running";
    this.currentTime = 0;
    this.destination = {};
    this.oscillators = [];
  }

  createGain() {
    return { gain: new FakeParameter(), connect(node) { this.destination = node; } };
  }

  createOscillator() {
    const oscillator = {
      frequency: new FakeParameter(),
      connect(node) { this.destination = node; },
      start(time) { this.startedAt = time; },
      stop(time) { this.stoppedAt = time; }
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }
}

test("ambient toggle creates a slow pad, changes chords gradually, and fades out", async () => {
  const context = new FakeContext();
  const audio = new AmbientAudio({ AudioContext: class { constructor() { return context; } } });
  assert.equal(await audio.toggle(), true);
  assert.equal(audio.voices.length, 3);
  assert.equal(audio.master.gain.targets.at(-1).constant, 1.4);

  context.currentTime = 12;
  audio.update();
  assert.equal(audio.voices[0].oscillator.frequency.targets.at(-1).constant, 2.8);

  assert.equal(await audio.toggle(), false);
  assert.equal(audio.master.gain.targets.at(-1).value, 0);
  assert.equal(context.oscillators[0].stoppedAt, 14.5);
});

test("sound effects remain separate from the ambient mute control", async () => {
  const context = new FakeContext();
  const audio = new AmbientAudio({ AudioContext: class { constructor() { return context; } } });
  await audio.toggle();
  await audio.toggle();
  audio.play(440);
  const effect = context.oscillators.at(-1);
  assert.equal(effect.destination.destination, context.destination);
});

test("audio controls report when the browser has no Web Audio support", async () => {
  const audio = new AmbientAudio({});
  assert.equal(await audio.toggle(), false);
  assert.equal(audio.enabled, false);
});
