import test from "node:test";
import assert from "node:assert/strict";
import {
  MISSION_COUNT,
  UNLOCK_THRESHOLDS,
  applyTargetExpiry,
  applyTargetHit,
  clampMissionTime,
  createEmptyProgress,
  createMission,
  getMissionEndState,
  getUnlockedMissionCount,
  isMissionComplete,
  recordMissionResult,
  sanitizeProgress
} from "../src/game-rules.js";

test("procedural missions are deterministic for the same result and seed", () => {
  assert.deepEqual(createMission(2, 40, 1234), createMission(2, 40, 1234));
  const variants = new Set(Array.from({ length: 20 }, (_, seed) =>
    JSON.stringify(createMission(2, 40, seed + 1))));
  assert.ok(variants.size > 1);
  assert.ok(new Set([...variants].map(value => JSON.parse(value).durationSeconds)).size > 1);
});

test("later missions last longer and raise coffee/watering goals", () => {
  const first = createMission(0, 0, 9);
  const final = createMission(MISSION_COUNT - 1, 0, 9);
  assert.ok(final.durationSeconds > first.durationSeconds);
  assert.ok(final.coffeeGoal > first.coffeeGoal);
  assert.ok(final.waterGoal > first.waterGoal);
});

test("stronger career results procedurally increase difficulty", () => {
  const early = createMission(2, 0, 8);
  const successful = createMission(2, 100, 8);
  assert.ok(successful.difficultyTier > early.difficultyTier);
  assert.ok(successful.speedMultiplier > early.speedMultiplier);
  assert.ok(successful.spawnInterval < early.spawnInterval);
  assert.ok(successful.bonusSpeedMultiplier > successful.speedMultiplier);
});

test("invalid mission indices are rejected", () => {
  assert.throws(() => createMission(-1), RangeError);
  assert.throws(() => createMission(MISSION_COUNT), RangeError);
});

test("score thresholds unlock missions without skipping the first", () => {
  assert.equal(getUnlockedMissionCount(-20), 1);
  assert.equal(getUnlockedMissionCount(UNLOCK_THRESHOLDS[1] - 1), 1);
  assert.equal(getUnlockedMissionCount(UNLOCK_THRESHOLDS[1]), 2);
  assert.equal(getUnlockedMissionCount(UNLOCK_THRESHOLDS.at(-1)), MISSION_COUNT);
});

test("mission results accumulate career points, retain best scores, and record completion once", () => {
  const first = recordMissionResult(createEmptyProgress(), 0, 15);
  const replay = recordMissionResult(first, 0, 4);
  assert.equal(replay.careerPoints, 19);
  assert.equal(replay.bestScores[0], 15);
  assert.deepEqual(replay.completedMissions, [0]);
  const failed = recordMissionResult(replay, 1, 7, false);
  assert.equal(failed.careerPoints, 26);
  assert.deepEqual(failed.completedMissions, [0]);
  assert.throws(() => recordMissionResult(first, 1, -2), RangeError);
});

test("saved campaign data is sanitized before use", () => {
  assert.deepEqual(sanitizeProgress({ careerPoints: 17, bestScores: [4, -1], completedMissions: [1, 1, 99, "2"] }), {
    careerPoints: 17,
    bestScores: [4, 0, 0, 0, 0, 0],
    completedMissions: [1]
  });
  assert.deepEqual(sanitizeProgress(null), createEmptyProgress());
});

test("coffee, report, phone, and iced targets have distinct tested rewards", () => {
  assert.deepEqual(applyTargetHit("hot"), { points: 1, timeDelta: 0, incidents: 0, progress: "coffee" });
  assert.equal(applyTargetHit("hot", true).points, 3);
  assert.equal(applyTargetHit("cold").timeDelta, -2);
  assert.equal(applyTargetHit("report").progress, "reports");
  assert.equal(applyTargetHit("phone").progress, "phone");
  assert.throws(() => applyTargetHit("mystery"), RangeError);
});

test("ignoring a ringing phone costs more time on harder missions", () => {
  const easy = createMission(0, 0, 1);
  const hard = createMission(4, 120, 1);
  assert.equal(applyTargetExpiry("phone", easy).timeDelta, -easy.phoneExpiryPenalty);
  assert.ok(applyTargetExpiry("phone", hard).timeDelta < applyTargetExpiry("phone", easy).timeDelta);
  assert.equal(applyTargetExpiry("hot", easy).incidents, 1);
});

test("a mission requires coffee, watering, and its generated side task", () => {
  const mission = createMission(2, 20, 77);
  const progress = { coffee: mission.coffeeGoal, water: mission.waterGoal, [mission.taskKind]: mission.taskGoal };
  assert.equal(isMissionComplete(mission, progress), true);
  assert.equal(isMissionComplete(mission, { ...progress, water: mission.waterGoal - 1 }), false);
  assert.equal(isMissionComplete(mission, { ...progress, [mission.taskKind]: mission.taskGoal - 1 }), false);
});

test("mission time rewards never exceed the mission duration or go below zero", () => {
  assert.equal(clampMissionTime(64, 5, 65), 65);
  assert.equal(clampMissionTime(1, -3, 65), 0);
  assert.equal(clampMissionTime(20, 4, 65), 24);
});

test("only a completed final mission ends the campaign", () => {
  assert.equal(getMissionEndState(0, true), "missionComplete");
  assert.equal(getMissionEndState(MISSION_COUNT - 1, true), "campaignComplete");
  assert.equal(getMissionEndState(MISSION_COUNT - 1, false), "failed");
});
