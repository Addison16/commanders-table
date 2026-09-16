import { useEffect, useRef } from 'react';
import { orient, rollSpin, type Vec } from './geometry.js';
import { roundedGeometry } from './rounded.js';
import { drawIvoryDie } from './ivory.js';

export type VisualDie = {
  value: number;
  sides: number;
  name?: string;
  color: string;
  percent?: boolean;
  symbol?: boolean;
};
type Body = { x: number; y: number; z: number; vx: number; vy: number; vz: number; seed: number };
const smooth = (n: number) => {
  const p = Math.max(0, Math.min(1, n));
  return p * p * (3 - 2 * p);
};
export function DiceCanvas({
  dice,
  seed,
  animate,
  onFinish,
  resultSpace = 300,
}: {
  dice: VisualDie[];
  seed: string;
  animate: boolean;
  onFinish: () => void;
  resultSpace?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const finish = useRef(onFinish);
  finish.current = onFinish;
  useEffect(() => {
    const element = canvas.current!;
    const context = element.getContext('2d');
    if (!context) {
      finish.current();
      return;
    }
    const ctx = context;
    let width = innerWidth,
      height = innerHeight,
      frame = 0,
      stopped = false,
      completed = false;
    let hash = Array.from(seed).reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
    const random = () => {
      hash ^= hash << 13;
      hash ^= hash >>> 17;
      hash ^= hash << 5;
      return (hash >>> 0) / 4294967296;
    };
    const bodies: Body[] = dice.map(() => ({
      x: random(),
      y: random(),
      z: 50 + random() * 100,
      vx: (random() > 0.5 ? 1 : -1) * (190 + random() * 210),
      vy: 80 + random() * 190,
      vz: 180 + random() * 180,
      seed: random(),
    }));
    let initialized = false;
    function resize() {
      const rect = element.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (!initialized) {
        bodies.forEach((b) => {
          b.x = width * (0.15 + b.x * 0.7);
          b.y = 85 + b.y * Math.max(30, height * 0.3);
        });
        initialized = true;
      }
      if (completed) draw(1, 0);
    }
    const start = performance.now(),
      duration = 2350;
    let previous = start;
    function draw(progress: number, dt: number) {
      ctx.clearRect(0, 0, width, height);
      const landscape = height < 500 && width > height;
      const trayWidth = landscape ? Math.max(160, width - 340) : width;
      const space = Math.max(110, height - (landscape ? 100 : Math.min(resultSpace, height * 0.57) + 85));
      const columns =
        dice.length > 10
          ? Math.max(2, Math.round(Math.sqrt((dice.length * trayWidth) / space)))
          : Math.min(dice.length, trayWidth < 520 ? (height < 650 && dice.length >= 6 ? 3 : 2) : 4);
      const rows = Math.ceil(dice.length / columns);
      const cellHeight = space / rows;
      const showNames = dice.length <= 10;
      const labelHeight = cellHeight < 85 ? 18 : 24;
      const cellRadius =
        showNames && dice.some((die) => die.name) ? (cellHeight - labelHeight - 14) / 2 : cellHeight * 0.35;
      const radius = Math.max(
        5,
        Math.min(dice.length === 1 ? 90 : 63, (trayWidth / columns) * 0.34, cellRadius),
      );
      const settle = smooth((progress - 0.67) / 0.33);
      if (animate && progress < 1) {
        for (const b of bodies) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.vz -= 1150 * dt;
          b.z += b.vz * dt;
          if (b.z < 0) {
            b.z = 0;
            b.vz = Math.abs(b.vz) > 45 ? -b.vz * 0.58 : 0;
          }
          if (b.x < radius + 8 || b.x > width - radius - 8) {
            b.x = Math.max(radius + 8, Math.min(width - radius - 8, b.x));
            b.vx *= -0.78;
          }
          if (b.y < radius + 65 || b.y > height - radius - 115) {
            b.y = Math.max(radius + 65, Math.min(height - radius - 115, b.y));
            b.vy *= -0.72;
          }
          b.vx *= Math.pow(0.982, dt * 60);
          b.vy *= Math.pow(0.987, dt * 60);
        }
        for (let i = 0; i < bodies.length; i++)
          for (let j = i + 1; j < bodies.length; j++) {
            const a = bodies[i],
              b = bodies[j],
              dx = b.x - a.x,
              dy = b.y - a.y,
              distance = Math.hypot(dx, dy);
            if (distance > 0.01 && distance < radius * 1.7 && Math.abs(a.z - b.z) < radius) {
              const nx = dx / distance,
                ny = dy / distance,
                push = (radius * 1.7 - distance) / 2;
              a.x -= nx * push;
              a.y -= ny * push;
              b.x += nx * push;
              b.y += ny * push;
              const speed = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
              if (speed > 0) {
                a.vx -= speed * nx;
                a.vy -= speed * ny;
                b.vx += speed * nx;
                b.vy += speed * ny;
              }
            }
          }
      }
      dice.forEach((die, index) => {
        const body = bodies[index],
          lastRowCount = dice.length - Math.floor(index / columns) * columns;
        const rowColumns = Math.min(columns, lastRowCount);
        const targetX = trayWidth * (((index % columns) + 0.5) / rowColumns);
        const targetY = 65 + cellHeight * (Math.floor(index / columns) + 0.5);
        const x = body.x * (1 - settle) + targetX * settle;
        const y = body.y * (1 - settle) + targetY * settle;
        const altitude = body.z * (1 - settle),
          scale = radius * (1 + altitude / 800);
        const spin = rollSpin(progress, body.seed);
        const mesh = roundedGeometry(die.sides, scale < 24 ? 2 : 4),
          base = mesh.faces[0];
        const rotation = (v: Vec) => orient(v, base, spin);
        // Kite-shaped d10 faces have an off-axis centroid. Center the result
        // face itself as the die settles, including percentile tens/ones.
        const anchor = rotation(base.center);
        const anchorScale = 4.8 / (4.8 - anchor[2]);
        const project = (v: Vec): [number, number] => {
          const r = rotation(v),
            perspective = 4.8 / (4.8 - r[2]);
          return [
            x + (r[0] * perspective - anchor[0] * anchorScale * settle) * scale,
            y - altitude * 0.3 - (r[1] * perspective - anchor[1] * anchorScale * settle) * scale,
          ];
        };
        ctx.save();
        ctx.translate(x + 5, y + scale * 0.62);
        ctx.scale(scale * 1.02, scale * 0.34);
        const shadow = ctx.createRadialGradient(0, 0, 0.12, 0, 0, 1);
        shadow.addColorStop(0, `rgba(0,0,0,${0.48 - Math.min(0.25, altitude / 650)})`);
        shadow.addColorStop(0.48, 'rgba(0,0,0,.18)');
        shadow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawIvoryDie(ctx, mesh, project, rotation, die, scale);
        if (die.name && showNames) {
          ctx.save();
          ctx.font = `600 ${labelHeight === 18 ? 10 : 12}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const label = die.name.length > 19 ? die.name.slice(0, 18) + '…' : die.name;
          const labelWidth = Math.min(trayWidth / columns - 12, ctx.measureText(label).width + 20);
          ctx.fillStyle = 'rgba(8,12,20,.9)';
          ctx.beginPath();
          ctx.roundRect(x - labelWidth / 2, y + scale + 7, labelWidth, labelHeight, 8);
          ctx.fill();
          ctx.fillStyle = '#f8ebd0';
          ctx.fillText(label, x, y + scale + 7 + labelHeight / 2, labelWidth - 10);
          ctx.restore();
        }
      });
    }
    function tick(now: number) {
      if (stopped) return;
      const progress = animate ? Math.min(1, (now - start) / duration) : 1;
      const dt = Math.min(0.032, (now - previous) / 1000);
      previous = now;
      if (!document.hidden) draw(progress, dt);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else {
        draw(1, 0);
        completed = true;
        finish.current();
      }
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [dice, seed, animate, resultSpace]);
  return <canvas className="dice-canvas" ref={canvas} aria-hidden="true" />;
}
