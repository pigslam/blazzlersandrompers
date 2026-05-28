(function () {
  const {
    DEFAULT_SPEED_MULTIPLIER,
    INITIAL_ANGULAR_SPEED,
    INITIAL_RADIUS,
    randomBoundedCoordinate,
    randomBetween,
    randomDirection,
  } = window.Blazzlers;

  const state = {
    creatures: [],
    nextId: 1,
    paused: true,
    lastFrameTime: 0,
    speedMultiplier: DEFAULT_SPEED_MULTIPLIER,
    winner: null,
    winnerRecorded: false,
    nextRoundAt: null,
    readyCountdownUntil: null,
    roundNumber: 1,
    sessionWins: {
      blazzlers: 0,
      rompers: 0,
    },
    activeContacts: new Set(),
    worldWidth: 1080,
    worldHeight: 1080,
    renderScale: 1,
  };

  function createCreature(kind, radius = INITIAL_RADIUS) {
    const direction = randomDirection();

    return {
      id: state.nextId++,
      kind,
      radius,
      x: randomBoundedCoordinate(radius, state.worldWidth),
      y: randomBoundedCoordinate(radius, state.worldHeight),
      vx: direction.x,
      vy: direction.y,
      angle: kind === "romper" ? randomBetween(0, Math.PI * 2) : 0,
      angularVelocity: kind === "romper" ? randomBetween(-INITIAL_ANGULAR_SPEED, INITIAL_ANGULAR_SPEED) : 0,
      reproductionCooldown: 0,
    };
  }

  Object.assign(window.Blazzlers, {
    createCreature,
    state,
  });
}());
