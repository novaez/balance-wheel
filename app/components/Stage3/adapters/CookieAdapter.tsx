// CookieAdapter — 饼干被巨人咬留 wheel 形状.
// frame: 被啃食 (我被 environment 消耗后剩什么)
// passive metaphor.
//
// 评分映射: 8 维度 → 8 道咬痕深度. 低分 = 深咬到圆心, 高分 = 浅咬 / 未咬.
// 圆心 = 完整饼干中心, 外缘 = 咬到边缘.
//
// animation curves:
//   0-1s: 巨人手从右侧伸过来拿起饼干 (translateX -200 → 0)
//   1-5s: 8 次咬 (each 0.5s, 8 道咬痕渐次出现 with 颤抖 jitter)
//   5s+:  静止呈现, 微 ambient motion (饼干 ±0.5° rock)
//
// NCRW 4 boundary 戏剧解构 pattern — 跳第一人称但守 humility:
//   (a) user 看着饼干被啃 (跳第一人称, 但 ta 投射意义 + 笑作 humility 延伸)
//   (b) 笑点 anchor 饼干自己被嚼散 (饼干 = 我此刻的形状, 不在巨人反应)
//   (c) product 不读 metaphor 含义 (静默呈现)
//   (d) 无 narrative resolution (没消化 / 没逃出, 静止结束让 user 留 sense-making 空间)
//
// design ref: vault Phase 3 design.md §二 Metaphor 2.

import { useEffect, useState } from "react";
import { mulberry32 } from "../random";
import type { AdapterProps } from "../types";

const VIEWBOX = { x: -200, y: -200, w: 400, h: 400 };
const COOKIE_RADIUS = 130;
const COOKIE_COLOR = "#c8954a"; // 饼干色
const COOKIE_STROKE = "#7c5a2e"; // 烤色边

export function CookieAdapter({
  scores,
  visitSeed,
  craft,
}: Extract<AdapterProps, { metaphor: "cookie" }>) {
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

  // 巨人手 — 0-1s slide in from right
  const handProgress = Math.min(1, t / 1.0);
  const handX = 200 - 200 * easeOut(handProgress);

  // 8 道咬痕 — 1-5s, 每 0.5s 出一道
  const biteVisible = (i: number) => {
    const biteStart = 1.0 + i * 0.5;
    return Math.max(0, Math.min(1, (t - biteStart) / 0.4));
  };

  // 6s+ ambient rock ±0.5°
  const ambientAngle = t > 5 ? Math.sin((t - 5) * 1.5) * 0.5 : 0;

  // bite 几何: 每道咬痕沿径向, 深度 = (10 - score) / 10 * COOKIE_RADIUS
  // (高分浅咬, 低分深咬到圆心). 8 道沿 8 sector 中线分布.
  // Cookie 默认略歪 ±15° (Calvin&Hobbes 简笔风)
  return (
    <svg
      viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
      className="h-auto w-full"
      role="img"
      aria-label="今日的饼干场景"
    >
      <g transform={`rotate(${craft.rotationJitter + ambientAngle})`}>
        {/* 饼干本体 — 圆形 + 烤色边. 用 path 加 jitter 让边缘略不规则 (kindergarten vibe) */}
        <CookieBody seed={visitSeed} radius={COOKIE_RADIUS} />
        {/* 8 道咬痕 — biteVisible 控渐次出现, 颤抖 jitter */}
        {scores.map((score, i) => {
          const visible = biteVisible(i);
          if (visible <= 0) return null;
          const biteDepth = ((10 - score) / 10) * COOKIE_RADIUS * 0.9;
          if (biteDepth <= 0) return null;
          const angle = -90 + i * 45 + 22.5; // sector 中线
          return (
            <BiteMark
              key={`bite-${i}`}
              angleDeg={angle}
              depth={biteDepth}
              cookieRadius={COOKIE_RADIUS}
              opacity={visible}
              seed={visitSeed + i * 17}
            />
          );
        })}
      </g>
      {/* 巨人手 — 从右侧伸入 (不在 cookie rotate 内, 独立 layer) */}
      <Giant x={handX} t={t} />
    </svg>
  );
}

function CookieBody({ seed, radius }: { seed: number; radius: number }) {
  const rng = mulberry32(seed);
  // 16 vertex 圆周, 每 vertex 略 jitter (kindergarten 不规则圆)
  const pts: string[] = [];
  const N = 24;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const r = radius + (rng() - 0.5) * 6;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  // 烤斑 — 8 个 small dots 散在 cookie 表面
  const dots: React.ReactElement[] = [];
  for (let i = 0; i < 8; i++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * radius * 0.7;
    dots.push(
      <circle
        key={`dot-${i}`}
        cx={Math.cos(a) * r}
        cy={Math.sin(a) * r}
        r={3 + rng() * 3}
        fill="#7c5a2e"
        opacity={0.5}
      />
    );
  }
  return (
    <g>
      <polygon
        points={pts.join(" ")}
        fill={COOKIE_COLOR}
        stroke={COOKIE_STROKE}
        strokeWidth={2.5}
        strokeLinejoin="round"
        style={{ mixBlendMode: "multiply" }}
      />
      {dots}
    </g>
  );
}

function BiteMark({
  angleDeg,
  depth,
  cookieRadius,
  opacity,
  seed,
}: {
  angleDeg: number;
  depth: number;
  cookieRadius: number;
  opacity: number;
  seed: number;
}) {
  // 咬痕 = 一个白色椭圆 mask, 从外缘往圆心方向凿入 depth.
  // 中心位置: 沿 angleDeg 方向 r = cookieRadius - depth/2 (椭圆中心在咬痕中段)
  const rng = mulberry32(seed);
  const a = (angleDeg * Math.PI) / 180;
  const cx = Math.cos(a) * (cookieRadius - depth / 2);
  const cy = Math.sin(a) * (cookieRadius - depth / 2);
  const rx = depth / 2 + 4;
  const ry = (depth / 2) * 0.9;
  // 颤抖 jitter — 咬痕略歪 ±8°
  const jitterDeg = (rng() - 0.5) * 16;
  return (
    <g
      transform={`translate(${cx} ${cy}) rotate(${angleDeg + jitterDeg})`}
      opacity={opacity}
    >
      {/* 白色椭圆 — 模拟"咬掉了" (露出背景白) */}
      <ellipse
        cx={0}
        cy={0}
        rx={rx}
        ry={ry}
        fill="#fafafa"
        stroke={COOKIE_STROKE}
        strokeWidth={1.5}
      />
      {/* 咬痕齿印 (sketchy zigzag) */}
      <path
        d={zigzagPath(rx, ry, seed)}
        fill="none"
        stroke={COOKIE_STROKE}
        strokeWidth={1}
        strokeLinejoin="round"
        opacity={0.7}
      />
    </g>
  );
}

function zigzagPath(rx: number, ry: number, seed: number): string {
  const rng = mulberry32(seed + 99);
  const N = 6;
  const segs: string[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = -Math.PI + t * Math.PI; // 半圆 (咬痕弧)
    const r = (i % 2 === 0 ? rx : rx * 0.7) + (rng() - 0.5) * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * ry;
    segs.push(i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `L ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return segs.join(" ");
}

function Giant({ x, t }: { x: number; t: number }) {
  // 简笔半身像 — 头 + 嘴 + 一只手. 从右侧 (x > 0) 伸进画面.
  // 头位置: 画面右上角
  // 手位置: 跟 cookie 中心交互
  // x = 200 时完全在画外, x = 0 时手伸到 cookie 上方
  const inFrame = x < 180;
  if (!inFrame) return null;
  // 颤抖: 在 1-5s "咬"过程中, 头 + 手都微微颤
  const shake =
    t > 1 && t < 5 ? Math.sin(t * 30) * 2 : 0;
  return (
    <g transform={`translate(${x + 160} ${-130})`} opacity={0.95}>
      {/* 头 (简笔圆) */}
      <g transform={`translate(${shake} 0)`}>
        <circle cx={0} cy={0} r={50} fill="#fed7aa" stroke="#52525b" strokeWidth={2.5} />
        {/* 眼 */}
        <circle cx={-15} cy={-5} r={3} fill="#27272a" />
        <circle cx={15} cy={-5} r={3} fill="#27272a" />
        {/* 嘴 — 张开咬状 */}
        <ellipse cx={0} cy={20} rx={18} ry={10} fill="#27272a" />
        {/* 牙齿 */}
        <rect x={-12} y={12} width={6} height={6} fill="#fafafa" />
        <rect x={-4} y={12} width={6} height={6} fill="#fafafa" />
        <rect x={4} y={12} width={6} height={6} fill="#fafafa" />
        {/* 头发 — 几根 */}
        <path
          d="M -30 -40 L -28 -55 M -10 -50 L -10 -65 M 10 -50 L 12 -65 M 28 -42 L 32 -55"
          stroke="#52525b"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </g>
      {/* 手 — 从头下方伸出去 cookie 方向 (left) */}
      <g transform={`translate(${-30 + shake} ${50})`}>
        <path
          d={`M 0 0 Q -80 30 -180 100`}
          fill="none"
          stroke="#fed7aa"
          strokeWidth={18}
          strokeLinecap="round"
        />
        <path
          d={`M 0 0 Q -80 30 -180 100`}
          fill="none"
          stroke="#52525b"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.6}
        />
        {/* 手指 (5 根简笔) at 终端 */}
        <g transform="translate(-180 100)">
          <circle cx={0} cy={0} r={16} fill="#fed7aa" stroke="#52525b" strokeWidth={2} />
        </g>
      </g>
    </g>
  );
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export const COOKIE_DURATION_MS = 6000;
