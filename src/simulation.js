(function () {
  const {
    BLACK_HOLE_RADIUS_RATIO,
    CHARGE_RANGE,
    CHARGE_STRENGTH,
    DECAY_AVERAGE_SIZE_RATIO,
    DECAY_CHANCE,
    DECAY_MIN_FRAGMENT_RADIUS,
    DECAY_MIN_RADIUS,
    INITIAL_PER_RACE,
    INITIAL_RADIUS,
    INITIAL_RADIUS_VARIATION,
    MAX_DIRECTION_FORCE,
    MIN_CHARGE_DISTANCE,
    ORBITAL_SWIRL_STRENGTH,
    REPRODUCTION_CHANCE,
    REPRODUCTION_COOLDOWN_SECONDS,
    areTouching,
    clampBoundedCoordinate,
    createCreature,
    getContact,
    keepInBounds,
    playBounceSound,
    playChompSound,
    playSplashSound,
    randomBoundedCoordinate,
    randomBetween,
    randomDirection,
    state,
  } = window.Blazzlers;

function resetSimulation() {
  state.nextId = 1;
  state.creatures = [];
  state.activeContacts = new Set();
  state.winner = null;
  state.winnerRecorded = false;
  state.nextRoundAt = null;
  state.readyCountdownUntil = null;

  const blazzlerRadii = createBalancedInitialRadii();
  const romperRadii = createBalancedInitialRadii();

  for (let i = 0; i < INITIAL_PER_RACE; i += 1) {
    state.creatures.push(createCreature("blazzler", blazzlerRadii[i]));
    state.creatures.push(createCreature("romper", romperRadii[i]));
  }

  separateInitialOverlaps();
}

function getCounts() {
  const blazzlers = state.creatures.filter((creature) => creature.kind === "blazzler").length;
  return {
    blazzlers,
    rompers: state.creatures.length - blazzlers,
  };
}

function checkWinner(blazzlers, rompers) {
  if (state.winner || blazzlers === rompers) {
    return state.winner;
  }

  if (blazzlers === 0) {
    state.winner = "rompers";
  } else if (rompers === 0) {
    state.winner = "blazzlers";
  }

  return state.winner;
}

function stepSimulation(deltaSeconds) {
  applyChargeForces(deltaSeconds);

  const decayedIds = new Set();
  const decayFragments = [];

  for (const creature of state.creatures) {
    const fragments = moveCreature(creature, deltaSeconds);

    if (fragments) {
      decayedIds.add(creature.id);
      decayFragments.push(...fragments);
    }
  }

  if (decayedIds.size > 0) {
    state.creatures = state.creatures
      .filter((creature) => !decayedIds.has(creature.id))
      .concat(decayFragments);
    state.activeContacts = new Set();
  }

  resolveCollisions();
}

function keepInWorldBounds(creature) {
  keepInBounds(creature, state.worldWidth, state.worldHeight);
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

function separateInitialOverlaps() {
  for (let pass = 0; pass < 80; pass += 1) {
    let moved = false;

    for (let i = 0; i < state.creatures.length; i += 1) {
      for (let j = i + 1; j < state.creatures.length; j += 1) {
        if (!areTouching(state.creatures[i], state.creatures[j])) {
          continue;
        }

        const creature = state.creatures[j];
        creature.x = randomBoundedCoordinate(creature.radius, state.worldWidth);
        creature.y = randomBoundedCoordinate(creature.radius, state.worldHeight);
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
  } else if (creature.x + creature.radius >= state.worldWidth) {
    creature.x = state.worldWidth - creature.radius;
    creature.vx = -Math.abs(creature.vx);
    bounced = true;
  }

  if (creature.y - creature.radius <= 0) {
    creature.y = creature.radius;
    creature.vy = Math.abs(creature.vy);
    bounced = true;
  } else if (creature.y + creature.radius >= state.worldHeight) {
    creature.y = state.worldHeight - creature.radius;
    creature.vy = -Math.abs(creature.vy);
    bounced = true;
  }

  if (bounced) {
    creature.radius += 1;
    keepInWorldBounds(creature);
    playBounceSound();
    return maybeDecayCreature(creature);
  }

  return null;
}

function speedForRadius(radius) {
  return (100 / Math.max(1, radius)) * state.speedMultiplier;
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
  return state.creatures.reduce((largest, creature) => (
    creature.radius > largest.radius ? creature : largest
  ), state.creatures[0]);
}

function getAverageRadius() {
  if (state.creatures.length === 0) {
    return 0;
  }

  return state.creatures.reduce((sum, creature) => sum + creature.radius, 0) / state.creatures.length;
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

    fragment.x = clampBoundedCoordinate(creature.x + Math.cos(angle) * distance, radius, state.worldWidth);
    fragment.y = clampBoundedCoordinate(creature.y + Math.sin(angle) * distance, radius, state.worldHeight);
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
  const forceVectors = state.creatures.map(() => ({ x: 0, y: 0 }));
  const maxDistanceSquared = CHARGE_RANGE * CHARGE_RANGE;

  for (let i = 0; i < state.creatures.length; i += 1) {
    for (let j = i + 1; j < state.creatures.length; j += 1) {
      const a = state.creatures[i];
      const b = state.creatures[j];
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

  for (let i = 0; i < state.creatures.length; i += 1) {
    const creature = state.creatures[i];
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

function resolveCollisions() {
  const consumedIds = new Set();
  const offspring = [];
  const nextActiveContacts = new Set();

  for (let i = 0; i < state.creatures.length; i += 1) {
    for (let j = i + 1; j < state.creatures.length; j += 1) {
      const a = state.creatures[i];
      const b = state.creatures[j];
      const contactKey = getContactKey(a, b);
      const contact = getContact(a, b);

      if (consumedIds.has(a.id) || consumedIds.has(b.id) || !contact.touching) {
        continue;
      }

      nextActiveContacts.add(contactKey);

      if (a.kind === b.kind) {
        resolveSameKindCollision(a, b, contact, offspring, state.activeContacts.has(contactKey));
      } else {
        resolveOpposingKindCollision(a, b, contact, consumedIds, state.activeContacts.has(contactKey));
      }
    }
  }

  if (consumedIds.size > 0) {
    state.creatures = state.creatures.filter((creature) => !consumedIds.has(creature.id));
  }

  if (offspring.length > 0) {
    state.creatures.push(...offspring);
  }

  state.activeContacts = new Set(
    [...nextActiveContacts].filter((contactKey) => {
      const [firstId, secondId] = contactKey.split(":").map(Number);
      return !consumedIds.has(firstId) && !consumedIds.has(secondId);
    }),
  );
}

function getContactKey(a, b) {
  return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
}

function resolveSameKindCollision(a, b, contact, offspring, wasAlreadyTouching) {
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
    bounceApart(a, b, contact);
  } else {
    bounceApart(a, b, contact);
  }
}

function createOffspring(kind, radius, x, y) {
  const creature = createCreature(kind, radius);
  creature.x = clampBoundedCoordinate(x + randomBetween(-radius, radius), radius, state.worldWidth);
  creature.y = clampBoundedCoordinate(y + randomBetween(-radius, radius), radius, state.worldHeight);
  creature.reproductionCooldown = REPRODUCTION_COOLDOWN_SECONDS;
  return creature;
}

function resolveOpposingKindCollision(a, b, contact, consumedIds, wasAlreadyTouching) {
  if (wasAlreadyTouching) {
    bounceApart(a, b, contact);
    return;
  }

  if (a.radius === b.radius) {
    a.radius = Math.max(1, a.radius - 1);
    b.radius = Math.max(1, b.radius - 1);
    bounceApart(a, b, contact);
    return;
  }

  const larger = a.radius > b.radius ? a : b;
  const smaller = larger === a ? b : a;
  larger.radius += Math.floor(smaller.radius / 4);
  consumedIds.add(smaller.id);
  keepInWorldBounds(larger);
  playChompSound();
}

function randomizeVelocity(creature) {
  const direction = randomDirection();
  creature.vx = direction.x;
  creature.vy = direction.y;
}

function bounceApart(a, b, contact = getContact(a, b)) {
  let nx = contact.normalX;
  let ny = contact.normalY;

  if (nx === 0 && ny === 0) {
    const direction = randomDirection();
    nx = direction.x;
    ny = direction.y;
  }

  a.vx = -nx;
  a.vy = -ny;
  b.vx = nx;
  b.vy = ny;

  const overlap = contact.overlap;
  if (overlap > 0) {
    const push = overlap / 2 + 0.5;
    a.x -= nx * push;
    a.y -= ny * push;
    b.x += nx * push;
    b.y += ny * push;
    keepInWorldBounds(a);
    keepInWorldBounds(b);
  }
}

  Object.assign(window.Blazzlers, {
    checkWinner,
    getCounts,
    keepInWorldBounds,
    resetSimulation,
    stepSimulation,
  });
}());
