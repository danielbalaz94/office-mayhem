import test from "node:test";
import assert from "node:assert/strict";
import { GameAudio } from "../src/audio.js";

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

function createAudio(context = new FakeContext()) {
  return new GameAudio({ AudioContext: class { constructor() { return context; } } });
}

test("music is opt-in with a slower warm arrangement of the original melody", async () => {
  const context = new FakeContext();
  const audio = createAudio(context);
  assert.equal(audio.musicEnabled, false);
  assert.equal(await audio.toggleMusic(), true);
  audio.update();
  assert.equal(context.oscillators[0].frequency.value, 659.25 / 2);
  assert.equal(context.oscillators[0].type, "sine");
  assert.equal(context.oscillators[0].destination.destination, audio.master);
  assert.equal(Number((audio.nextNoteAt - .05).toFixed(2)), .36);
  assert.deepEqual(context.oscillators.slice(2, 5).map(oscillator => oscillator.frequency.value), [110, 164.81, 220]);

  context.currentTime = .4;
  audio.update();
  const secondMelodyNote = context.oscillators.find(oscillator =>
    oscillator.frequency.value === 783.99 / 2 && oscillator.startedAt > .05);
  assert.ok(secondMelodyNote);
  assert.ok(Math.abs(secondMelodyNote.startedAt - .41) < .001);
  assert.equal(await audio.toggleMusic(), false);
  const scheduledCount = context.oscillators.length;
  context.currentTime = 1;
  audio.update();
  assert.equal(context.oscillators.length, scheduledCount);
});

test("master volume controls locally generated music and sound effects", async () => {
  const context = new FakeContext();
  const audio = createAudio(context);
  audio.setVolume(.4);
  await audio.prepare();
  assert.equal(audio.master.gain.value, .4);
  audio.setVolume(.4);
  audio.play(440);
  const effect = context.oscillators.at(-1);
  assert.equal(effect.destination.destination, audio.master);
  assert.equal(audio.master.gain.targets.at(-1).value, .4);
});

test("plant request and mission completion cues use generated tones", async () => {
  const context = new FakeContext();
  const audio = createAudio(context);
  await audio.prepare();
  audio.playWaterRequest();
  assert.deepEqual(context.oscillators.map(oscillator => oscillator.frequency.value), [784, 1046.5]);

  context.oscillators.length = 0;
  audio.playMissionComplete();
  assert.deepEqual(context.oscillators.map(oscillator => oscillator.frequency.value), [523.25, 659.25, 783.99, 1046.5]);
  assert.ok(context.oscillators.every(oscillator => oscillator.destination.destination === audio.master));
});

test("audio controls report when the browser has no Web Audio support", async () => {
  const audio = new GameAudio({});
  assert.equal(await audio.toggleMusic(), false);
  assert.equal(audio.musicEnabled, false);
});
