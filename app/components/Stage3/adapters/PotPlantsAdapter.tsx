// PotPlantsAdapter — 8 盆小盆栽.
// frame: 栽培 / self-care (我怎么照顾自己)
// semi-passive metaphor.
//
// 评分映射: 8 维度 → 8 盆植物高度 + 茂盛度.
//   10 = 茂盛挺拔 + 多叶
//   5 = 中等 + 适量叶
//   0 = 枯萎 / 没发芽 / 蔫
//
// animation curves:
//   0-0.5s: 托盘 + 8 盆 fade in
//   0.5-3s: 8 植物按评分慢慢长 (ease-out, 各自节奏不同)
//   3-4s: 风吹过, 茂盛的摇曳 ±2° (蔫的不摇)
//   4s+: 静止呈现, ambient breathing
//
// NCRW 4/4: user 是花匠, 植物是 self 8 维度状态, "忘浇" 是 humility 自嘲.
//
// design ref: vault Phase 3 design.md §二 Metaphor 4.

import { useEffect, useState } from "react";
import { mulberry32 } from "../random";
import type { AdapterProps } from "../types";

const VIEWBOX = { x: -240, y: -240, w: 480, h: 480 };
const TRAY_RADIUS = 200;
const TRAY_COLOR = "#a16207"; // 木盘色
const POT_RADIUS = 22;
const POT_RING_R = 150; // 8 盆围 ring 半径

export function PotPlantsAdapter({
  scores,
  visitSeed,
  craft,
}: Extract<AdapterProps, { metaphor: "pot-plants" }>) {
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
  const trayFade = Math.min(1, t / 0.5);
  // 8 植物长高 (0.5-3s), 各自节奏 (i * 0.1 错开)
  const plantGrowth = (i: number) =>
    Math.max(0, Math.min(1, (t - 0.5 - i * 0.1) / 2.0));
  // 风吹 3-4s
  const windPhase = t > 3 && t < 4 ? (t - 3) : 0;
  // ambient breathing 4s+
  const breathT = Math.max(0, t - 4);

  return (
    <svg
      viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
      className="h-auto w-full"
      role="img"
      aria-label="今日的盆栽场景"
    >
      <g
        opacity={trayFade}
        transform={`rotate(${craft.rotationJitter * 0.3})`}
      >
        {/* 木质托盘 (俯视圆) */}
        <Tray radius={TRAY_RADIUS} seed={visitSeed} />
        {/* 8 个陶盆 + 植物围 ring */}
        {scores.map((score, i) => {
          const angle = -90 + i * 45 + 22.5;
          const a = (angle * Math.PI) / 180;
          const cx = Math.cos(a) * POT_RING_R;
          const cy = Math.sin(a) * POT_RING_R;
          const growth = plantGrowth(i);
          // 风摇 — 茂盛的 (score > 5) 摇曳 ±2°
          const windAngle =
            windPhase > 0 && score > 5
              ? Math.sin(windPhase * Math.PI * 2 + i * 0.5) * 2
              : 0;
          // breathing ±0.5°
          const breath =
            breathT > 0 && score > 3
              ? Math.sin(breathT * 1.2 + i * 0.7) * 0.5
              : 0;
          return (
            <g
              key={`pot-${i}`}
              transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)})`}
            >
              {/* 陶盆 — 永远在, 不随 growth */}
              <Pot radius={POT_RADIUS} seed={visitSeed + i} />
              {/* 植物 — 高度 + 茂盛度 = f(score, growth) */}
              <g
                transform={`rotate(${windAngle + breath})`}
                style={{ transformOrigin: "0 0", transformBox: "fill-box" }}
              >
                <Plant
                  score={score}
                  growth={growth}
                  seed={visitSeed + i * 113}
                />
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function Tray({ radius, seed }: { radius: number; seed: number }) {
  const rng = mulberry32(seed);
  // 圆形托盘 + 木纹
  const pts: string[] = [];
  const N = 32;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const r = radius + (rng() - 0.5) * 5;
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
  }
  // 木纹 — 几条 concentric 弧线
  const grains: React.ReactElement[] = [];
  for (let i = 0; i < 5; i++) {
    const r = radius * (0.3 + i * 0.15) + (rng() - 0.5) * 8;
    grains.push(
      <circle
        key={`grain-${i}`}
        cx={(rng() - 0.5) * 30}
        cy={(rng() - 0.5) * 30}
        r={r}
        fill="none"
        stroke="#7c2d12"
        strokeWidth={0.8}
        opacity={0.3}
      />
    );
  }
  return (
    <g>
      <polygon
        points={pts.join(" ")}
        fill={TRAY_COLOR}
        stroke="#7c2d12"
        strokeWidth={2.5}
        strokeLinejoin="round"
        style={{ mixBlendMode: "multiply" }}
        opacity={0.6}
      />
      {grains}
    </g>
  );
}

function Pot({ radius, seed }: { radius: number; seed: number }) {
  const rng = mulberry32(seed);
  const tilt = (rng() - 0.5) * 6; // ±3°
  return (
    <g transform={`rotate(${tilt})`}>
      {/* 陶盆 — 梯形 (上窄下宽) */}
      <path
        d={`M ${-radius} ${-radius * 0.5} L ${radius} ${-radius * 0.5} L ${radius * 0.85} ${radius * 0.5} L ${-radius * 0.85} ${radius * 0.5} Z`}
        fill="#c2410c"
        stroke="#7c2d12"
        strokeWidth={2}
        strokeLinejoin="round"
        style={{ mixBlendMode: "multiply" }}
      />
      {/* 盆口黑 rim */}
      <line
        x1={-radius}
        y1={-radius * 0.5}
        x2={radius}
        y2={-radius * 0.5}
        stroke="#7c2d12"
        strokeWidth={2}
      />
    </g>
  );
}

function Plant({
  score,
  growth,
  seed,
}: {
  score: number;
  growth: number;
  seed: number;
}) {
  const rng = mulberry32(seed);
  // 高度 = score/10 * maxHeight * growth
  const maxHeight = 50;
  const height = (score / 10) * maxHeight * growth;
  if (score === 0 || height < 2) {
    // 没发芽 — 仅一小弯 (失败 anchor)
    return (
      <path
        d="M -2 -10 Q 0 -8 2 -10"
        fill="none"
        stroke="#65a30d"
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.4}
      />
    );
  }
  if (score <= 2) {
    // 蔫 / 枯 — 弯垂的茎, 几片黄叶
    return (
      <g transform={`translate(0 ${-12})`}>
        <path
          d={`M 0 0 Q 5 ${-height * 0.4} ${10 + (rng() - 0.5) * 4} ${-height * 0.8}`}
          fill="none"
          stroke="#a16207"
          strokeWidth={2}
          strokeLinecap="round"
        />
        {/* 1 片黄叶 */}
        <ellipse
          cx={6}
          cy={-height * 0.5}
          rx={4}
          ry={2}
          fill="#facc15"
          stroke="#a16207"
          strokeWidth={0.8}
          opacity={0.7}
          transform={`rotate(20 6 ${-height * 0.5})`}
        />
      </g>
    );
  }
  // 中等 / 茂盛 — 直立茎 + N 叶 (N ∝ score)
  const N = Math.round(score * 0.8); // 2-8 叶
  const leaves: React.ReactElement[] = [];
  for (let i = 0; i < N; i++) {
    const ly = -height * (0.2 + (i / N) * 0.7);
    const flip = i % 2 === 0 ? 1 : -1;
    const leafSize = 6 + rng() * 4;
    const leafTilt = flip * (30 + rng() * 20);
    leaves.push(
      <ellipse
        key={`leaf-${i}`}
        cx={flip * (leafSize * 0.5)}
        cy={ly}
        rx={leafSize}
        ry={leafSize * 0.45}
        fill="#65a30d"
        stroke="#3f6212"
        strokeWidth={0.8}
        opacity={0.85}
        transform={`rotate(${leafTilt} ${flip * leafSize * 0.5} ${ly})`}
        style={{ mixBlendMode: "multiply" }}
      />
    );
  }
  // 顶端芽 (score > 7 才有)
  const bud =
    score > 7 ? (
      <circle
        cx={0}
        cy={-height}
        r={4}
        fill="#f472b6"
        stroke="#9d174d"
        strokeWidth={0.8}
      />
    ) : null;
  return (
    <g transform={`translate(0 ${-12})`}>
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={-height}
        stroke="#3f6212"
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      {leaves}
      {bud}
    </g>
  );
}

export const POT_PLANTS_DURATION_MS = 5000;
