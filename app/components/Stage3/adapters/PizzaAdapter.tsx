// PizzaAdapter — Phase 3 v2 §四 reframe (liushu specific).
// 2026-05-13 path 转向: SVG hand-code → PNG <image> 接入. 跟智引 reference
// 3D 渲染萌型 register 对位.
//
// Essence (v2 §四):
//   - wheel 几何 = pizza 8 块 (后续 Phase 3b craft 实施 wheel-as-pizza,
//     当前 framework verify 阶段仅显示 animal lineup)
//   - 8 动物排排坐 (wheel 下方 lineup, dim 顺序左到右, animal natural
//     color = dim color)
//   - 撕飞 slice 副本飞分给 (Phase 3b 后续, 当前不实施)
//   - 3 pose 时序 (anticipate 0-2s → catch 2-3.5s → react 3.5-5.5s)
//
// PNG 素材命名: `pizza-<animal>-<pose>.png` 放 `public/assets/pizza/`.
// 已 saved (2026-05-13 first batch): elephant / hippo / rabbit / cat 全 3 pose.
// 还差 (待 liushu generation): mouse / giraffe / bird / tiger 各 3 pose.
//
// design ref: vault Phase 3 design.md §v2.四 + Phase 3b PNG 素材 prompt.md

"use client";

import { useEffect, useState } from "react";
import type { AdapterProps } from "../types";
import { useAnimation } from "../useAnimation";
import { HatchFill } from "../primitives/HatchFill";
import { mulberry32 } from "../random";

export const PIZZA_DURATION_MS = 8000;

type Pose = "anticipate" | "catch" | "react";

// Pose 时间轴 (per v2 §四 12 principles 兑现):
// anticipate (期待眼神 + PNG load buffer) 0-3s → catch (split view + pizza
// reveal) 3-5.5s → react (笑 + 摇手 + pizza fade) 5.5-8s → onFinish.
// 拉长 from 5.5s → 8s: PNG 首次加载缓冲 + split view transition 时间.
const POSE_TIMELINE = {
  catchAt: 3000,
  reactAt: 5500,
};

// ─────────────────────────────────────────────────────────────────────────────
// Animal character mapping — fixed by-dim (liushu 拍板 2026-05-12).
// ─────────────────────────────────────────────────────────────────────────────
// dim 顺序 (page.tsx DIMENSIONS):
//   0: 家庭/朋友  1: 另一半/爱情  2: 娱乐与休闲  3: 健康
//   4: 财富       5: 个人成长     6: 环境         7: 职业
//
// animal natural color = dim color (Phase 1.5j palette warm/cool 交替), 视觉
// anchor "animal ↔ sector ↔ dim" 三层对接. 萌型不写实接受蓝象/紫虎/绿长颈
// 鹿/红河马 等非自然色.
//
// size ratio 3.25x: 大象 3.25 / 小鸟 1.0, 中间按 log-scale 渐变.
//
// hasPng: PNG 素材是否已 saved 到 public/assets/pizza/. false 时 placeholder
// 占位 (colored circle + 中文名 label). 后续 4 animal PNG 到位 flip true.
interface AnimalChar {
  id: string;
  zh: string;
  size: number;
  color: string;
  hasPng: boolean;
}

export const ANIMALS_BY_DIM: AnimalChar[] = [
  { id: "hippo",    zh: "河马",   size: 2.55, color: "#ef4444", hasPng: true  }, // 家庭/朋友 — 群居慢悠悠
  { id: "rabbit",   zh: "兔子",   size: 1.45, color: "#06b6d4", hasPng: true  }, // 另一半/爱情 — 心跳/温柔
  { id: "cat",      zh: "猫",     size: 1.20, color: "#f59e0b", hasPng: true  }, // 娱乐与休闲 — 自在放松
  { id: "elephant", zh: "大象",   size: 3.25, color: "#3b82f6", hasPng: true  }, // 健康 — 身体是基石
  { id: "mouse",    zh: "老鼠",   size: 1.00, color: "#ec4899", hasPng: false }, // 财富 — 储粮敏感
  { id: "giraffe",  zh: "长颈鹿", size: 1.85, color: "#10b981", hasPng: false }, // 个人成长 — 高视野
  { id: "bird",     zh: "小鸟",   size: 1.00, color: "#f97316", hasPng: false }, // 环境 — 轻盈飞行
  { id: "tiger",    zh: "老虎",   size: 2.10, color: "#a855f7", hasPng: false }, // 职业 — 进取强势
];

// ─────────────────────────────────────────────────────────────────────────────
// AnimalImage — PNG <image> render, fallback placeholder 占位.
// ─────────────────────────────────────────────────────────────────────────────
// 显示尺寸 = animal.size × BASE × scoreFactor × perspectiveScale:
//   - animal.size: character identity 3.25x ratio (大象 3.25 / 小鸟 1.0)
//   - scoreFactor: 0.5 (score 0) → 1.2 (score 10) — 反思 hook "大象本大但
//     分数低就变小, 视觉反差读 '健康分低'". 双维度 score → animal size
//     mapping 增强 reflective tension.
//   - perspectiveScale: 后排 0.85x foreshortening (远小近大透视)
//   - BASE 40 (从 30) — 整体动物 1.33x larger, lineup 视觉 punch 起来
const BASE_SIZE_PX = 40;

function AnimalImage({
  animal,
  pose,
  x,
  y,
  score,
  perspectiveScale = 1.0,
}: {
  animal: AnimalChar;
  pose: Pose;
  x: number;
  y: number;
  score: number;
  perspectiveScale?: number;
}) {
  const scoreFactor = 0.5 + (score / 10) * 0.7; // 0.5 - 1.2
  const displaySize = animal.size * BASE_SIZE_PX * scoreFactor * perspectiveScale;
  const half = displaySize / 2;

  if (animal.hasPng) {
    // 3-layer overlay: 3 pose PNG 各自 opacity, 切换时 fade transition.
    // Browser 第一次 load 后 cached, 后续 opacity toggle 不重新 fetch.
    return (
      <g className={`animal-${animal.id}`}>
        {(["anticipate", "catch", "react"] as Pose[]).map((p) => (
          <image
            key={p}
            href={`/assets/pizza/pizza-${animal.id}-${p}.png`}
            x={x - half}
            y={y - displaySize + 8} // 脚底锚定 y, image 向上展开
            width={displaySize}
            height={displaySize}
            preserveAspectRatio="xMidYMid meet"
            opacity={pose === p ? 1 : 0}
            style={{ transition: "opacity 0.3s ease-out" }}
          />
        ))}
      </g>
    );
  }

  // Placeholder: colored circle + 中文名 label. 待 PNG 到位 flip hasPng.
  const r = displaySize / 2.5;
  return (
    <g className={`animal-${animal.id} placeholder`}>
      <circle
        cx={x}
        cy={y - r}
        r={r}
        fill={animal.color}
        stroke={darken(animal.color, 0.55)}
        strokeWidth={1.2}
        opacity={0.85}
      />
      <text
        x={x}
        y={y - r + 3}
        textAnchor="middle"
        fontSize={r * 0.4}
        fill="white"
        fontWeight={600}
      >
        {animal.zh}
      </text>
    </g>
  );
}

// darken hex by factor (placeholder stroke). PNG path 不用.
function darken(hex: string, factor: number): string {
  const h = hex.replace("#", "");
  const r = Math.floor(parseInt(h.slice(0, 2), 16) * factor);
  const g = Math.floor(parseInt(h.slice(2, 4), 16) * factor);
  const b = Math.floor(parseInt(h.slice(4, 6), 16) * factor);
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// WheelPizzaBody — v2 §五 wheel persistent. 8 sector 几何 + 颜色 persist
// (跟 page.tsx Stage 1-2 主 wheel 一致 dim color), 透视压扁 + 上移作"pizza
// 桌上"远景. 后续 polish 加 pepperoni / cheese 黄边 topping overlay.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RADIUS = 160; // 跟 page.tsx 主 wheel 同 max radius

function WheelPizzaBody({ scores }: { scores: number[] }) {
  // 每 sector 算 path + clip — 跟 page.tsx Stage 1-2 主 wheel 同算法
  // (ScribbleHatchingFill 蜡笔 multiply hatching + outline). 视觉 register
  // 跟 Stage 2 wheel 连续, "this is the wheel I just painted".
  //
  // 无 internal transform — caller wrap 应用 transform 决定 wheel 位置/缩放.
  // (split view 时 right square wrap with own scale; anticipate 不用 wheel)
  const sectors = ANIMALS_BY_DIM.map((animal, dimIdx) => {
    const startDeg = (dimIdx / 8) * 360 - 90;
    const endDeg = ((dimIdx + 1) / 8) * 360 - 90;
    const score = Math.max(0, Math.min(10, scores[dimIdx] ?? 0));
    const radius = (score / 10) * MAX_RADIUS;
    if (radius <= 0) return null;
    const startAngle = (startDeg * Math.PI) / 180;
    const endAngle = (endDeg * Math.PI) / 180;
    const x0 = Math.cos(startAngle) * radius;
    const y0 = Math.sin(startAngle) * radius;
    const x1 = Math.cos(endAngle) * radius;
    const y1 = Math.sin(endAngle) * radius;
    const d = `M0,0 L${x0.toFixed(2)},${y0.toFixed(2)} A${radius},${radius} 0 0,1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
    // pressureScale: 跟 page.tsx 一致 0.55 (低分细笔) → 1.55 (满分粗笔)
    const pressureScale = 0.55 + (score / 10) * 1.0;
    return { animal, dimIdx, startDeg, endDeg, radius, d, pressureScale };
  }).filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <g
      className="wheel-pizza-body"
      // v2 §二 transition 透视 hint: 横向 70% 缩 (留 lineup 空间), 纵向 55%
      // 压扁 (透视感 wheel "远处地面 pizza"). 上移 -60 让 lineup 下方有空间.
      transform="translate(0 -60) scale(0.7 0.55)"
    >
      <defs>
        {sectors.map((s) => (
          <clipPath key={`pizza-clip-${s.dimIdx}`} id={`pizza-clip-${s.dimIdx}`}>
            <path d={s.d} />
          </clipPath>
        ))}
      </defs>

      {/* 蜡笔 hatching multiply + outline (跟 Stage 1-2 主 wheel 同视觉) */}
      {sectors.map((s) => (
        <g key={s.animal.id}>
          <g clipPath={`url(#pizza-clip-${s.dimIdx})`}>
            <HatchFill
              startDeg={s.startDeg}
              endDeg={s.endDeg}
              radius={s.radius}
              color={s.animal.color}
              seed={s.dimIdx + 1}
              pressureScale={s.pressureScale}
            />
          </g>
          <path
            d={s.d}
            fill="none"
            stroke={s.animal.color}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        </g>
      ))}

      {/* Pepperoni 圆点 topping — pizza identity anchor. 数量 score-driven
          (高 score → 多 pepperoni, 自然 "丰盛 dim 派 pepperoni 满"). */}
      {sectors.map((s) => {
        const score = Math.max(0, Math.min(10, scores[s.dimIdx] ?? 0));
        const count = Math.round((score / 10) * 3); // 0-3 per sector
        if (count === 0) return null;
        const rng = mulberry32(s.dimIdx * 31 + 17);
        const toRad = (d: number) => (d * Math.PI) / 180;
        const dots: React.ReactElement[] = [];
        for (let i = 0; i < count; i++) {
          // 极坐标 sample (sqrt 均匀分布), 排除最外缘和最中心避免压沿
          const tR = 0.35 + Math.sqrt(rng()) * 0.55; // 0.35-0.9 of radius
          const r = tR * s.radius;
          const theta = toRad(s.startDeg + (0.15 + rng() * 0.7) * (s.endDeg - s.startDeg));
          const x = Math.cos(theta) * r;
          const y = Math.sin(theta) * r;
          const dotRadius = 5 + rng() * 3.5; // 5-8.5
          dots.push(
            <circle
              key={`pep-${s.dimIdx}-${i}`}
              cx={x.toFixed(2)}
              cy={y.toFixed(2)}
              r={dotRadius.toFixed(1)}
              fill="#b91c1c"
              stroke="#7a1010"
              strokeWidth={0.6}
              opacity={0.95}
            />
          );
        }
        return <g key={`pep-group-${s.dimIdx}`}>{dots}</g>;
      })}

      {/* Crust 黄边 outer ring (cream/golden, pizza 边缘 identity) */}
      <circle
        cx={0}
        cy={0}
        r={MAX_RADIUS + 4}
        fill="none"
        stroke="#e6c376"
        strokeWidth={5}
        opacity={0.85}
      />
      {/* Inner outline (sector boundary marker, Stage 1-2 carry) */}
      <circle
        cx={0}
        cy={0}
        r={MAX_RADIUS}
        fill="none"
        stroke="#3a2c20"
        strokeWidth={1.5}
        opacity={0.35}
      />
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PizzaAdapter — main entry. wheel pizza body + 8 animal lineup + pose timeline.
// ─────────────────────────────────────────────────────────────────────────────

export function PizzaAdapter(
  props: Extract<AdapterProps, { metaphor: "pizza" }>,
) {
  const { scores, onFinish } = props;
  const tl = useAnimation();
  const [pose, setPose] = useState<Pose>("anticipate");

  useEffect(() => {
    // Pose timeline cascade (anticipate → catch → react → onFinish).
    const t1 = window.setTimeout(() => setPose("catch"), POSE_TIMELINE.catchAt);
    const t2 = window.setTimeout(() => setPose("react"), POSE_TIMELINE.reactAt);
    const t3 = window.setTimeout(() => onFinish?.(), PIZZA_DURATION_MS);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      tl.kill();
    };
  }, [tl, onFinish]);

  // Layout (viewBox VBOX_RUN ≈ x[-216,216] y[-180,240]):
  //   Pizza stage (box body + wheel + lid 共享 transform 透视压扁):
  //     - Box body 一直 visible
  //     - Pizza lid (cover top + "PIZZA" label) visible 在 anticipate phase
  //     - Wheel pizza body (sectors+pepperoni+crust) visible 在 catch phase
  //     - React phase wheel fade out (slice 已分给动物)
  //   Lineup 3-2-3:
  //     - Top (dim 0,1,2): y=85, perspective 0.8x (后方远)
  //     - Middle (dim 3,4): y=155, x=±180 (pizza box 两侧)
  //     - Bottom (dim 5,6,7): y=240, perspective 1.0x (前方近)
  //   Paint order (z 后到前): pizza stage → top → middle → bottom
  return (
    <g className="pizza-adapter" data-pose={pose}>
      {/* Anticipate phase: single closed pizza box w/ "PIZZA" label.
          (liushu confirmed "挺好" 不动 visual) */}
      <g
        className="closed-box"
        style={{
          opacity: pose === "anticipate" ? 1 : 0,
          transition: "opacity 0.6s ease-out",
        }}
        transform="translate(0 -60) scale(0.7 0.55)"
      >
        <rect
          x={-200}
          y={-200}
          width={400}
          height={400}
          rx={28}
          ry={28}
          fill="#c89968"
          stroke="#7a5a30"
          strokeWidth={2.5}
        />
        <rect
          x={-188}
          y={-188}
          width={376}
          height={376}
          rx={20}
          ry={20}
          fill="none"
          stroke="#9a6f3e"
          strokeWidth={1.5}
          opacity={0.6}
        />
        <text
          x={0}
          y={28}
          textAnchor="middle"
          fontSize={110}
          fontWeight={900}
          fill="#7a5a30"
          opacity={0.7}
          fontFamily="ui-serif, Georgia, serif"
          letterSpacing={4}
        >
          PIZZA
        </text>
      </g>

      {/* Catch + React phase: split view — 2 squares side-by-side. Left = lid
          (PIZZA label), Right = open box w/ pizza wheel (catch only, react
          hides wheel). 整体缩小 fit 2 squares horizontally. */}
      <g
        className="split-view"
        style={{
          opacity: pose !== "anticipate" ? 1 : 0,
          transition: "opacity 0.6s ease-out",
        }}
      >
        {/* Left square: lid representation w/ PIZZA label */}
        <g transform="translate(-115 -60) scale(0.5 0.55)">
          <rect
            x={-200}
            y={-200}
            width={400}
            height={400}
            rx={28}
            ry={28}
            fill="#c89968"
            stroke="#7a5a30"
            strokeWidth={2.5}
          />
          <rect
            x={-188}
            y={-188}
            width={376}
            height={376}
            rx={20}
            ry={20}
            fill="none"
            stroke="#9a6f3e"
            strokeWidth={1.5}
            opacity={0.6}
          />
          <text
            x={0}
            y={28}
            textAnchor="middle"
            fontSize={130}
            fontWeight={900}
            fill="#7a5a30"
            opacity={0.7}
            fontFamily="ui-serif, Georgia, serif"
            letterSpacing={6}
          >
            PIZZA
          </text>
        </g>

        {/* Right square: open box w/ pizza wheel (catch shows wheel, react
            hides wheel for "pizza eaten" effect) */}
        <g transform="translate(115 -60) scale(0.5 0.55)">
          <rect
            x={-200}
            y={-200}
            width={400}
            height={400}
            rx={28}
            ry={28}
            fill="#c89968"
            stroke="#7a5a30"
            strokeWidth={2.5}
          />
          <rect
            x={-188}
            y={-188}
            width={376}
            height={376}
            rx={20}
            ry={20}
            fill="none"
            stroke="#9a6f3e"
            strokeWidth={1.5}
            opacity={0.6}
          />
          {/* Wheel pizza body inside right box — catch visible, react fade out */}
          <g
            style={{
              opacity: pose === "catch" ? 1 : 0,
              transition: "opacity 0.6s ease-out",
            }}
          >
            <WheelPizzaBody scores={scores} />
          </g>
        </g>
      </g>

      {/* Phase 3b 后续: 8 slice 副本 overlay (起始 sector position → bezier arc
          飞到对应 animal 手中). 当前 framework verify 阶段不实施. */}
      <g className="pizza-slice-copies" />

      {/* Lineup 3-2-3 — in-line lineup. viewBox h=750 紧凑 container, lineup
          vertical span 360 单位 (y=200 to 560), 行间距均匀 180. Horizontal
          ±140 收紧 (从 ±180), 中排 ±70 错位 in between -140/0/140. */}
      {/* 上排 3 (dim 0,1,2 = 河马/兔子/猫): 后方, perspective 0.85x */}
      <g className="animal-lineup-top">
        {[0, 1, 2].map((dimIdx, colIdx) => (
          <AnimalImage
            key={ANIMALS_BY_DIM[dimIdx].id}
            animal={ANIMALS_BY_DIM[dimIdx]}
            pose={pose}
            x={-140 + colIdx * 140}
            y={200}
            score={scores[dimIdx] ?? 0}
            perspectiveScale={0.85}
          />
        ))}
      </g>
      {/* 中排 2 (dim 3,4 = 大象/老鼠): in-line center, x=±70 错位 in between
          上下 columns (-140/0/140). */}
      <g className="animal-lineup-middle">
        {[3, 4].map((dimIdx, idx) => (
          <AnimalImage
            key={ANIMALS_BY_DIM[dimIdx].id}
            animal={ANIMALS_BY_DIM[dimIdx]}
            pose={pose}
            x={idx === 0 ? -70 : 70}
            y={380}
            score={scores[dimIdx] ?? 0}
            perspectiveScale={0.95}
          />
        ))}
      </g>
      {/* 下排 3 (dim 5,6,7 = 长颈鹿/小鸟/老虎): 前方, perspective 1.0x */}
      <g className="animal-lineup-bottom">
        {[5, 6, 7].map((dimIdx, colIdx) => (
          <AnimalImage
            key={ANIMALS_BY_DIM[dimIdx].id}
            animal={ANIMALS_BY_DIM[dimIdx]}
            pose={pose}
            x={-140 + colIdx * 140}
            y={560}
            score={scores[dimIdx] ?? 0}
            perspectiveScale={1.0}
          />
        ))}
      </g>

      {/* Phase 3b 后续: motion line dashed trail (slice 飞 trajectory 旁) */}
      <g className="motion-lines" />
    </g>
  );
}
