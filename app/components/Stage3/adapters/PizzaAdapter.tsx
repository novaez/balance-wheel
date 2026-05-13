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

export const PIZZA_DURATION_MS = 5500;

type Pose = "anticipate" | "catch" | "react";

// Pose 时间轴 (per v2 §四 12 principles 兑现):
// anticipate (期待眼神) 0-2s → catch (slice 落手 squash) 2-3.5s →
// react (笑 + 摇手 follow-through) 3.5-5.5s → onFinish.
const POSE_TIMELINE = {
  catchAt: 2000,
  reactAt: 3500,
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
// 显示尺寸 = animal.size * BASE_PX (px in viewBox unit). 大象 3.25 * 30 ≈ 98px,
// 小鸟 1.0 * 30 = 30px, 跨 lineup 3.25x size ratio 自然.
const BASE_SIZE_PX = 30;

function AnimalImage({
  animal,
  pose,
  x,
  y,
}: {
  animal: AnimalChar;
  pose: Pose;
  x: number;
  y: number;
}) {
  const displaySize = animal.size * BASE_SIZE_PX;
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
// PizzaAdapter — main entry. 8 animal lineup + pose timeline.
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
  //   wheel center (0, 0), MAX_RADIUS = 160 → wheel pizza body 区域 (后续实施)
  //   animal lineup baseline y ≈ 200 (wheel 下方), 8 等距 x [-180, 180]
  return (
    <g className="pizza-adapter" data-pose={pose}>
      {/* Phase 3b 后续: 8 slice 副本 overlay (起始 sector position → bezier arc
          飞到对应 animal 手中). 当前 framework verify 阶段不实施. */}
      <g className="pizza-slice-copies" />

      {/* 8 animal 排排坐 (dim 顺序左到右, color rainbow 暖冷律动) */}
      <g className="animal-lineup">
        {ANIMALS_BY_DIM.map((animal, dimIdx) => {
          const x = -180 + (dimIdx / 7) * 360;
          const y = 220; // lineup 脚底锚定 y, image 向上展开
          return (
            <AnimalImage
              key={animal.id}
              animal={animal}
              pose={pose}
              x={x}
              y={y}
            />
          );
        })}
      </g>

      {/* Phase 3b 后续: motion line dashed trail (slice 飞 trajectory 旁) */}
      <g className="motion-lines" />

      {/* DEBUG (development only): scores + pose state */}
      {process.env.NODE_ENV === "development" && (
        <text
          x="0"
          y="-160"
          textAnchor="middle"
          fontSize="8"
          fill="#999"
        >
          pose: {pose} · scores: [{scores.join(",")}]
        </text>
      )}
    </g>
  );
}
