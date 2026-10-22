import type { BotFace, CharacterPose, EyeQuad } from "@rakazo/core";
import { eyeQuads } from "@rakazo/core";

/** An eye stroke as plain numbers, so worklets can blend faces: x0 y0 x1 y1 x2 y2 width. */
export type EyeNumbers = number[];

export function faceNumbers(face: BotFace, unit: number, size: number): EyeNumbers[] {
  return eyeQuads(face, unit, size).map((q) => [q.x0, q.y0, q.x1, q.y1, q.x2, q.y2, q.width]);
}

/** Blend two faces stroke by stroke: `t` 0 is `from`, 1 is `to`. */
export function mixFaces(from: EyeNumbers[], to: EyeNumbers[], t: number): EyeNumbers[] {
  "worklet";
  return to.map((eye, i) =>
    eye.map((value, k) => (from[i]?.[k] ?? value) + (value - (from[i]?.[k] ?? value)) * t),
  );
}

/** Where each eye sits and how the eye layers move, in viewBox units. */
export type EyePlacement = {
  /** The eye pair's center in the viewBox. */
  x: number;
  y: number;
  /** The organic blob tilts its eye pair by a few degrees. */
  rotate: number;
  unit: number;
};

const r2 = (value: number) => {
  "worklet";
  return Math.round(value * 100) / 100;
};

/**
 * The outline of a thick quadratic stroke with round caps, as a closed SVG path: the eye drawn
 * as a hole. A straight stroke gives Grok's stadium. The outline is built in the eye's own space
 * and then moved like web's nested eye groups: `eyes` squashes and shifts it (a blink flattens
 * the whole stroke), `look` shifts the pair (gaze), `turn` narrows it as the head turns, and the
 * pair is rotated and placed in the viewBox.
 */
export function eyeHole(
  eye: EyeNumbers,
  place: EyePlacement,
  eyes: CharacterPose,
  look: CharacterPose,
  turn: number,
): string {
  "worklet";
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0, x2 = 0, y2 = 0, width = 1] = eye;
  const unitPct = place.unit / 100;
  const cos = Math.cos((place.rotate * Math.PI) / 180);
  const sin = Math.sin((place.rotate * Math.PI) / 180);
  const half = width / 2;
  const points: number[] = [];
  const add = (x: number, y: number) => {
    const ex = (eyes.sx * x + eyes.tx * unitPct) * turn;
    const ey = eyes.sy * y + eyes.ty * unitPct;
    const lx = ex + look.tx * unitPct;
    const ly = ey + look.ty * unitPct;
    points.push(place.x + lx * cos - ly * sin, place.y + lx * sin + ly * cos);
  };
  const at = (t: number) => {
    const mt = 1 - t;
    const px = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2;
    const py = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2;
    let dx = 2 * mt * (x1 - x0) + 2 * t * (x2 - x1);
    let dy = 2 * mt * (y1 - y0) + 2 * t * (y2 - y1);
    if (dx === 0 && dy === 0) {
      dx = x2 - x0;
      dy = y2 - y0;
    }
    const len = Math.hypot(dx, dy) || 1;
    return [px, py, dx / len, dy / len];
  };
  const steps = 8;
  const capSteps = 8;
  // One side forward, the end cap, the other side back, the start cap.
  for (let i = 0; i <= steps; i++) {
    const [px = 0, py = 0, tx = 1, ty = 0] = at(i / steps);
    add(px - ty * half, py + tx * half);
  }
  const [ex = 0, ey = 0, etx = 1, ety = 0] = at(1);
  const endAngle = Math.atan2(etx, -ety);
  for (let k = 1; k < capSteps; k++) {
    const a = endAngle - (Math.PI * k) / capSteps;
    add(ex + Math.cos(a) * half, ey + Math.sin(a) * half);
  }
  for (let i = steps; i >= 0; i--) {
    const [px = 0, py = 0, tx = 1, ty = 0] = at(i / steps);
    add(px + ty * half, py - tx * half);
  }
  const [sx = 0, sy = 0, stx = 1, sty = 0] = at(0);
  const startAngle = Math.atan2(-stx, sty);
  for (let k = 1; k < capSteps; k++) {
    const a = startAngle - (Math.PI * k) / capSteps;
    add(sx + Math.cos(a) * half, sy + Math.sin(a) * half);
  }
  let d = "";
  for (let i = 0; i < points.length; i += 2) {
    d += `${i === 0 ? "M" : " L"} ${r2(points[i] ?? 0)} ${r2(points[i + 1] ?? 0)}`;
  }
  return `${d} Z`;
}

export type { EyeQuad };
