// CampfiresAdapter — 8 堆篝火.
// frame: 温度 / 热度 (哪堆还旺)
// passive metaphor.
//
// 评分映射: 8 维度 → 8 堆火苗高度 + 颜色.
//   10 = 火苗高 + 红橙跳
//   5 = 余烬 + 橘色微亮
//   0 = 灰烬 + 灰色 (一缕烟)
//
// animation curves:
//   0-0.5s: 夜场 fade in
//   0.5-2.5s: 8 堆火按评分升起 (各自节奏, ease-out)
//   2.5+: 火苗呼吸跳跃 ambient motion (持续 loop)
//
// NCRW 4/4: user 围在火边, 火堆是 8 维度 self 状态.
//
// design ref: vault Phase 3 design.md §二 Metaphor 5.

import { useEffect, useState } from "react";
import { mulberry32 } from "../random";
import type { AdapterProps } from "../types";

const VIEWBOX = { x: -240, y: -240, w: 480, h: 480 };
const GROUND_RADIUS = 200;
const FIRE_RING_R = 140;

export function CampfiresAdapter({
  scores,
  visitSeed,
  craft,
  onFinish,
}: Extract<AdapterProps, { metaphor: "campfires" }>) {
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

  // Phase 3 — animation 跑完后通知 page.tsx 转到 reflect.
  // 主 rAF 在 page.tsx 已 gate 给 car only, 这里 setTimeout 不会 double-trigger.
  useEffect(() => {
    if (!onFinish) return;
    const t = window.setTimeout(onFinish, CAMPFIRES_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [onFinish]);

  const t = elapsedMs / 1000;
  const sceneFade = Math.min(1, t / 0.5);
  // 8 堆火上升 (0.5-2.5s), 各自节奏
  const fireRise = (i: number) =>
    Math.max(0, Math.min(1, (t - 0.5 - i * 0.15) / 1.2));
  // ambient flicker (持续)
  const flickerT = Math.max(0, t - 1.5);

  return (
    <svg
      viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
      className="h-auto w-full"
      role="img"
      aria-label="今日的篝火场景"
    >
      <g
        opacity={sceneFade}
        transform={`rotate(${craft.rotationJitter * 0.2})`}
      >
        {/* 夜场背景 — 圆形棕地 + 几粒星 (装饰) */}
        <Ground radius={GROUND_RADIUS} seed={visitSeed} />
        {/* 8 堆篝火 */}
        {scores.map((score, i) => {
          const angle = -90 + i * 45 + 22.5;
          const a = (angle * Math.PI) / 180;
          const cx = Math.cos(a) * FIRE_RING_R;
          const cy = Math.sin(a) * FIRE_RING_R;
          const rise = fireRise(i);
          return (
            <g
              key={`fire-${i}`}
              transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)})`}
            >
              <Campfire
                score={score}
                rise={rise}
                flickerT={flickerT + i * 0.4}
                seed={visitSeed + i * 71}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function Ground({ radius, seed }: { radius: number; seed: number }) {
  const rng = mulberry32(seed);
  // 圆形棕地
  const pts: string[] = [];
  const N = 24;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const r = radius + (rng() - 0.5) * 8;
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
  }
  // 星 — 几粒 (装饰, 暗示夜)
  const stars: React.ReactElement[] = [];
  for (let i = 0; i < 8; i++) {
    const a = rng() * Math.PI * 2;
    const r = radius + 10 + rng() * 25;
    stars.push(
      <circle
        key={`star-${i}`}
        cx={Math.cos(a) * r}
        cy={Math.sin(a) * r}
        r={1.5 + rng() * 1}
        fill="#fef9c3"
        opacity={0.6}
      />
    );
  }
  return (
    <g>
      {stars}
      <polygon
        points={pts.join(" ")}
        fill="#451a03"
        stroke="#1c1917"
        strokeWidth={2}
        strokeLinejoin="round"
        opacity={0.85}
        style={{ mixBlendMode: "multiply" }}
      />
    </g>
  );
}

function Campfire({
  score,
  rise,
  flickerT,
  seed,
}: {
  score: number;
  rise: number;
  flickerT: number;
  seed: number;
}) {
  const rng = mulberry32(seed);
  // 火堆 base — 几根木柴 (永远在)
  const logs = (
    <g>
      <line x1={-12} y1={6} x2={12} y2={2} stroke="#7c2d12" strokeWidth={3.5} strokeLinecap="round" />
      <line x1={-10} y1={2} x2={11} y2={7} stroke="#52341a" strokeWidth={3.5} strokeLinecap="round" />
      <line x1={-6} y1={-2} x2={8} y2={4} stroke="#7c2d12" strokeWidth={3} strokeLinecap="round" />
    </g>
  );

  if (score === 0) {
    // 灰烬 + 一缕烟
    const smokeWiggle = Math.sin(flickerT * 2) * 3;
    return (
      <g>
        {logs}
        <ellipse
          cx={0}
          cy={4}
          rx={14}
          ry={3}
          fill="#a8a29e"
          opacity={0.6}
        />
        {/* 烟 — 几个圆 fade up */}
        <g opacity={rise * 0.5}>
          <circle cx={smokeWiggle} cy={-15} r={4} fill="#a8a29e" opacity={0.4} />
          <circle cx={-smokeWiggle * 1.2} cy={-25} r={5} fill="#d6d3d1" opacity={0.3} />
          <circle cx={smokeWiggle * 0.8} cy={-36} r={6} fill="#e7e5e4" opacity={0.2} />
        </g>
      </g>
    );
  }

  // score 1-10: 火苗高度 + 颜色
  const flameHeight = (8 + score * 8) * rise; // 16-88px
  // 跳跃 — flicker amplitude 跟 score 成正比
  const flicker = Math.sin(flickerT * 6) * 2 + Math.sin(flickerT * 9.7) * 1.2;
  const h = flameHeight + (score > 3 ? flicker : 0);

  // 颜色: low → 橘色微亮; mid → 橙黄; high → 红橙
  const outerColor =
    score <= 3 ? "#ea580c" : score <= 6 ? "#f97316" : "#ef4444";
  const midColor =
    score <= 3 ? "#f59e0b" : score <= 6 ? "#fbbf24" : "#f97316";
  const innerColor = "#fef3c7";

  // 火苗 path — 三层 nested teardrops, scale 跟 height 走
  return (
    <g>
      {logs}
      <g transform={`translate(0 -2)`} style={{ mixBlendMode: "multiply" }}>
        {/* 外层 — 大火 */}
        <path
          d={flameShape(h, h * 0.55, rng)}
          fill={outerColor}
          opacity={0.85}
        />
        {/* 中层 */}
        <path
          d={flameShape(h * 0.7, h * 0.4, rng)}
          fill={midColor}
          opacity={0.9}
        />
        {/* 内核 */}
        <path
          d={flameShape(h * 0.45, h * 0.25, rng)}
          fill={innerColor}
          opacity={0.95}
        />
      </g>
      {/* 火星 (score > 5) */}
      {score > 5 &&
        Array.from({ length: 3 }).map((_, i) => {
          const phase = (flickerT * 0.5 + i * 0.4) % 1;
          const spY = -h - 5 - phase * 20;
          const spX = Math.sin(flickerT * 2 + i) * 8;
          return (
            <circle
              key={`spark-${i}`}
              cx={spX.toFixed(1)}
              cy={spY.toFixed(1)}
              r={1.5}
              fill="#fbbf24"
              opacity={1 - phase}
            />
          );
        })}
    </g>
  );
}

function flameShape(height: number, width: number, rng: () => number): string {
  // teardrop: bottom wide, top pointed.
  // path: M -w 0  Q -w*0.7 -h*0.5  -w*0.2 -h*0.85  Q 0 -h  w*0.2 -h*0.85  Q w*0.7 -h*0.5  w 0  Z
  const j = () => (rng() - 0.5) * 2;
  const w = width;
  const h = height;
  return `M ${(-w).toFixed(1)} 0 Q ${(-w * 0.7 + j()).toFixed(1)} ${(-h * 0.5).toFixed(1)} ${(-w * 0.2 + j()).toFixed(1)} ${(-h * 0.85).toFixed(1)} Q ${j().toFixed(1)} ${(-h).toFixed(1)} ${(w * 0.2 + j()).toFixed(1)} ${(-h * 0.85).toFixed(1)} Q ${(w * 0.7 + j()).toFixed(1)} ${(-h * 0.5).toFixed(1)} ${w.toFixed(1)} 0 Z`;
}

export const CAMPFIRES_DURATION_MS = 5000;
