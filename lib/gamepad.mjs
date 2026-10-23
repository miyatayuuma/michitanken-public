/** Standard/XInput Gamepad API axis utilities; no place or player data. */
export const GAMEPAD_DEADZONE = 0.18;
export function radialStick(rawX, rawY, deadzone = GAMEPAD_DEADZONE) {
  const x = Number.isFinite(rawX) ? Math.max(-1, Math.min(1, rawX)) : 0;
  const y = Number.isFinite(rawY) ? Math.max(-1, Math.min(1, rawY)) : 0;
  const length = Math.hypot(x, y);
  if (length <= deadzone) return { x: 0, y: 0 };
  const amount = Math.pow((Math.min(length, 1) - deadzone) / (1 - deadzone), 0.9);
  return { x: x / length * amount, y: y / length * amount };
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * Return an orbit/pan/zoom step for the overview camera, independent of Three.js.
 * Camera and target are world coordinates; no state changes for zero input.
 * Pan scales with orbit radius so near zoom is precise and far zoom traverses a map.
 */
export function mapGamepadStep({ camera, target, moveX = 0, moveY = 0,
  lookX = 0, lookY = 0, zoomOut = 0, zoomIn = 0, dt = 0,
  minDistance = 15, maxDistance = 9000, maxPolarAngle = Math.PI / 2.05 }) {
  if (!(dt > 0) || ![moveX, moveY, lookX, lookY, zoomOut, zoomIn].some(Boolean) ||
      ![...camera, ...target].every(Number.isFinite)) {
    return { camera: [...camera], target: [...target] };
  }
  const seconds = Math.min(dt, 0.05);
  const dx = camera[0] - target[0], dy = camera[1] - target[1],
    dz = camera[2] - target[2];
  const distance = Math.max(1e-6, Math.hypot(dx, dy, dz));
  const bearing = Math.atan2(dx, dz);
  const polar = Math.acos(clamp(dy / distance, -1, 1));
  const panSpeed = clamp(distance * 0.65, 18, 1800) * seconds;
  // Left stick up pans into the image; right sticks rotate around the target.
  const panX = (Math.cos(bearing) * moveX + Math.sin(bearing) * moveY) * panSpeed;
  const panZ = (-Math.sin(bearing) * moveX + Math.cos(bearing) * moveY) * panSpeed;
  const nextTarget = [target[0] + panX, target[1], target[2] + panZ];
  const nextBearing = bearing - lookX * 1.65 * seconds;
  const nextPolar = clamp(polar + lookY * 1.05 * seconds, 0.08, maxPolarAngle);
  const nextDistance = clamp(
    distance * Math.exp((zoomOut - zoomIn) * 1.7 * seconds), minDistance, maxDistance);
  return {
    target: nextTarget,
    camera: [
      nextTarget[0] + nextDistance * Math.sin(nextPolar) * Math.sin(nextBearing),
      nextTarget[1] + nextDistance * Math.cos(nextPolar),
      nextTarget[2] + nextDistance * Math.sin(nextPolar) * Math.cos(nextBearing)
    ]
  };
}
