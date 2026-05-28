(function () {
  window.Blazzlers = window.Blazzlers || {};

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

  function keepInBounds(creature, worldWidth, worldHeight) {
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

  function overlapAmount(a, b) {
    if (a.kind === "romper" && b.kind === "romper") {
      return Math.max(0, a.radius + b.radius - Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)));
    }

    return Math.max(0, a.radius + b.radius - Math.hypot(a.x - b.x, a.y - b.y));
  }

  Object.assign(window.Blazzlers, {
    areTouching,
    circleCircleTouch,
    circleSquareTouch,
    clampBoundedCoordinate,
    keepInBounds,
    overlapAmount,
    randomBetween,
    randomBoundedCoordinate,
    randomDirection,
    squareSquareTouch,
  });
}());
