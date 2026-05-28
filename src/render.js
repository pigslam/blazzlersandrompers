(function () {
  const {
    CHARGE_RANGE,
    INITIAL_RADIUS,
    MAX_CANVAS_RESOLUTION,
    MIN_WORLD_HEIGHT,
    MIN_WORLD_WIDTH,
    keepInWorldBounds,
    state,
  } = window.Blazzlers;

function resizeCanvas(canvas, worldWrap, ctx) {
  const rect = worldWrap.getBoundingClientRect();
  const cssWidth = Math.max(MIN_WORLD_WIDTH, Math.floor(rect.width));
  const cssHeight = Math.max(MIN_WORLD_HEIGHT, Math.floor(rect.height));
  const previousWidth = state.worldWidth;
  const previousHeight = state.worldHeight;
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

  state.worldWidth = cssWidth;
  state.worldHeight = cssHeight;
  state.renderScale = resolutionScale;
  ctx.setTransform(state.renderScale, 0, 0, state.renderScale, 0, 0);

  if (
    state.creatures.length === 0 ||
    previousWidth === state.worldWidth && previousHeight === state.worldHeight
  ) {
    return;
  }

  const scaleX = state.worldWidth / previousWidth;
  const scaleY = state.worldHeight / previousHeight;

  for (const creature of state.creatures) {
    creature.x *= scaleX;
    creature.y *= scaleY;
    keepInWorldBounds(creature);
  }
}

function draw(ctx) {
  ctx.setTransform(state.renderScale, 0, 0, state.renderScale, 0, 0);
  ctx.clearRect(0, 0, state.worldWidth, state.worldHeight);

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, state.worldWidth, state.worldHeight);

  drawChargeHalos(ctx);

  for (const creature of state.creatures) {
    if (creature.kind === "blazzler") {
      ctx.fillStyle = "#2f80ed";
      ctx.beginPath();
      ctx.arc(creature.x, creature.y, creature.radius, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    drawRomper(ctx, creature);
  }
}

function drawRomper(ctx, creature) {
  const size = creature.radius * 2;

  ctx.save();
  ctx.translate(creature.x, creature.y);
  ctx.rotate(creature.angle);
  ctx.fillStyle = "#e34c4c";
  ctx.fillRect(-creature.radius, -creature.radius, size, size);
  ctx.fillStyle = "rgba(255, 255, 255, 0.68)";
  ctx.fillRect(-creature.radius, -3, size, 6);
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.fillRect(creature.radius * 0.35, -creature.radius, creature.radius * 0.35, creature.radius * 0.35);
  ctx.restore();
}

function drawChargeHalos(ctx) {
  for (const creature of state.creatures) {
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

  Object.assign(window.Blazzlers, {
    draw,
    resizeCanvas,
  });
}());
