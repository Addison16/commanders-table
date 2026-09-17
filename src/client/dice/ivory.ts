import { add, dot, mul, type Vec } from './geometry.js';
import type { RoundedDie } from './rounded.js';
import type { VisualDie } from './DiceCanvas.js';

type Point = [number, number];
const inks: Record<string, string> = {
  ivory: '#53402b',
  blue: '#263e54',
  violet: '#493954',
  ember: '#6a3425',
  green: '#284a36',
  teal: '#244b4e',
  rose: '#642b43',
  copper: '#633f28',
};
// Soft pigments echo the seat colors while keeping the warm pearl highlights,
// fine grain, and dark engraved numbers of the original ivory material.
const pigments: Record<string, Vec> = {
  ivory: [239, 228, 205],
  blue: [164, 202, 240],
  violet: [194, 179, 233],
  ember: [245, 190, 161],
  green: [181, 218, 192],
  teal: [166, 222, 220],
  rose: [243, 188, 205],
  copper: [233, 202, 169],
};
function polygon(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}
export function diceSurfaceColor(normal: Vec, color: string, coin: boolean, variation = 0) {
  const key = Math.max(0, dot(normal, [-0.37, 0.53, 0.76]));
  const fill = Math.max(0, dot(normal, [0.65, 0.1, 0.75]));
  const gloss = Math.pow(Math.max(0, dot(normal, [-0.18, 0.3, 0.937])), coin ? 22 : 34);
  const light = 0.34 + key * 0.57 + fill * 0.16 + variation;
  const pigment =
    coin && (color === 'ivory' || !pigments[color]) ? [209, 175, 104] : (pigments[color] ?? pigments.ivory);
  return `rgb(${pigment.map((c, i) => Math.round(Math.min(255, c * light + gloss * (coin ? 80 : 43) + (2 - i) * 3))).join(',')})`;
}

export function drawIvoryDie(
  ctx: CanvasRenderingContext2D,
  mesh: RoundedDie,
  project: (v: Vec) => Point,
  rotate: (v: Vec) => Vec,
  die: VisualDie,
  scale: number,
) {
  const coin = die.sides === 2;
  const visible = mesh.surfaces
    .map((surface) => ({ ...surface, normal: rotate(surface.normal), depth: rotate(surface.center)[2] }))
    .filter((s) => s.normal[2] * 4.8 - dot(s.normal, rotate(s.center)) > 0)
    .sort((a, b) => a.depth - b.depth);
  ctx.lineJoin = 'round';
  for (const surface of visible) {
    polygon(ctx, surface.points.map(project));
    const color = diceSurfaceColor(surface.normal, die.color, coin);
    if (surface.faceIndex !== undefined) {
      const [x, y] = project(surface.center);
      const gradient = ctx.createLinearGradient(x - scale * 0.6, y - scale * 0.7, x + scale * 0.6, y + scale);
      gradient.addColorStop(0, diceSurfaceColor(surface.normal, die.color, coin, 0.035));
      gradient.addColorStop(0.55, color);
      gradient.addColorStop(1, diceSurfaceColor(surface.normal, die.color, coin, -0.035));
      ctx.fillStyle = gradient;
    } else ctx.fillStyle = color;
    ctx.fill();
    // Matching subpixel seams avoid dark wireframe outlines between fillets.
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.55;
    ctx.stroke();
  }
  for (const surface of visible) {
    const i = surface.faceIndex;
    if (i === undefined || surface.normal[2] < 0.12) continue;
    const face = mesh.faces[i];
    if (coin && face.points.length < 5) continue;
    const center = project(face.center);
    const u = project(add(face.center, mul(face.u, 0.1))),
      v = project(add(face.center, mul(face.v, 0.1)));
    ctx.save();
    polygon(ctx, face.points.map(project));
    ctx.clip();
    ctx.transform(
      (u[0] - center[0]) / 10,
      (u[1] - center[1]) / 10,
      (v[0] - center[0]) / -10,
      (v[1] - center[1]) / -10,
      center[0],
      center[1],
    );
    // Quiet natural striations stay attached to each face as it tumbles.
    if (!coin && scale > 28) {
      for (let band = 0; band < 5; band++) {
        ctx.beginPath();
        const y = -80 + band * 36 + (i % 3) * 9;
        ctx.moveTo(-130, y);
        ctx.bezierCurveTo(-30, y - 20, 20, y + 28, 130, y - 14);
        ctx.strokeStyle = band % 2 ? 'rgba(255,253,233,.085)' : 'rgba(126,98,52,.026)';
        ctx.lineWidth = band % 2 ? 5 : 1.4;
        ctx.stroke();
      }
    }
    const value = die.percent
      ? ((die.value / 10 + i) % 10) * 10
      : ((die.value - 1 + i + die.sides) % die.sides) + 1;
    const label = die.symbol
      ? '✦'
      : coin
        ? (die.value + i) % 2
          ? 'H'
          : 'T'
        : die.percent
          ? String(i === 0 ? die.value : value).padStart(2, '0')
          : String(i === 0 ? die.value : value);
    let fontSize = Math.min(70, face.inradius * (label.length > 1 ? 140 : 166));
    ctx.font = `600 ${fontSize}px Inter, sans-serif`;
    fontSize *= Math.min(1, (face.inradius * 148) / ctx.measureText(label).width);
    ctx.font = `600 ${fontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(label);
    const baseline = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    // A fine light lip below the dark cut reads as an engraving in the ivory.
    ctx.fillStyle = 'rgba(255,253,237,.85)';
    ctx.fillText(label, 0, baseline + 0.9);
    ctx.fillStyle = inks[die.color] ?? inks.ivory;
    ctx.shadowColor = 'rgba(58,39,16,.24)';
    ctx.shadowBlur = 0.7;
    ctx.shadowOffsetY = -0.5;
    ctx.fillText(label, 0, baseline);
    ctx.restore();
  }
}
