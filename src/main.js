import { AmbientAudio } from "./audio.js";
import { REPORT_PALETTE } from "./palette.js";
import {
  MISSION_COUNT,
  PROGRESS_STORAGE_KEY,
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
} from "./game-rules.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const nodes = {
  score: document.querySelector("#score"),
  caught: document.querySelector("#caught"),
  time: document.querySelector("#time"),
  incidents: document.querySelector("#incidents"),
  level: document.querySelector("#level"),
  missionTitle: document.querySelector("#missionTitle"),
  taskCopy: document.querySelector("#taskCopy"),
  progress: document.querySelector("#progress"),
  progressTrack: document.querySelector("#progressTrack"),
  taskDetail: document.querySelector("#taskDetail"),
  missionSelect: document.querySelector("#missionSelect"),
  missionHint: document.querySelector("#missionHint"),
  water: document.querySelector("#water"),
  message: document.querySelector("#message"),
  start: document.querySelector("#start"),
  music: document.querySelector("#music")
};
const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const targets = [];
const particles = [];
const audio = new AmbientAudio();
const coffeeQuips = [
  "Caffeine secured. Your hands are union-approved!",
  "Excellent temperature discrimination!",
  "Your manager is pretending not to be impressed.",
  "That coffee had a meeting to get to.",
  "The office fern believes in you."
];
const state = {
  mode: "ready",
  selectedIndex: 0,
  mission: createMission(0, 0, 101),
  progress: loadProgress(),
  score: 0,
  incidents: 0,
  timeLeft: 65,
  task: { coffee: 0, water: 0, phone: 0, reports: 0 },
  spawnClock: 0,
  lastFrame: 0,
  messageClock: 0,
  shake: 0,
  fernWetUntil: 0
};

function loadProgress() {
  const stored = localStorage.getItem(PROGRESS_STORAGE_KEY);
  if (!stored) return createEmptyProgress();
  try {
    return sanitizeProgress(JSON.parse(stored));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    console.warn("Saved Office Mayhem progress was invalid; starting a clean campaign.", error);
    return createEmptyProgress();
  }
}

function saveProgress(completed) {
  const next = recordMissionResult(state.progress, state.mission.index, state.score, completed);
  state.progress = next;
  let saved = true;
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error("Could not save Office Mayhem campaign progress.", error);
    saved = false;
  }
  updateMissionPicker();
  return saved;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function setMessage(text, seconds = 2.3) {
  nodes.message.textContent = text;
  state.messageClock = seconds;
}

function formatTaskHint() {
  const { mission, task } = state;
  const side = mission.taskKind === "phone"
    ? `Silence ringing phones (${task.phone}/${mission.taskGoal})`
    : `File yellow reports (${task.reports}/${mission.taskGoal})`;
  return `Water the fern (${task.water}/${mission.waterGoal}) · ${side}`;
}

function updateMissionPicker() {
  const unlockedCount = getUnlockedMissionCount(state.progress.careerPoints);
  nodes.missionSelect.replaceChildren();
  for (let index = 0; index < MISSION_COUNT; index++) {
    const threshold = UNLOCK_THRESHOLDS[index];
    const option = document.createElement("option");
    option.value = String(index);
    option.disabled = index >= unlockedCount;
    option.textContent = index < unlockedCount
      ? `Mission ${index + 1} · Best ${state.progress.bestScores[index]}`
      : `Mission ${index + 1} · Locked (${threshold} career points)`;
    nodes.missionSelect.append(option);
  }
  if (state.selectedIndex >= unlockedCount) state.selectedIndex = 0;
  nodes.missionSelect.value = String(state.selectedIndex);
  updateMissionDescription();
}

function updateMissionDescription() {
  const preview = state.mission;
  nodes.missionHint.textContent = `${preview.durationSeconds}s · ${preview.coffeeGoal} hot coffees · ${preview.taskKind === "phone" ? "phone triage" : "report filing"} · tier ${preview.difficultyTier + 1}`;
}

function updateHud() {
  const { mission, task } = state;
  nodes.score.textContent = String(state.score).padStart(2, "0");
  nodes.caught.textContent = `${task.coffee}/${mission.coffeeGoal}`;
  nodes.time.textContent = String(Math.ceil(Math.max(0, state.timeLeft))).padStart(2, "0");
  nodes.time.classList.toggle("time-low", state.mode === "running" && state.timeLeft <= 10);
  nodes.incidents.textContent = String(state.incidents);
  nodes.level.textContent = `${mission.index + 1}/${MISSION_COUNT}`;
  nodes.missionSelect.disabled = state.mode === "running";
  nodes.missionTitle.textContent = `Mission ${mission.index + 1} · ${mission.title}`;
  nodes.taskCopy.textContent = `Catch ${mission.coffeeGoal} hot coffees`;
  nodes.progressTrack.setAttribute("aria-valuemax", String(mission.coffeeGoal));
  nodes.progressTrack.setAttribute("aria-valuenow", String(task.coffee));
  nodes.progress.style.width = `${Math.min(100, task.coffee / mission.coffeeGoal * 100)}%`;
  nodes.taskDetail.textContent = formatTaskHint();
  nodes.water.hidden = state.mode !== "running" || task.water >= mission.waterGoal;
  nodes.water.textContent = `Water fern · ${task.water}/${mission.waterGoal}`;
}

function selectMission(index) {
  const unlockedCount = getUnlockedMissionCount(state.progress.careerPoints);
  if (!Number.isInteger(index) || index < 0 || index >= unlockedCount) return;
  state.selectedIndex = index;
  state.mission = createMission(index, state.progress.careerPoints, crypto.getRandomValues(new Uint32Array(1))[0]);
  updateMissionDescription();
  updateHud();
}

function startMission() {
  const requestedIndex = Number(nodes.missionSelect.value);
  if (requestedIndex !== state.selectedIndex) selectMission(requestedIndex);
  state.mission = createMission(state.selectedIndex, state.progress.careerPoints, crypto.getRandomValues(new Uint32Array(1))[0]);
  updateMissionDescription();
  state.score = 0;
  state.incidents = 0;
  state.timeLeft = state.mission.durationSeconds;
  state.task = { coffee: 0, water: 0, phone: 0, reports: 0 };
  state.spawnClock = 0;
  state.fernWetUntil = 0;
  targets.length = 0;
  particles.length = 0;
  state.mode = "running";
  nodes.start.textContent = "Restart mission";
  setMessage("Go! The phones are buzzing and the fern has a calendar invite.", 3);
  updateHud();
  canvas.focus({ preventScroll: true });
}

function persistAndFinish(completed) {
  const saved = saveProgress(completed);
  state.mode = getMissionEndState(state.mission.index, completed);
  nodes.start.textContent = state.mode === "campaignComplete" ? "Replay a mission" : "Play this mission again";
  state.timeLeft = Math.max(0, state.timeLeft);
  targets.length = 0;
  updateHud();
  if (state.mode === "campaignComplete") {
    setMessage(`Campaign complete! You are Chief of Everything. The fern gets your office.${saved ? "" : " Progress could not be saved."}`, 99);
  } else if (state.mode === "missionComplete") {
    setMessage(`Mission complete! Pick any unlocked mission or keep earning points.${saved ? "" : " Progress could not be saved."}`, 99);
  } else {
    setMessage(`Shift over. The phone is still ringing, but at least the fern is hydrated.${saved ? "" : " Progress could not be saved."}`, 99);
  }
}

function tryCompleteMission() {
  if (state.mode === "running" && isMissionComplete(state.mission, state.task)) {
    persistAndFinish(true);
    return true;
  }
  return false;
}

function waterFern() {
  if (state.mode !== "running" || state.task.water >= state.mission.waterGoal) return;
  state.task.water++;
  state.score += 2;
  state.fernWetUntil = performance.now() + 1800;
  audio.play(523.25, .24, "sine", .035);
  setMessage("Fern watered! It has canceled its performance review.", 2.3);
  updateHud();
  tryCompleteMission();
}

function spawnTarget(now) {
  const { mission, task } = state;
  const canReport = task.reports < mission.taskGoal;
  const canPhone = task.phone < mission.taskGoal;
  const roll = Math.random();
  let kind = "hot";
  if (mission.taskKind === "reports" && canReport && roll < .31) kind = "report";
  else if (mission.taskKind === "phone" && canPhone && roll < .3) kind = "phone";
  else if (roll < .13) kind = "report";
  else if (roll < .25) kind = "phone";
  else if (roll < .5) kind = "cold";
  const golden = kind === "hot" && Math.random() < .13;
  const radius = kind === "phone" ? 24 : kind === "report" ? 27 : golden ? 28 : randomBetween(22, 30);
  const angle = randomBetween(0, Math.PI * 2);
  const bonusMultiplier = golden || kind === "report" || kind === "phone"
    ? mission.bonusSpeedMultiplier
    : 1;
  const speed = randomBetween(70, 110) * mission.speedMultiplier * bonusMultiplier;
  targets.push({
    x: randomBetween(radius + 15, WIDTH - radius - 15),
    y: randomBetween(166 + radius, 378 - radius),
    r: radius,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    wobble: randomBetween(0, Math.PI * 2),
    born: now,
    hue: Math.floor(randomBetween(0, 360)),
    kind,
    golden
  });
}

function drawBackground(now) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#bac9b8");
  sky.addColorStop(.63, "#e4d6b8");
  sky.addColorStop(.64, "#b78c60");
  sky.addColorStop(1, "#92704f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#536861";
  ctx.fillRect(35, 36, 285, 150);
  ctx.fillStyle = "#a8d2c3";
  ctx.fillRect(44, 45, 267, 132);
  ctx.fillStyle = "#83b8aa";
  ctx.beginPath();
  ctx.arc(255, 77, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#80a58b";
  ctx.beginPath();
  ctx.moveTo(44, 163); ctx.lineTo(105, 105); ctx.lineTo(159, 155);
  ctx.lineTo(210, 111); ctx.lineTo(311, 170); ctx.lineTo(311, 177); ctx.lineTo(44, 177);
  ctx.fill();
  ctx.fillStyle = "#536861";
  ctx.fillRect(174, 45, 7, 132);
  ctx.fillRect(44, 107, 267, 7);

  ctx.fillStyle = "#7d6248";
  ctx.fillRect(748, 93, 157, 241);
  ctx.fillStyle = "#a78963";
  ctx.fillRect(758, 104, 137, 104);
  ctx.fillRect(758, 219, 137, 104);
  ctx.fillStyle = "#d9cba8";
  ctx.fillRect(814, 150, 26, 5);
  ctx.fillRect(814, 265, 26, 5);
  ctx.fillStyle = "#705741";
  ctx.fillRect(0, 394, WIDTH, 23);
  ctx.fillStyle = "#664c38";
  ctx.fillRect(0, 417, WIDTH, 123);

  const fernHappy = now < state.fernWetUntil;
  ctx.fillStyle = "#b78c60";
  ctx.fillRect(672, 345, 38, 48);
  ctx.fillStyle = fernHappy ? "#83b85f" : "#658363";
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.translate(691, 351);
    ctx.rotate((i - 2) * .38 + (fernHappy ? Math.sin(now / 100) * .08 : 0));
    ctx.beginPath();
    ctx.ellipse(0, -20, 8, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#534536";
  ctx.font = "bold 15px Trebuchet MS, sans-serif";
  ctx.fillText("Q3 GOALS", 62, 212);
  ctx.font = "12px Trebuchet MS, sans-serif";
  ctx.fillText("1. Catch mugs", 62, 234);
  ctx.fillText("2. Silence phone", 62, 253);
  ctx.fillText("3. Water fern", 62, 272);
  ctx.fillText("it is watching", 76, 289);

  ctx.fillStyle = "#e9e0cc";
  ctx.save();
  ctx.translate(440, 447);
  ctx.rotate(-.05);
  ctx.fillRect(0, 0, 145, 68);
  ctx.fillStyle = "#73847a";
  ctx.font = "bold 13px Trebuchet MS, sans-serif";
  ctx.fillText("URGENT", 12, 22);
  ctx.font = "11px Trebuchet MS, sans-serif";
  ctx.fillText("Re: the other email", 12, 42);
  ctx.restore();
  ctx.fillStyle = "#f7f4e9dd";
  ctx.font = "bold 13px Trebuchet MS, sans-serif";
  ctx.fillText(state.mode === "running" ? "BREAK ROOM INCIDENT IN PROGRESS" : "BREAK ROOM · 9:01 AM", 351, 34);
}

function drawCoffee(target, now) {
  const age = (now - target.born) / 1000;
  const bob = Math.sin(age * 6 + target.wobble) * 4;
  const x = target.x;
  const y = target.y + bob;
  const r = target.r;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(age * 3 + target.wobble) * .12);
  ctx.fillStyle = "#00000028";
  ctx.beginPath();
  ctx.ellipse(3, r * .92, r * .9, r * .24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = target.golden ? "#d39132" : `hsl(${target.hue} 40% 40%)`;
  ctx.lineWidth = r * .24;
  ctx.beginPath();
  ctx.arc(r * .72, -r * .08, r * .42, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.fillStyle = target.golden ? "#d8942f" : `hsl(${target.hue} 43% 48%)`;
  ctx.beginPath();
  ctx.roundRect(-r * .68, -r * .72, r * 1.38, r * 1.48, [5, 5, 11, 11]);
  ctx.fill();
  ctx.fillStyle = target.golden ? "#ffd264" : `hsl(${target.hue} 56% 75%)`;
  ctx.beginPath();
  ctx.roundRect(-r * .76, -r * .78, r * 1.32, r * 1.45, [5, 5, 10, 10]);
  ctx.fill();
  ctx.fillStyle = "#55443a";
  ctx.beginPath();
  ctx.ellipse(-r * .1, -r * .76, r * .62, r * .16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = target.kind === "cold" ? "#8de7f4" : "#694638";
  ctx.beginPath();
  ctx.ellipse(-r * .1, -r * .78, r * .49, r * .105, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#273337";
  ctx.beginPath();
  ctx.arc(-r * .24, -r * .05, r * .075, 0, Math.PI * 2);
  ctx.arc(r * .16, -r * .05, r * .075, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#273337";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-r * .04, r * .12, r * .17, .12, Math.PI - .12);
  ctx.stroke();
  if (target.kind === "cold") {
    ctx.fillStyle = "#d1fbff";
    ctx.font = `bold ${Math.round(r * .76)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("❄", -r * .1, r * .25);
  } else if (target.golden) {
    ctx.fillStyle = "#fff4b0";
    ctx.font = `bold ${Math.round(r * .54)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("★", -r * .1, r * .45);
  }
  ctx.restore();
  if (target.kind === "hot") {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 2; i++) {
      const sx = x - 7 + i * 14;
      const sy = y - r - 8;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(sx - 8, sy - 10, sx + 7, sy - 15, sx, sy - 23);
      ctx.stroke();
    }
  }
}

function drawReport(target, now) {
  const bob = Math.sin((now - target.born) / 1000 * 6) * 3;
  ctx.save();
  ctx.translate(target.x, target.y + bob);
  ctx.rotate(Math.sin((now - target.born) / 1000 * 3) * .12);
  ctx.fillStyle = "#00000028";
  ctx.beginPath();
  ctx.ellipse(3, target.r * .92, target.r * .9, target.r * .24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = REPORT_PALETTE.shadow;
  ctx.lineWidth = target.r * .24;
  ctx.beginPath();
  ctx.arc(target.r * .67, -target.r * .08, target.r * .42, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.fillStyle = REPORT_PALETTE.shadow;
  ctx.beginPath();
  ctx.roundRect(-target.r * .68, -target.r * .72, target.r * 1.38, target.r * 1.48, [5, 5, 11, 11]);
  ctx.fill();
  ctx.fillStyle = REPORT_PALETTE.paper;
  ctx.beginPath();
  ctx.roundRect(-target.r * .76, -target.r * .78, target.r * 1.32, target.r * 1.45, [5, 5, 10, 10]);
  ctx.fill();
  ctx.fillStyle = "#775b1c";
  ctx.beginPath();
  ctx.ellipse(-target.r * .1, -target.r * .76, target.r * .62, target.r * .16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = REPORT_PALETTE.label;
  ctx.beginPath();
  ctx.roundRect(-target.r * .48, -target.r * .32, target.r * .82, target.r * .76, 4);
  ctx.fill();
  ctx.fillStyle = REPORT_PALETTE.rule;
  ctx.fillRect(-target.r * .35, -target.r * .21, target.r * .55, target.r * .08);
  ctx.fillRect(-target.r * .35, -target.r * .04, target.r * .55, target.r * .08);
  ctx.fillStyle = REPORT_PALETTE.ink;
  ctx.font = `900 ${Math.round(target.r * .78)}px Trebuchet MS, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("!", -target.r * .08, target.r * .35);
  ctx.font = `900 ${Math.round(target.r * .24)}px Trebuchet MS, sans-serif`;
  ctx.fillText("RPT", -target.r * .08, target.r * .55);
  ctx.restore();
}

function drawPhone(target, now) {
  const age = (now - target.born) / 1000;
  const bob = Math.sin(age * 8) * 3;
  const remaining = Math.max(0, 5 - age);
  ctx.save();
  ctx.translate(target.x, target.y + bob);
  ctx.rotate(Math.sin(age * 9) * .07);
  ctx.fillStyle = "#172127";
  ctx.beginPath();
  ctx.roundRect(-target.r * .56, -target.r, target.r * 1.12, target.r * 1.9, 7);
  ctx.fill();
  ctx.fillStyle = "#b8ebf5";
  ctx.beginPath();
  ctx.roundRect(-target.r * .42, -target.r * .79, target.r * .84, target.r * 1.48, 4);
  ctx.fill();
  ctx.fillStyle = "#22839a";
  ctx.font = `bold ${Math.round(target.r * .32)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("PING!", 0, -target.r * .28);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(0, target.r * .42, target.r * .075, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#202d32cc";
  ctx.beginPath();
  ctx.arc(0, 0, target.r * 1.18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remaining / 5);
  ctx.strokeStyle = "#34d9ef";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

function drawParticles(dt) {
  for (let index = particles.length - 1; index >= 0; index--) {
    const particle = particles[index];
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 80 * dt;
    if (particle.life <= 0) {
      particles.splice(index, 1);
      continue;
    }
    ctx.globalAlpha = Math.min(1, particle.life * 2);
    ctx.fillStyle = particle.color;
    ctx.font = `bold ${particle.size}px Trebuchet MS, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(particle.text, particle.x, particle.y);
  }
  ctx.globalAlpha = 1;
}

function drawOverlay() {
  if (state.mode === "running") return;
  ctx.fillStyle = "#18272dce";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = "center";
  if (state.mode === "ready") {
    ctx.fillStyle = "#fff8e9";
    ctx.font = "900 38px Trebuchet MS, sans-serif";
    ctx.fillText("THE OFFICE HAS TOO MANY NOTIFICATIONS", WIDTH / 2, 228);
    ctx.fillStyle = "#dbe8d9";
    ctx.font = "20px Trebuchet MS, sans-serif";
    ctx.fillText("Catch hot coffee. Water the fern. Silence the phone.", WIDTH / 2, 270);
    ctx.font = "16px Trebuchet MS, sans-serif";
    ctx.fillText("Select a mission, then earn points to unlock tougher shifts.", WIDTH / 2, 302);
  } else {
    ctx.fillStyle = "#fff8e9";
    ctx.font = "900 44px Trebuchet MS, sans-serif";
    const title = state.mode === "campaignComplete" ? "CAMPAIGN COMPLETE!" :
      state.mode === "missionComplete" ? "MISSION ACCOMPLISHED!" : "SHIFT OVER!";
    ctx.fillText(title, WIDTH / 2, 215);
    ctx.fillStyle = "#ffdd75";
    ctx.font = "900 30px Trebuchet MS, sans-serif";
    ctx.fillText(`${state.score} points earned`, WIDTH / 2, 263);
    ctx.fillStyle = "#e5e6d9";
    ctx.font = "19px Trebuchet MS, sans-serif";
    const review = state.mode === "campaignComplete"
      ? "The fern is now your manager."
      : state.mode === "missionComplete"
        ? `${state.progress.careerPoints} career points · more missions may be unlocked`
        : "The phone is still ringing. You can try again.";
    ctx.fillText(review, WIDTH / 2, 302);
  }
  ctx.textAlign = "start";
}

function render(now, dt) {
  ctx.save();
  if (state.shake > 0) {
    ctx.translate(randomBetween(-state.shake, state.shake), randomBetween(-state.shake, state.shake));
    state.shake = Math.max(0, state.shake - 30 * dt);
  }
  drawBackground(now);
  for (const target of targets) {
    if (target.kind === "report") drawReport(target, now);
    else if (target.kind === "phone") drawPhone(target, now);
    else drawCoffee(target, now);
  }
  drawParticles(dt);
  drawOverlay();
  ctx.restore();
}

function finishFailedMission() {
  if (state.mode !== "running") return;
  const saved = saveProgress(false);
  state.mode = "failed";
  state.timeLeft = Math.max(0, state.timeLeft);
  targets.length = 0;
  nodes.start.textContent = "Play this mission again";
  updateHud();
  setMessage(`Shift over. The phone is still ringing, but at least the fern is hydrated.${saved ? "" : " Progress could not be saved."}`, 99);
}

function update(dt, now) {
  if (state.mode !== "running") return;
  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    finishFailedMission();
    return;
  }
  state.spawnClock -= dt;
  if (state.spawnClock <= 0 && targets.length < state.mission.maxTargets) {
    spawnTarget(now);
    state.spawnClock = state.mission.spawnInterval;
  }
  for (let index = targets.length - 1; index >= 0; index--) {
    const target = targets[index];
    target.x += target.vx * dt;
    target.y += target.vy * dt;
    const margin = target.r + 8;
    if (target.x < margin) { target.x = margin; target.vx = Math.abs(target.vx); }
    if (target.x > WIDTH - margin) { target.x = WIDTH - margin; target.vx = -Math.abs(target.vx); }
    if (target.y < 151 + target.r) { target.y = 151 + target.r; target.vy = Math.abs(target.vy); }
    if (target.y > 382 - target.r) { target.y = 382 - target.r; target.vy = -Math.abs(target.vy); }
    if (now - target.born > (target.kind === "phone" ? 5000 : 8500)) {
      targets.splice(index, 1);
      const penalty = applyTargetExpiry(target.kind, state.mission);
      state.incidents += penalty.incidents;
      state.timeLeft = Math.max(0, state.timeLeft + penalty.timeDelta);
      if (target.kind === "phone") {
        state.shake = 4;
        setMessage("Phone ignored! The whole office stopped to watch the notification.", 2.2);
      } else if (target.kind === "hot") {
        setMessage("A hot coffee escaped to a meeting that could've been an email.", 2.2);
      }
    }
  }
  updateHud();
}

function hitTarget(target) {
  const result = applyTargetHit(target.kind, target.golden);
  state.score += result.points;
  state.timeLeft = clampMissionTime(state.timeLeft, result.timeDelta, state.mission.durationSeconds);
  state.incidents += result.incidents;
  if (result.progress) state.task[result.progress]++;
  if (target.kind === "cold") {
    state.shake = 7;
    audio.play(145, .2, "sine", .04);
    setMessage("ICED COFFEE! Two seconds lost to the workplace hazard report.", 2.5);
  } else if (target.kind === "phone") {
    audio.play(659.25, .17, "sine", .03);
    setMessage("Phone silenced! The meeting can return to pretending to listen.", 2.2);
  } else if (target.kind === "report") {
    audio.play(880, .16, "sine", .03);
    setMessage("Yellow report filed! Finance has acknowledged receipt.", 2.2);
  } else {
    audio.play(target.golden ? 1046.5 : 740, .16, "sine", .025);
    for (let index = 0; index < 8; index++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomBetween(35, 120);
      particles.push({
        x: target.x, y: target.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: randomBetween(.45, .9), size: randomBetween(13, 21),
        color: target.golden ? "#ffd264" : `hsl(${target.hue} 65% 72%)`,
        text: target.golden ? "★" : "☕"
      });
    }
    setMessage(target.golden ? "FAST GOLDEN COFFEE! Three points. Tiny trophy!" :
      coffeeQuips[Math.floor(Math.random() * coffeeQuips.length)], 1.8);
  }
  updateHud();
  tryCompleteMission();
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * WIDTH / rect.width,
    y: (event.clientY - rect.top) * HEIGHT / rect.height
  };
}

canvas.addEventListener("pointerdown", event => {
  if (state.mode !== "running") return;
  event.preventDefault();
  const point = canvasPoint(event);
  if (state.mission.waterGoal > state.task.water &&
      point.x >= 646 && point.x <= 738 && point.y >= 326 && point.y <= 404) {
    waterFern();
    return;
  }
  for (let index = targets.length - 1; index >= 0; index--) {
    const target = targets[index];
    const dx = point.x - target.x;
    const dy = point.y - target.y;
    if (dx * dx + dy * dy <= (target.r + 11) ** 2) {
      targets.splice(index, 1);
      hitTarget(target);
      break;
    }
  }
});

nodes.water.addEventListener("click", waterFern);
nodes.missionSelect.addEventListener("change", () => {
  selectMission(Number(nodes.missionSelect.value));
});
nodes.start.addEventListener("click", startMission);
nodes.music.addEventListener("click", async () => {
  try {
    const enabled = await audio.toggle();
    nodes.music.setAttribute("aria-pressed", String(enabled));
    nodes.music.textContent = enabled ? "♫ Ambient: On" : "♫ Ambient: Off";
    setMessage(enabled ? "Slow office-day ambience activated." : "Quiet mode. The fern approves.", 2.5);
  } catch (error) {
    console.error("Could not initialize ambient audio.", error);
    setMessage("This browser could not start ambient audio.", 3);
  }
});

function loop(now) {
  const dt = Math.min(.04, Math.max(0, (now - state.lastFrame) / 1000));
  state.lastFrame = now;
  if (state.messageClock > 0) {
    state.messageClock -= dt;
    if (state.messageClock <= 0 && state.mode === "running") {
      nodes.message.textContent = formatTaskHint();
    }
  }
  update(dt, now);
  audio.update();
  render(now, dt);
  requestAnimationFrame(loop);
}

updateMissionPicker();
updateHud();
requestAnimationFrame(now => {
  state.lastFrame = now;
  loop(now);
});
