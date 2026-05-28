const MAX_CANVAS_RESOLUTION = 5120;
const MIN_WORLD_WIDTH = 280;
const MIN_WORLD_HEIGHT = 280;
const INITIAL_RADIUS = 20;
const INITIAL_PER_RACE = 6;
const INITIAL_RADIUS_VARIATION = 0.02;
const REPRODUCTION_CHANCE = 0.2;
const DECAY_CHANCE = 0.1;
const DECAY_AVERAGE_SIZE_RATIO = 1.5;
const DECAY_MIN_RADIUS = 24;
const DECAY_MIN_FRAGMENT_RADIUS = 6;
const MAX_DELTA_SECONDS = 0.05;
const DEFAULT_SPEED_MULTIPLIER = 100;
const SPEED_STEP_RATIO = 1.1;
const REPRODUCTION_COOLDOWN_SECONDS = 0.8;
const CHARGE_STRENGTH = 0.25;
const CHARGE_RANGE = 420;
const MIN_CHARGE_DISTANCE = 48;
const MAX_DIRECTION_FORCE = 100;
const ORBITAL_SWIRL_STRENGTH = 0.55;
const BLACK_HOLE_RADIUS_RATIO = 1.8;

const canvas = document.getElementById("world");
const worldWrap = document.querySelector(".world-wrap");
const ctx = canvas.getContext("2d");
const stats = document.getElementById("stats");
const winnerMessage = document.getElementById("winnerMessage");
const speedDisplay = document.getElementById("speedDisplay");
const slowButton = document.getElementById("slowButton");
const fastButton = document.getElementById("fastButton");
const pauseButton = document.getElementById("pauseButton");
const resetButton = document.getElementById("resetButton");

let creatures = [];
let nextId = 1;
let paused = false;
let lastFrameTime = 0;
let speedMultiplier = DEFAULT_SPEED_MULTIPLIER;
let winner = null;
let audioContext = null;
let masterGain = null;
let lastTickTime = 0;
let activeContacts = new Set();
let worldWidth = 1080;
let worldHeight = 1080;
let renderScale = 1;

function ensureAudio() {
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.16;
    masterGain.connect(audioContext.destination);
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function playTone({ frequency, type = "sine", duration, volume, slideTo = frequency }) {
  if (!audioContext || audioContext.state !== "running") {
    return;
  }

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + duration);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playNoise(duration, volume) {
  if (!audioContext || audioContext.state !== "running") {
    return;
  }

  const sampleCount = Math.max(1, Math.floor(audioContext.sampleRate * duration));
  const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
  const samples = buffer.getChannelData(0);

  for (let i = 0; i < sampleCount; i += 1) {
    samples[i] = Math.random() * 2 - 1;
  }

  const now = audioContext.currentTime;
  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();

  filter.type = "lowpass";
  filter.frequency.value = 1300;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  source.start(now);
}

function playBounceSound() {
  if (!audioContext || audioContext.state !== "running") {
    return;
  }

  const now = audioContext.currentTime;
  if (now - lastTickTime < 0.025) {
    return;
  }

  lastTickTime = now;
  playTone({ frequency: 950, type: "square", duration: 0.035, volume: 0.08, slideTo: 620 });
}

function playChompSound() {
  playTone({ frequency: 170, type: "sawtooth", duration: 0.11, volume: 0.12, slideTo: 70 });
  playNoise(0.08, 0.08);
}

function playSplashSound() {
  playTone({ frequency: 360, type: "triangle", duration: 0.14, volume: 0.1, slideTo: 760 });
  playNoise(0.16, 0.06);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomBoundedCoordinate(radius, size) {
  if (size <= radius * 2) {
    return size / 2;
  }

  return randomBetween(radius, size - radius);
}

function clampBoundedCoordinate(value, radius, size) {
  if (size <= radius * 2) {
    return size / 2;
  }

  return Math.min(size - radius, Math.max(radius, value));
}

function randomDirection() {
  const angle = Math.random() * Math.PI * 2;
  return {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };
}

function speedForRadius(radius) {
  return (100 / Math.max(1, radius)) * speedMultiplier;
}

function resizeCanvas() {
  const rect = worldWrap.getBoundingClientRect();
  const cssWidth = Math.max(MIN_WORLD_WIDTH, Math.floor(rect.width));
  const cssHeight = Math.max(MIN_WORLD_HEIGHT, Math.floor(rect.height));
  const previousWidth = worldWidth;
  const previousHeight = worldHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  const resolutionScale = Math.min(
    pixelRatio,
    MAX_CANVAS_RESOLUTION / cssWidth,
    MAX_CANVAS_RESOLUTION / cssHeight,
  );
  const pixelWidth = Math.max(1, Math.floor(cssWidth * resolutionScale));
  const pixelHeight = Math.max(1, Math.floor(cssHeight * resolutionScale));

  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  worldWidth = cssWidth;
  worldHeight = cssHeight;
  renderScale = resolutionScale;
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);

  if (creatures.length === 0 || previousWidth === worldWidth && previousHeight === worldHeight) {
    return;
  }

  const scaleX = worldWidth / previousWidth;
  const scaleY = worldHeight / previousHeight;

  for (const creature of creatures) {
    creature.x *= scaleX;
    creature.y *= scaleY;
    keepInBounds(creature);
  }
}

function createCreature(kind, radius = INITIAL_RADIUS) {
  const direction = randomDirection();

  return {
    id: nextId++,
    kind,
    radius,
    x: randomBoundedCoordinate(radius, worldWidth),
    y: randomBoundedCoordinate(radius, worldHeight),
    vx: direction.x,
    vy: direction.y,
    reproductionCooldown: 0,
  };
}

function createBalancedInitialRadii() {
  const maxDelta = INITIAL_RADIUS * INITIAL_RADIUS_VARIATION;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const deltas = Array.from({ length: INITIAL_PER_RACE }, () => randomBetween(-maxDelta, maxDelta));
    const meanDelta = deltas.reduce((sum, delta) => sum + delta, 0) / INITIAL_PER_RACE;
    const balancedDeltas = deltas.map((delta) => delta - meanDelta);

    if (balancedDeltas.every((delta) => Math.abs(delta) <= maxDelta)) {
      return balancedDeltas.map((delta) => INITIAL_RADIUS + delta);
    }
  }

  return Array.from({ length: INITIAL_PER_RACE }, () => INITIAL_RADIUS);
}

function resetSimulation() {
  nextId = 1;
  creatures = [];
  activeContacts = new Set();
  winner = null;
  winnerMessage.hidden = true;
  winnerMessage.textContent = "";

  const blazzlerRadii = createBalancedInitialRadii();
  const romperRadii = createBalancedInitialRadii();

  for (let i = 0; i < INITIAL_PER_RACE; i += 1) {
    creatures.push(createCreature("blazzler", blazzlerRadii[i]));
    creatures.push(createCreature("romper", romperRadii[i]));
  }

  separateInitialOverlaps();
  updateStats();
}

function separateInitialOverlaps() {
  for (let pass = 0; pass < 80; pass += 1) {
    let moved = false;

    for (let i = 0; i < creatures.length; i += 1) {
      for (let j = i + 1; j < creatures.length; j += 1) {
        if (!areTouching(creatures[i], creatures[j])) {
          continue;
        }

        const creature = creatures[j];
        creature.x = randomBoundedCoordinate(creature.radius, worldWidth);
        creature.y = randomBoundedCoordinate(creature.radius, worldHeight);
        moved = true;
      }
    }

    if (!moved) {
      return;
    }
  }
}

function moveCreature(creature, deltaSeconds) {
  creature.reproductionCooldown = Math.max(0, creature.reproductionCooldown - deltaSeconds);

  const speed = speedForRadius(creature.radius);
  creature.x += creature.vx * speed * deltaSeconds;
  creature.y += creature.vy * speed * deltaSeconds;

  let bounced = false;

  if (creature.x - creature.radius <= 0) {
    creature.x = creature.radius;
    creature.vx = Math.abs(creature.vx);
    bounced = true;
  } else if (creature.x + creature.radius >= worldWidth) {
    creature.x = worldWidth - creature.radius;
    creature.vx = -Math.abs(creature.vx);
    bounced = true;
  }

  if (creature.y - creature.radius <= 0) {
    creature.y = creature.radius;
    creature.vy = Math.abs(creature.vy);
    bounced = true;
  } else if (creature.y + creature.radius >= worldHeight) {
    creature.y = worldHeight - creature.radius;
    creature.vy = -Math.abs(creature.vy);
    bounced = true;
  }

  if (bounced) {
    creature.radius += 1;
    keepInBounds(creature);
    playBounceSound();
    return maybeDecayCreature(creature);
  }

  return null;
}

function maybeDecayCreature(creature) {
  if (
    creature.radius < DECAY_MIN_RADIUS ||
    creature !== getLargestCreature() ||
    creature.radius < getAverageRadius() * DECAY_AVERAGE_SIZE_RATIO ||
    Math.random() >= DECAY_CHANCE
  ) {
    return null;
  }

  return splitCreatureIntoFragments(creature);
}

function getLargestCreature() {
  return creatures.reduce((largest, creature) => (
    creature.radius > largest.radius ? creature : largest
  ), creatures[0]);
}

function getAverageRadius() {
  if (creatures.length === 0) {
    return 0;
  }

  return creatures.reduce((sum, creature) => sum + creature.radius, 0) / creatures.length;
}

function splitCreatureIntoFragments(creature) {
  const fragmentCount = Math.min(
    8,
    Math.max(3, Math.floor(creature.radius / DECAY_MIN_FRAGMENT_RADIUS)),
  );
  let remainingRadius = Math.max(
    DECAY_MIN_FRAGMENT_RADIUS * fragmentCount,
    Math.round(creature.radius),
  );
  const fragments = [];

  for (let i = 0; i < fragmentCount; i += 1) {
    const piecesLeft = fragmentCount - i;
    const maxRadius = remainingRadius - DECAY_MIN_FRAGMENT_RADIUS * (piecesLeft - 1);
    const averageRadius = remainingRadius / piecesLeft;
    const radius = i === fragmentCount - 1
      ? remainingRadius
      : Math.max(
        DECAY_MIN_FRAGMENT_RADIUS,
        Math.min(maxRadius, Math.round(averageRadius * randomBetween(0.75, 1.25))),
      );
    const angle = (Math.PI * 2 * i) / fragmentCount + randomBetween(-0.25, 0.25);
    const distance = creature.radius + radius + 2;
    const fragment = createCreature(creature.kind, radius);

    fragment.x = clampBoundedCoordinate(creature.x + Math.cos(angle) * distance, radius, worldWidth);
    fragment.y = clampBoundedCoordinate(creature.y + Math.sin(angle) * distance, radius, worldHeight);
    fragment.vx = Math.cos(angle);
    fragment.vy = Math.sin(angle);
    fragment.reproductionCooldown = REPRODUCTION_COOLDOWN_SECONDS;
    fragments.push(fragment);
    remainingRadius -= radius;
  }

  playSplashSound();
  return fragments;
}

function applyChargeForces(deltaSeconds) {
  const forceVectors = creatures.map(() => ({ x: 0, y: 0 }));
  const maxDistanceSquared = CHARGE_RANGE * CHARGE_RANGE;

  for (let i = 0; i < creatures.length; i += 1) {
    for (let j = i + 1; j < creatures.length; j += 1) {
      const a = creatures[i];
      const b = creatures[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distanceSquared = dx * dx + dy * dy;

      if (distanceSquared === 0 || distanceSquared > maxDistanceSquared) {
        continue;
      }

      const distance = Math.sqrt(distanceSquared);
      const safeDistance = Math.max(distance, MIN_CHARGE_DISTANCE);
      const direction = a.kind === b.kind ? -1 : 1;
      applySourceForce(forceVectors[i], a, b, dx / distance, dy / distance, safeDistance, direction);
      applySourceForce(forceVectors[j], b, a, -dx / distance, -dy / distance, safeDistance, direction);
    }
  }

  for (let i = 0; i < creatures.length; i += 1) {
    const creature = creatures[i];
    const force = forceVectors[i];
    creature.vx += force.x * deltaSeconds;
    creature.vy += force.y * deltaSeconds;
    normalizeVelocity(creature);
  }
}

function applySourceForce(force, target, source, nx, ny, distance, direction) {
  const targetInertia = Math.sqrt(Math.max(1, target.radius));
  const sourceMass = source.radius * source.radius;
  let forceMagnitude = (CHARGE_STRENGTH * sourceMass) / (distance * targetInertia);
  forceMagnitude = Math.min(MAX_DIRECTION_FORCE, forceMagnitude);

  let fx = nx * forceMagnitude * direction;
  let fy = ny * forceMagnitude * direction;

  if (direction > 0 && source.radius / target.radius >= BLACK_HOLE_RADIUS_RATIO) {
    const swirl = forceMagnitude * ORBITAL_SWIRL_STRENGTH;
    fx += -ny * swirl;
    fy += nx * swirl;
  }

  force.x += fx;
  force.y += fy;
}

function normalizeVelocity(creature) {
  const length = Math.hypot(creature.vx, creature.vy);

  if (length === 0) {
    randomizeVelocity(creature);
    return;
  }

  creature.vx /= length;
  creature.vy /= length;
}

function keepInBounds(creature) {
  creature.x = clampBoundedCoordinate(creature.x, creature.radius, worldWidth);
  creature.y = clampBoundedCoordinate(creature.y, creature.radius, worldHeight);
}

function areTouching(a, b) {
  if (a.kind === "blazzler" && b.kind === "blazzler") {
    return circleCircleTouch(a, b);
  }

  if (a.kind === "romper" && b.kind === "romper") {
    return squareSquareTouch(a, b);
  }

  const circle = a.kind === "blazzler" ? a : b;
  const square = a.kind === "romper" ? a : b;
  return circleSquareTouch(circle, square);
}

function circleCircleTouch(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const combinedRadius = a.radius + b.radius;
  return dx * dx + dy * dy <= combinedRadius * combinedRadius;
}

function squareSquareTouch(a, b) {
  return (
    Math.abs(a.x - b.x) <= a.radius + b.radius &&
    Math.abs(a.y - b.y) <= a.radius + b.radius
  );
}

function circleSquareTouch(circle, square) {
  const closestX = Math.max(square.x - square.radius, Math.min(circle.x, square.x + square.radius));
  const closestY = Math.max(square.y - square.radius, Math.min(circle.y, square.y + square.radius));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

function resolveCollisions() {
  const consumedIds = new Set();
  const offspring = [];
  const nextActiveContacts = new Set();

  for (let i = 0; i < creatures.length; i += 1) {
    for (let j = i + 1; j < creatures.length; j += 1) {
      const a = creatures[i];
      const b = creatures[j];
      const contactKey = getContactKey(a, b);

      if (consumedIds.has(a.id) || consumedIds.has(b.id) || !areTouching(a, b)) {
        continue;
      }

      nextActiveContacts.add(contactKey);

      if (a.kind === b.kind) {
        resolveSameKindCollision(a, b, offspring, activeContacts.has(contactKey));
      } else {
        resolveOpposingKindCollision(a, b, consumedIds, activeContacts.has(contactKey));
      }
    }
  }

  if (consumedIds.size > 0) {
    creatures = creatures.filter((creature) => !consumedIds.has(creature.id));
  }

  if (offspring.length > 0) {
    creatures.push(...offspring);
  }

  activeContacts = new Set(
    [...nextActiveContacts].filter((contactKey) => {
      const [firstId, secondId] = contactKey.split(":").map(Number);
      return !consumedIds.has(firstId) && !consumedIds.has(secondId);
    }),
  );
}

function getContactKey(a, b) {
  return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
}

function resolveSameKindCollision(a, b, offspring, wasAlreadyTouching) {
  const canReproduce = !wasAlreadyTouching && a.reproductionCooldown === 0 && b.reproductionCooldown === 0;

  if (canReproduce && Math.random() < REPRODUCTION_CHANCE) {
    const childRadius = Math.floor((a.radius + b.radius) / 2);
    offspring.push(
      createOffspring(a.kind, Math.max(1, childRadius), a.x, a.y),
      createOffspring(a.kind, Math.max(1, childRadius), b.x, b.y),
    );
    a.reproductionCooldown = REPRODUCTION_COOLDOWN_SECONDS;
    b.reproductionCooldown = REPRODUCTION_COOLDOWN_SECONDS;
    playSplashSound();
    bounceApart(a, b);
  } else {
    bounceApart(a, b);
  }
}

function createOffspring(kind, radius, x, y) {
  const creature = createCreature(kind, radius);
  creature.x = clampBoundedCoordinate(x + randomBetween(-radius, radius), radius, worldWidth);
  creature.y = clampBoundedCoordinate(y + randomBetween(-radius, radius), radius, worldHeight);
  creature.reproductionCooldown = REPRODUCTION_COOLDOWN_SECONDS;
  return creature;
}

function resolveOpposingKindCollision(a, b, consumedIds, wasAlreadyTouching) {
  if (wasAlreadyTouching) {
    bounceApart(a, b);
    return;
  }

  if (a.radius === b.radius) {
    a.radius = Math.max(1, a.radius - 1);
    b.radius = Math.max(1, b.radius - 1);
    bounceApart(a, b);
    return;
  }

  const larger = a.radius > b.radius ? a : b;
  const smaller = larger === a ? b : a;
  larger.radius += Math.floor(smaller.radius / 4);
  consumedIds.add(smaller.id);
  keepInBounds(larger);
  playChompSound();
}

function randomizeVelocity(creature) {
  const direction = randomDirection();
  creature.vx = direction.x;
  creature.vy = direction.y;
}

function bounceApart(a, b) {
  const dx = b.x - a.x || randomBetween(-1, 1) || 1;
  const dy = b.y - a.y || randomBetween(-1, 1) || 1;
  const length = Math.hypot(dx, dy) || 1;
  const nx = dx / length;
  const ny = dy / length;

  a.vx = -nx;
  a.vy = -ny;
  b.vx = nx;
  b.vy = ny;

  const overlap = overlapAmount(a, b);
  if (overlap > 0) {
    const push = overlap / 2 + 0.5;
    a.x -= nx * push;
    a.y -= ny * push;
    b.x += nx * push;
    b.y += ny * push;
    keepInBounds(a);
    keepInBounds(b);
  }
}

function overlapAmount(a, b) {
  if (a.kind === "romper" && b.kind === "romper") {
    return Math.max(0, a.radius + b.radius - Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)));
  }

  return Math.max(0, a.radius + b.radius - Math.hypot(a.x - b.x, a.y - b.y));
}

function draw() {
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.clearRect(0, 0, worldWidth, worldHeight);

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, worldWidth, worldHeight);

  drawChargeHalos();

  for (const creature of creatures) {
    if (creature.kind === "blazzler") {
      ctx.fillStyle = "#2f80ed";
      ctx.beginPath();
      ctx.arc(creature.x, creature.y, creature.radius, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    ctx.fillStyle = "#e34c4c";
    ctx.fillRect(
      creature.x - creature.radius,
      creature.y - creature.radius,
      creature.radius * 2,
      creature.radius * 2,
    );
  }
}

function drawChargeHalos() {
  for (const creature of creatures) {
    if (creature.radius < INITIAL_RADIUS * 1.5) {
      continue;
    }

    const haloRadius = Math.min(CHARGE_RANGE, creature.radius * 5);
    const gradient = ctx.createRadialGradient(
      creature.x,
      creature.y,
      creature.radius,
      creature.x,
      creature.y,
      haloRadius,
    );
    const color = creature.kind === "blazzler" ? "47, 128, 237" : "227, 76, 76";

    gradient.addColorStop(0, `rgba(${color}, 0.14)`);
    gradient.addColorStop(1, `rgba(${color}, 0)`);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(creature.x, creature.y, haloRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function updateStats() {
  const blazzlers = creatures.filter((creature) => creature.kind === "blazzler").length;
  const rompers = creatures.length - blazzlers;
  stats.textContent = `Blazzlers: ${blazzlers} | Rompers: ${rompers}`;
  checkWinner(blazzlers, rompers);
}

function checkWinner(blazzlers, rompers) {
  if (winner || blazzlers === rompers) {
    return;
  }

  if (blazzlers === 0) {
    winner = "rompers";
  } else if (rompers === 0) {
    winner = "blazzlers";
  }

  if (winner) {
    winnerMessage.textContent = `${winner} win`;
    winnerMessage.hidden = false;
  }
}

function updateSpeedDisplay() {
  speedDisplay.textContent = `${speedMultiplier.toFixed(1).replace(".0", "")}x`;
}

function frame(timestamp) {
  if (!lastFrameTime) {
    lastFrameTime = timestamp;
  }

  const deltaSeconds = Math.min(MAX_DELTA_SECONDS, (timestamp - lastFrameTime) / 1000);
  lastFrameTime = timestamp;

  if (!paused && !winner) {
    applyChargeForces(deltaSeconds);

    const decayedIds = new Set();
    const decayFragments = [];

    for (const creature of creatures) {
      const fragments = moveCreature(creature, deltaSeconds);

      if (fragments) {
        decayedIds.add(creature.id);
        decayFragments.push(...fragments);
      }
    }

    if (decayedIds.size > 0) {
      creatures = creatures
        .filter((creature) => !decayedIds.has(creature.id))
        .concat(decayFragments);
      activeContacts = new Set();
    }

    resolveCollisions();
    updateStats();
  }

  draw();
  requestAnimationFrame(frame);
}

pauseButton.addEventListener("click", () => {
  ensureAudio();
  paused = !paused;
  pauseButton.textContent = paused ? "Resume" : "Pause";
});

slowButton.addEventListener("click", () => {
  ensureAudio();
  speedMultiplier = Math.max(0.1, speedMultiplier / SPEED_STEP_RATIO);
  updateSpeedDisplay();
});

fastButton.addEventListener("click", () => {
  ensureAudio();
  speedMultiplier *= SPEED_STEP_RATIO;
  updateSpeedDisplay();
});

resetButton.addEventListener("click", () => {
  ensureAudio();
  resetSimulation();
});

canvas.addEventListener("pointerdown", ensureAudio);

if ("ResizeObserver" in window) {
  const resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(worldWrap);
} else {
  window.addEventListener("resize", resizeCanvas);
}

resizeCanvas();
resetSimulation();
updateSpeedDisplay();
requestAnimationFrame(frame);
