// PizzaAdapter — pizza 分动物宝宝.
// frame: 分配 (我把自己分给每个方面多少)
// passive metaphor.
//
// 评分映射: 8 维度 → 8 块切片大小. 评分 high → 块大 → 大动物.
// 圆心 = pizza 中心固定; 外缘 = 切片外沿.
//
// 8 动物 (从大到小, 固定 size 候选 sized to score):
//   维度顺序 (page.tsx DIMENSIONS 一致) →
//   家庭/朋友 → 大象
//   另一半/爱情 → 河马
//   娱乐与休闲 → 老虎
//   健康 → 长颈鹿
//   财富 → 兔子
//   个人成长 → 猫
//   环境 → 老鼠
//   职业 → 小鸟
//
// animation curves:
//   0-0.5s: pizza fade in
//   0.5-2s: 8 块切片大小调整到 8 评分
//   2-3.5s: 8 动物伸手 / 凑过来 (jitter motion)
//   3.5+: 静止呈现, 动物 ambient breathing
//
// NCRW 4/4: pizza 是 user, 动物是 environment 受益者, 不下 narrative.
//
// design ref: vault Phase 3 design.md §二 Metaphor 3.

import { useEffect, useState } from "react";
import { mulberry32 } from "../random";
import type { AdapterProps } from "../types";

const VIEWBOX = { x: -240, y: -240, w: 480, h: 480 };
const PIZZA_RADIUS = 110;
const PIZZA_BASE = "#f9c574"; // 面饼色
const PIZZA_SAUCE = "#cc3d2f"; // 番茄红
const PIZZA_STROKE = "#9c5a2e"; // 烤边色

// 8 动物 size (按 page.tsx DIMENSIONS 顺序):
// 大象 / 河马 / 老虎 / 长颈鹿 / 兔子 / 猫 / 老鼠 / 小鸟
const ANIMAL_NAMES = [
  "elephant",
  "hippo",
  "tiger",
  "giraffe",
  "rabbit",
  "cat",
  "mouse",
  "bird",
] as const;
type AnimalKind = (typeof ANIMAL_NAMES)[number];

export function PizzaAdapter({
  scores,
  visitSeed,
  craft,
}: Extract<AdapterProps, { metaphor: "pizza" }>) {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      setElapsedMs(now - start);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const t = elapsedMs / 1000;
  const pizzaFade = Math.min(1, t / 0.5);
  // 8 块切片大小 progress (0.5-2.0s)
  const sliceProgress = Math.max(0, Math.min(1, (t - 0.5) / 1.5));
  // 8 动物入场 (2.0-3.5s), 各自略错开 (i * 0.15)
  const animalProgress = (i: number) =>
    Math.max(0, Math.min(1, (t - 2.0 - i * 0.15) / 0.6));
  // ambient breathing for animals after 3.5s
  const breathT = Math.max(0, t - 3.5);

  // 8 块切片半径 = PIZZA_RADIUS * (score/10 base 0.35 + 0.65 weight) * sliceProgress
  const sliceRadius = (score: number) =>
    PIZZA_RADIUS * (0.35 + (score / 10) * 0.65) * sliceProgress;

  return (
    <svg
      viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
      className="h-auto w-full"
      role="img"
      aria-label="今日的 pizza 分动物场景"
    >
      <g
        opacity={pizzaFade}
        transform={`rotate(${craft.rotationJitter})`}
      >
        {/* Pizza 底盘 — 圆形面饼 */}
        <PizzaBase seed={visitSeed} radius={PIZZA_RADIUS} />
        {/* 8 块切片 — 番茄红 sauce, 大小 = 评分 */}
        {scores.map((score, i) => {
          const r = sliceRadius(score);
          if (r <= 0) return null;
          const startDeg = -90 + i * 45;
          const endDeg = startDeg + 45;
          return (
            <Slice
              key={`slice-${i}`}
              startDeg={startDeg}
              endDeg={endDeg}
              radius={r}
              seed={visitSeed + i * 31}
            />
          );
        })}
      </g>
      {/* 8 动物围一圈 (在 pizza 旋转外层, 不跟 pizza 转) */}
      {scores.map((score, i) => {
        const ap = animalProgress(i);
        if (ap <= 0) return null;
        const angle = -90 + i * 45 + 22.5; // sector 中线
        // 动物围圈半径 — 比 pizza 外大 90px
        const ringR = PIZZA_RADIUS + 100;
        const a = (angle * Math.PI) / 180;
        const x = Math.cos(a) * ringR;
        const y = Math.sin(a) * ringR;
        // breathing — small ±2px y
        const breath =
          breathT > 0 ? Math.sin(breathT * 1.5 + i * 0.8) * 2 : 0;
        // size: high score → 大动物 size 60, low score → 小动物 size 28
        const size = 28 + (score / 10) * 32;
        return (
          <g
            key={`animal-${i}`}
            transform={`translate(${x.toFixed(1)} ${(y + breath).toFixed(1)})`}
            opacity={ap}
          >
            <Animal kind={ANIMAL_NAMES[i]} size={size} faceAngle={angle + 180} />
          </g>
        );
      })}
    </svg>
  );
}

function PizzaBase({ seed, radius }: { seed: number; radius: number }) {
  const rng = mulberry32(seed);
  // 烤边略不规则
  const pts: string[] = [];
  const N = 28;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const r = radius + (rng() - 0.5) * 6;
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
  }
  // 内圈 sauce
  const sauceR = radius * 0.85;
  return (
    <g>
      <polygon
        points={pts.join(" ")}
        fill={PIZZA_BASE}
        stroke={PIZZA_STROKE}
        strokeWidth={3}
        strokeLinejoin="round"
        style={{ mixBlendMode: "multiply" }}
      />
      <circle
        cx={0}
        cy={0}
        r={sauceR}
        fill={PIZZA_SAUCE}
        opacity={0.6}
        style={{ mixBlendMode: "multiply" }}
      />
      {/* 撒料 — 几粒 olive / 香肠 dot */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = rng() * Math.PI * 2;
        const r = rng() * sauceR * 0.9;
        return (
          <circle
            key={`topping-${i}`}
            cx={Math.cos(a) * r}
            cy={Math.sin(a) * r}
            r={3 + rng() * 3}
            fill={rng() < 0.5 ? "#52525b" : "#9c5a2e"}
            opacity={0.7}
          />
        );
      })}
    </g>
  );
}

function Slice({
  startDeg,
  endDeg,
  radius,
  seed,
}: {
  startDeg: number;
  endDeg: number;
  radius: number;
  seed: number;
}) {
  // 切线 visual — 沿 startDeg / endDeg 两道虚线从中心到外缘 (pizza 切 8 块的痕迹)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a1 = toRad(startDeg);
  const a2 = toRad(endDeg);
  const x1 = Math.cos(a1) * radius;
  const y1 = Math.sin(a1) * radius;
  const x2 = Math.cos(a2) * radius;
  const y2 = Math.sin(a2) * radius;
  return (
    <g>
      <line
        x1={0}
        y1={0}
        x2={x1.toFixed(1)}
        y2={y1.toFixed(1)}
        stroke="#7c5a2e"
        strokeWidth={1.5}
        strokeDasharray="2 3"
        opacity={0.6}
      />
      <line
        x1={0}
        y1={0}
        x2={x2.toFixed(1)}
        y2={y2.toFixed(1)}
        stroke="#7c5a2e"
        strokeWidth={1.5}
        strokeDasharray="2 3"
        opacity={0.6}
      />
      {/* 切块 boundary 外弧 — 加重显示当前 sector */}
      <path
        d={`M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${radius.toFixed(1)} ${radius.toFixed(1)} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`}
        fill="none"
        stroke="#7c5a2e"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.7}
      />
    </g>
  );
}

function Animal({
  kind,
  size,
  faceAngle,
}: {
  kind: AnimalKind;
  size: number;
  faceAngle: number;
}) {
  // 简笔动物 — 一律用极简风格. body + head 简化, face 朝 pizza 方向.
  const flip = Math.cos((faceAngle * Math.PI) / 180) > 0 ? 1 : -1;
  return (
    <g transform={`scale(${flip} 1)`}>
      {renderAnimalShape(kind, size)}
    </g>
  );
}

function renderAnimalShape(kind: AnimalKind, size: number) {
  const s = size / 60; // 1.0 = default size 60
  const stroke = "#52525b";
  const sw = 2;
  switch (kind) {
    case "elephant":
      return (
        <g transform={`scale(${s})`}>
          {/* 大象 — 圆 body + 长鼻子 */}
          <ellipse cx={0} cy={5} rx={22} ry={16} fill="#9ca3af" stroke={stroke} strokeWidth={sw} />
          <circle cx={-18} cy={-5} r={13} fill="#9ca3af" stroke={stroke} strokeWidth={sw} />
          <path d="M -28 0 Q -36 8 -30 16" fill="none" stroke={stroke} strokeWidth={sw + 1} strokeLinecap="round" />
          <circle cx={-22} cy={-7} r={1.5} fill="#27272a" />
          <path d="M -10 -10 L -5 -20 L -2 -10 Z" fill="#9ca3af" stroke={stroke} strokeWidth={sw - 0.5} />
          <line x1={10} y1={20} x2={10} y2={26} stroke={stroke} strokeWidth={sw} />
          <line x1={18} y1={20} x2={18} y2={26} stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case "hippo":
      return (
        <g transform={`scale(${s})`}>
          {/* 河马 — 大 head 短 body */}
          <ellipse cx={0} cy={5} rx={18} ry={12} fill="#a78bfa" stroke={stroke} strokeWidth={sw} />
          <ellipse cx={-12} cy={-3} rx={14} ry={10} fill="#a78bfa" stroke={stroke} strokeWidth={sw} />
          <circle cx={-16} cy={-2} r={1.5} fill="#27272a" />
          <ellipse cx={-18} cy={3} rx={4} ry={2} fill="#27272a" />
          <line x1={6} y1={15} x2={6} y2={20} stroke={stroke} strokeWidth={sw} />
          <line x1={12} y1={15} x2={12} y2={20} stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case "tiger":
      return (
        <g transform={`scale(${s})`}>
          {/* 老虎 — 橙色带斑 */}
          <ellipse cx={0} cy={5} rx={16} ry={11} fill="#fb923c" stroke={stroke} strokeWidth={sw} />
          <circle cx={-13} cy={-2} r={10} fill="#fb923c" stroke={stroke} strokeWidth={sw} />
          <path d="M -19 -10 L -16 -15 L -14 -10 Z M -10 -10 L -7 -15 L -5 -10 Z" fill="#fb923c" stroke={stroke} strokeWidth={sw - 0.5} />
          <circle cx={-16} cy={-3} r={1.2} fill="#27272a" />
          <circle cx={-10} cy={-3} r={1.2} fill="#27272a" />
          {/* 斑纹 */}
          <path d="M 0 -3 L 0 3 M 8 0 L 8 8 M -3 5 L -3 12" stroke="#27272a" strokeWidth={1.2} />
        </g>
      );
    case "giraffe":
      return (
        <g transform={`scale(${s})`}>
          {/* 长颈鹿 — 长脖子 */}
          <ellipse cx={2} cy={10} rx={11} ry={8} fill="#fcd34d" stroke={stroke} strokeWidth={sw} />
          <path d="M -8 5 L -12 -15" stroke={stroke} strokeWidth={6} strokeLinecap="round" />
          <circle cx={-13} cy={-18} r={6} fill="#fcd34d" stroke={stroke} strokeWidth={sw} />
          <line x1={-13} y1={-22} x2={-13} y2={-26} stroke={stroke} strokeWidth={sw} />
          <line x1={-10} y1={-22} x2={-9} y2={-26} stroke={stroke} strokeWidth={sw} />
          <circle cx={-15} cy={-18} r={1} fill="#27272a" />
          {/* 斑 */}
          <circle cx={-2} cy={8} r={2} fill="#92400e" opacity={0.7} />
          <circle cx={5} cy={12} r={2} fill="#92400e" opacity={0.7} />
        </g>
      );
    case "rabbit":
      return (
        <g transform={`scale(${s})`}>
          {/* 兔子 — 圆头 + 长耳 */}
          <ellipse cx={0} cy={8} rx={10} ry={8} fill="#fafafa" stroke={stroke} strokeWidth={sw} />
          <circle cx={-8} cy={-2} r={8} fill="#fafafa" stroke={stroke} strokeWidth={sw} />
          <ellipse cx={-10} cy={-12} rx={2.5} ry={8} fill="#fafafa" stroke={stroke} strokeWidth={sw} />
          <ellipse cx={-5} cy={-12} rx={2.5} ry={8} fill="#fafafa" stroke={stroke} strokeWidth={sw} />
          <circle cx={-10} cy={-3} r={1} fill="#27272a" />
          <circle cx={-5} cy={-3} r={1} fill="#27272a" />
          <path d="M -8 1 Q -7 3 -6 1" fill="none" stroke="#27272a" strokeWidth={1} />
        </g>
      );
    case "cat":
      return (
        <g transform={`scale(${s})`}>
          {/* 猫 — 小耳 + 须 */}
          <ellipse cx={0} cy={5} rx={8} ry={6} fill="#a3a3a3" stroke={stroke} strokeWidth={sw} />
          <circle cx={-6} cy={-2} r={6} fill="#a3a3a3" stroke={stroke} strokeWidth={sw} />
          <path d="M -10 -7 L -8 -12 L -5 -7 Z M -4 -7 L -2 -12 L 0 -7 Z" fill="#a3a3a3" stroke={stroke} strokeWidth={sw - 0.5} />
          <circle cx={-8} cy={-3} r={0.8} fill="#27272a" />
          <circle cx={-3} cy={-3} r={0.8} fill="#27272a" />
          <path d="M -5 0 Q -4 2 -3 0 M -10 -1 L -14 -2 M -10 1 L -14 1" stroke={stroke} strokeWidth={0.8} fill="none" />
        </g>
      );
    case "mouse":
      return (
        <g transform={`scale(${s})`}>
          {/* 老鼠 — 圆 body + 大耳 */}
          <ellipse cx={0} cy={3} rx={5} ry={4} fill="#d4d4d8" stroke={stroke} strokeWidth={sw - 0.5} />
          <circle cx={-4} cy={-2} r={4} fill="#d4d4d8" stroke={stroke} strokeWidth={sw - 0.5} />
          <circle cx={-7} cy={-5} r={2.5} fill="#d4d4d8" stroke={stroke} strokeWidth={sw - 0.5} />
          <circle cx={-5} cy={-2} r={0.7} fill="#27272a" />
          <path d="M 4 3 L 10 5" stroke={stroke} strokeWidth={1} />
        </g>
      );
    case "bird":
      return (
        <g transform={`scale(${s})`}>
          {/* 小鸟 — 圆 body + 翅 + 喙 */}
          <ellipse cx={0} cy={0} rx={5} ry={4} fill="#60a5fa" stroke={stroke} strokeWidth={sw - 0.5} />
          <circle cx={-3} cy={-2} r={3} fill="#60a5fa" stroke={stroke} strokeWidth={sw - 0.5} />
          <path d="M -6 -2 L -10 -1 L -6 0 Z" fill="#f59e0b" stroke={stroke} strokeWidth={0.8} />
          <circle cx={-4} cy={-3} r={0.6} fill="#27272a" />
          <path d="M 1 -2 Q 5 -4 4 0" fill="none" stroke={stroke} strokeWidth={1.2} />
        </g>
      );
  }
}

export const PIZZA_DURATION_MS = 5000;
