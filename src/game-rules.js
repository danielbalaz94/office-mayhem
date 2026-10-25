export const MISSION_COUNT = 9;
export const PROGRESS_STORAGE_KEY = "office-mayhem-campaign-v3";
export const LEGACY_PROGRESS_STORAGE_KEY = "office-mayhem-campaign-v2";

export const TASKS = Object.freeze([
  "phone", "reports", "phone", "reports", "phone", "reports",
  "printer", "sorting", "pests"
]);

export const TASK_LABELS = Object.freeze({
  phone: "Silence ringing phones",
  reports: "File yellow report mugs",
  printer: "Unjam the printer in order",
  sorting: "Sort documents into matching trays",
  pests: "Protect the fern from pests"
});

const TITLES = Object.freeze([
  ["Fern & Furious", "The Inbox Incident", "Quiet Quitting, Loud Phone"],
  ["The Notification Nation", "Aloe, Is It Me?", "The Spreadsheet Sprint"],
  ["The Meeting That Could Be a Mug", "Desk Jungle Rescue", "Ring Ring, It’s Chaos"],
  ["Quarterly Fern Review", "The Ping Parade", "Operation: Mugshot"],
  ["The Great Office Reset", "A Very Busy Break", "The Final Inbox"],
  ["The Chief Beverage Finale", "The Last Great Desk Escape", "Fernageddon"],
  ["Paper Jam Jamboree", "Printer? I Hardly Know Her", "The Toner Identity"],
  ["Inbox Tetris", "The Document Olympics", "Sort of a Big Deal"],
  ["Pest Employee of the Month", "Fernageddon II", "The Bug Meeting"]
]);

function assertMissionIndex(missionIndex) {
  if (!Number.isInteger(missionIndex) || missionIndex < 0 || missionIndex >= MISSION_COUNT) {
    throw new RangeError(`Mission index must be between 0 and ${MISSION_COUNT - 1}.`);
  }
}

export function createSeededRandom(seed) {
  let state = Number(seed) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMission(missionIndex, careerPoints = 0, seed = missionIndex + 1) {
  assertMissionIndex(missionIndex);
  const random = createSeededRandom(seed);
  const points = Number.isFinite(careerPoints) ? Math.max(0, careerPoints) : 0;
  const difficultyTier = Math.min(2, Math.floor(points / 60));
  const taskKind = TASKS[missionIndex];
  const title = TITLES[missionIndex][Math.floor(random() * TITLES[missionIndex].length)];
  const taskGoal = {
    phone: 1 + Math.floor(missionIndex / 2),
    reports: 2 + Math.floor(missionIndex / 3),
    printer: 3,
    sorting: 3,
    pests: 4
  }[taskKind];
  const sortingSequence = taskKind === "sorting"
    ? Array.from({ length: taskGoal }, () => Math.floor(random() * 3))
    : [];

  return Object.freeze({
    index: missionIndex,
    title,
    durationSeconds: 68 + missionIndex * 4 + Math.floor(random() * 5),
    coffeeGoal: 5 + missionIndex + Math.floor(random() * 2),
    waterGoal: 1,
    taskKind,
    taskGoal,
    sortingSequence: Object.freeze(sortingSequence),
    difficultyTier,
    spawnInterval: Math.max(.62, 1.22 - missionIndex * .045 - difficultyTier * .075 - random() * .04),
    maxTargets: 3 + Math.floor(missionIndex / 3) + difficultyTier,
    speedMultiplier: .78 + missionIndex * .05 + difficultyTier * .11 + random() * .04,
    bonusSpeedMultiplier: 1.32 + missionIndex * .04 + difficultyTier * .07 + random() * .15,
    phoneExpiryPenalty: 3 + difficultyTier
  });
}

export function createEmptyProgress() {
  return {
    careerPoints: 0,
    bestScores: Array(MISSION_COUNT).fill(0),
    completedMissions: [],
    perfectMissions: [],
    earnedBadges: [],
    legacyUnlockedMissions: []
  };
}

function validMissionIndices(values) {
  return Array.isArray(values)
    ? [...new Set(values.filter(index => Number.isInteger(index) && index >= 0 && index < MISSION_COUNT))]
    : [];
}

export function sanitizeProgress(candidate) {
  const empty = createEmptyProgress();
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return empty;

  const careerPoints = Number.isSafeInteger(candidate.careerPoints) && candidate.careerPoints >= 0
    ? candidate.careerPoints
    : 0;
  const bestScores = Array.isArray(candidate.bestScores)
    ? Array.from({ length: MISSION_COUNT }, (_, index) => {
      const value = candidate.bestScores[index];
      return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    })
    : empty.bestScores;
  const earnedBadges = Array.isArray(candidate.earnedBadges)
    ? [...new Set(candidate.earnedBadges.filter(value => typeof value === "string" && value.length <= 80))]
    : [];
  return {
    careerPoints,
    bestScores,
    completedMissions: validMissionIndices(candidate.completedMissions),
    perfectMissions: validMissionIndices(candidate.perfectMissions),
    earnedBadges,
    legacyUnlockedMissions: validMissionIndices(candidate.legacyUnlockedMissions)
  };
}

export function migrateLegacyProgress(candidate) {
  const progress = sanitizeProgress(candidate);
  const oldThresholds = [0, 12, 30, 52, 78, 110];
  let oldUnlockedCount = 1;
  for (let index = 1; index < oldThresholds.length; index++) {
    if (progress.careerPoints < oldThresholds[index]) break;
    oldUnlockedCount++;
  }
  return {
    ...progress,
    legacyUnlockedMissions: [...new Set([
      ...progress.legacyUnlockedMissions,
      ...Array.from({ length: oldUnlockedCount - 1 }, (_, index) => index + 1)
    ])]
  };
}

export function getUnlockedMissionIndices(progress) {
  const current = sanitizeProgress(progress);
  const unlocked = new Set([0, ...current.legacyUnlockedMissions]);
  for (let index = 0; index < MISSION_COUNT - 1; index++) {
    if (current.completedMissions.includes(index)) unlocked.add(index + 1);
  }
  return [...unlocked].sort((left, right) => left - right);
}

export function isMissionUnlocked(missionIndex, progress) {
  assertMissionIndex(missionIndex);
  return getUnlockedMissionIndices(progress).includes(missionIndex);
}

export function getAdjacentMissionIndex(currentIndex, direction, progress) {
  assertMissionIndex(currentIndex);
  if (direction !== -1 && direction !== 1) throw new RangeError("Mission direction must be -1 or 1.");
  const unlocked = getUnlockedMissionIndices(progress);
  const candidates = unlocked.filter(index => direction < 0
    ? index < currentIndex
    : index > currentIndex);
  if (direction < 0) candidates.reverse();
  return candidates[0];
}

export function getMissionBadges(missionIndex, completed, incidents) {
  assertMissionIndex(missionIndex);
  if (!completed) return [];
  const badges = [`mission-${missionIndex}-complete`];
  if (incidents === 0) badges.push(`incident-free-${missionIndex}`);
  if (missionIndex === MISSION_COUNT - 1) badges.push("campaign-complete");
  return badges;
}

export function getTargetSpeed(baseSpeed, mission, kind, golden = false) {
  if (!Number.isFinite(baseSpeed) || baseSpeed < 0) {
    throw new RangeError("Target base speed must be a non-negative number.");
  }
  if (!["hot", "cold", "report", "phone"].includes(kind)) {
    throw new RangeError(`Unknown target kind: ${kind}`);
  }
  const bonus = golden || kind === "report" || kind === "phone";
  return baseSpeed * mission.speedMultiplier * (bonus ? mission.bonusSpeedMultiplier : 1);
}

export function chooseTargetKind(roll, taskKind, taskPending, nonHotStreak = 0) {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError("Target roll must be between 0 (inclusive) and 1 (exclusive).");
  }
  if (!Number.isInteger(nonHotStreak) || nonHotStreak < 0) {
    throw new RangeError("Non-hot target streak must be a non-negative integer.");
  }
  if (nonHotStreak >= 2) return "hot";

  const missionTarget = taskPending && taskKind === "phone"
    ? "phone"
    : taskPending && taskKind === "reports"
      ? "report"
      : null;
  const missionTargetChance = missionTarget ? .28 : 0;
  if (missionTarget && roll < missionTargetChance) return missionTarget;

  const regularRoll = (roll - missionTargetChance) / (1 - missionTargetChance);
  if (regularRoll < .15) return "cold";
  if (regularRoll < .28) return "report";
  if (regularRoll < .41) return "phone";
  return "hot";
}

export function recordMissionResult(progress, missionIndex, score, completed = true, incidents = 0) {
  assertMissionIndex(missionIndex);
  if (!Number.isSafeInteger(score) || score < 0) {
    throw new RangeError("Mission score must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(incidents) || incidents < 0) {
    throw new RangeError("Incident count must be a non-negative safe integer.");
  }
  const current = sanitizeProgress(progress);
  const bestScores = [...current.bestScores];
  bestScores[missionIndex] = Math.max(bestScores[missionIndex], score);
  const completedMissions = completed && !current.completedMissions.includes(missionIndex)
    ? [...current.completedMissions, missionIndex]
    : current.completedMissions;
  const perfectMissions = completed && incidents === 0 && !current.perfectMissions.includes(missionIndex)
    ? [...current.perfectMissions, missionIndex]
    : current.perfectMissions;
  const earnedBadges = [...new Set([
    ...current.earnedBadges,
    ...getMissionBadges(missionIndex, completed, incidents)
  ])];
  return {
    ...current,
    careerPoints: current.careerPoints + score,
    bestScores,
    completedMissions,
    perfectMissions,
    earnedBadges
  };
}

export function applyTargetHit(kind, golden = false) {
  switch (kind) {
    case "hot":
      return { points: golden ? 3 : 1, timeDelta: 0, incidents: 0, progress: "coffee" };
    case "cold":
      return { points: 0, timeDelta: -2, incidents: 1, progress: null };
    case "report":
      return { points: 2, timeDelta: 1.5, incidents: 0, progress: "reports" };
    case "phone":
      return { points: 3, timeDelta: 1, incidents: 0, progress: "phone" };
    case "bug":
      return { points: 2, timeDelta: 0, incidents: 0, progress: "pests" };
    default:
      throw new RangeError(`Unknown target kind: ${kind}`);
  }
}

export function applyTargetExpiry(kind, mission) {
  if (kind === "phone") {
    return { timeDelta: -mission.phoneExpiryPenalty, incidents: 1 };
  }
  if (kind === "bug") return { timeDelta: -2, incidents: 1 };
  return { timeDelta: 0, incidents: kind === "hot" ? 1 : 0 };
}

export function isMissionComplete(mission, progress) {
  return progress.coffee >= mission.coffeeGoal &&
    progress.water >= mission.waterGoal &&
    progress[mission.taskKind] >= mission.taskGoal;
}

export function clampMissionTime(currentTime, timeDelta, duration) {
  return Math.min(duration, Math.max(0, currentTime + timeDelta));
}

export function getMissionEndState(missionIndex, completed) {
  assertMissionIndex(missionIndex);
  if (!completed) return "failed";
  return missionIndex === MISSION_COUNT - 1 ? "campaignComplete" : "missionComplete";
}
