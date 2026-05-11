// HatchFill primitive — Phase 2 sediment N ∝ r² constant density 抽取.
// 给定圆扇区 (cx=0, cy=0 锚定; startDeg / endDeg / radius) 在内部 sample N 条
// jitter 短 stroke. 跨 score range density 视觉 constant (低分小扇区不显密, 高
// 分大扇区不显潦草).
//
// 用于: CarAdapter 的 wheel sector fill (跟 page.tsx ScribbleHatchingFill 同算法
// 但 sector geometry 由 caller 控制).
//
// design ref: vault Phase 3 design.md §三 primitives + Phase 2 craft sediment.

import { mulberry32, hashSeed } from "../random";

interface HatchFillProps {
  // 扇区角度范围 (deg, screen coords, atan2 sense — y down). e.g. -90 -> -45
  startDeg: number;
  endDeg: number;
  radius: number; // 扇区外缘半径
  // 颜色 — fill 主色, stroke 自带 ±lightness jitter (24%)
  color: string;
  // seed 让重渲染稳定 (跟 sector index 挂钩)
  seed: number;
  // press 中色块半径在变但 stroke pattern 不动 — Phase 2 sediment.
  // strokePatternRadius = 决定 stroke 数 + 位置. 缺省 = radius.
  strokePatternRadius?: number;
  // 压感: stroke width pressure scale (high score = press 深 = stroke 粗)
  pressureScale?: number;
}

export function HatchFill({
  startDeg,
  endDeg,
  radius,
  color,
  seed,
  strokePatternRadius,
  pressureScale = 1,
}: HatchFillProps) {
  if (radius <= 0) return null;
  const sweepDeg = endDeg - startDeg;
  const r = strokePatternRadius ?? radius;
  // N ∝ sector area (∝ r²) — constant density 跨 score
  // (sweepDeg / 360) × π × r² × density
  const sectorArea = ((sweepDeg / 360) * Math.PI * r * r);
  const N = Math.max(18, Math.round(sectorArea * 0.012));
  const rng = mulberry32(hashSeed(seed, 0xd2, N));
  const lines: React.ReactElement[] = [];
  const sectorMidDeg = startDeg + sweepDeg / 2;
  const baseStrokeDeg = sectorMidDeg + 70; // 跟扇区中线 ~70° 夹角
  const toRad = (d: number) => (d * Math.PI) / 180;
  for (let i = 0; i < N; i++) {
    const tR = Math.sqrt(rng());
    const r0 = tR * r * 0.95;
    const theta0Deg = startDeg + rng() * sweepDeg;
    const theta0 = toRad(theta0Deg);
    const x0 = Math.cos(theta0) * r0;
    const y0 = Math.sin(theta0) * r0;
    const strokeAngleDeg = baseStrokeDeg + (rng() - 0.5) * 50;
    const strokeAngle = toRad(strokeAngleDeg);
    const len = 10 + rng() * (rng() > 0.7 ? 50 : 25);
    const half = len / 2;
    const x1 = x0 - Math.cos(strokeAngle) * half;
    const y1 = y0 - Math.sin(strokeAngle) * half;
    const x2 = x0 + Math.cos(strokeAngle) * half;
    const y2 = y0 + Math.sin(strokeAngle) * half;
    const sw = (1.0 + rng() * 1.6) * pressureScale;
    const lightDelta = (rng() - 0.5) * 0.24;
    const strokeColor = jitterColor(color, lightDelta);
    const op = 0.5 + rng() * 0.35;
    lines.push(
      <line
        key={`hatch-${seed}-${i}`}
        x1={x1.toFixed(3)}
        y1={y1.toFixed(3)}
        x2={x2.toFixed(3)}
        y2={y2.toFixed(3)}
        stroke={strokeColor}
        strokeWidth={sw.toFixed(2)}
        strokeLinecap="round"
        opacity={op.toFixed(2)}
        style={{ mixBlendMode: "multiply" }}
      />
    );
  }
  return <g>{lines}</g>;
}

// 同色 lightness jitter helper — page.tsx 复用算法但在 primitive 内 local 保持自洽.
function jitterColor(hex: string, lightDelta: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  if (lightDelta >= 0) {
    return `#${toHex(r + (255 - r) * lightDelta)}${toHex(
      g + (255 - g) * lightDelta
    )}${toHex(b + (255 - b) * lightDelta)}`;
  }
  const k = 1 + lightDelta;
  return `#${toHex(r * k)}${toHex(g * k)}${toHex(b * k)}`;
}
