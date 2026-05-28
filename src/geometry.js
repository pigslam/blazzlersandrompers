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
    return getContact(a, b).touching;
  }

  function getContact(a, b) {
    if (a.kind === "blazzler" && b.kind === "blazzler") {
      return getCircleCircleContact(a, b);
    }

    if (a.kind === "romper" && b.kind === "romper") {
      return getSquareSquareContact(a, b);
    }

    const circle = a.kind === "blazzler" ? a : b;
    const square = a.kind === "romper" ? a : b;
    const contact = getCircleSquareContact(circle, square);

    if (circle === a) {
      return contact;
    }

    return reverseContact(contact);
  }

  function circleCircleTouch(a, b) {
    return getCircleCircleContact(a, b).touching;
  }

  function getCircleCircleContact(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const combinedRadius = a.radius + b.radius;
    const distance = Math.hypot(dx, dy);
    const touching = distance <= combinedRadius;

    return {
      normalX: distance === 0 ? 1 : (b.x - a.x) / distance,
      normalY: distance === 0 ? 0 : (b.y - a.y) / distance,
      overlap: touching ? combinedRadius - distance : 0,
      touching,
    };
  }

  function squareSquareTouch(a, b) {
    return getSquareSquareContact(a, b).touching;
  }

  function getSquareSquareContact(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const xOverlap = a.radius + b.radius - Math.abs(dx);
    const yOverlap = a.radius + b.radius - Math.abs(dy);
    const touching = xOverlap >= 0 && yOverlap >= 0;

    if (!touching) {
      return emptyContact();
    }

    if (xOverlap < yOverlap) {
      return {
        normalX: dx === 0 ? 1 : Math.sign(dx),
        normalY: 0,
        overlap: xOverlap,
        touching,
      };
    }

    return {
      normalX: 0,
      normalY: dy === 0 ? 1 : Math.sign(dy),
      overlap: yOverlap,
      touching,
    };
  }

  function circleSquareTouch(circle, square) {
    return getCircleSquareContact(circle, square).touching;
  }

  function getCircleSquareContact(circle, square) {
    const closestX = Math.max(square.x - square.radius, Math.min(circle.x, square.x + square.radius));
    const closestY = Math.max(square.y - square.radius, Math.min(circle.y, square.y + square.radius));
    const dx = circle.x - closestX;
    const dy = circle.y - closestY;
    const distance = Math.hypot(dx, dy);

    if (distance > 0) {
      const touching = distance <= circle.radius;

      return {
        normalX: -dx / distance,
        normalY: -dy / distance,
        overlap: touching ? circle.radius - distance : 0,
        touching,
      };
    }

    return getContainedCircleSquareContact(circle, square);
  }

  function overlapAmount(a, b) {
    return getContact(a, b).overlap;
  }

  function getContainedCircleSquareContact(circle, square) {
    const left = circle.x - (square.x - square.radius);
    const right = square.x + square.radius - circle.x;
    const top = circle.y - (square.y - square.radius);
    const bottom = square.y + square.radius - circle.y;
    const nearest = Math.min(left, right, top, bottom);

    if (nearest === left) {
      return containedContact(-1, 0, circle.radius + left);
    }

    if (nearest === right) {
      return containedContact(1, 0, circle.radius + right);
    }

    if (nearest === top) {
      return containedContact(0, -1, circle.radius + top);
    }

    return containedContact(0, 1, circle.radius + bottom);
  }

  function containedContact(circleToSquareX, circleToSquareY, overlap) {
    return {
      normalX: circleToSquareX,
      normalY: circleToSquareY,
      overlap,
      touching: true,
    };
  }

  function reverseContact(contact) {
    return {
      normalX: -contact.normalX,
      normalY: -contact.normalY,
      overlap: contact.overlap,
      touching: contact.touching,
    };
  }

  function emptyContact() {
    return {
      normalX: 1,
      normalY: 0,
      overlap: 0,
      touching: false,
    };
  }

  Object.assign(window.Blazzlers, {
    areTouching,
    circleCircleTouch,
    circleSquareTouch,
    clampBoundedCoordinate,
    getContact,
    keepInBounds,
    overlapAmount,
    randomBetween,
    randomBoundedCoordinate,
    randomDirection,
    squareSquareTouch,
  });
}());
