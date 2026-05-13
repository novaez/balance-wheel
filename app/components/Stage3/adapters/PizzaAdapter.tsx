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

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import type { AdapterProps } from "../types";
import { useAnimation } from "../useAnimation";
import { HatchFill } from "../primitives/HatchFill";
import { mulberry32 } from "../random";

// Register MotionPathPlugin once (bezier arc trajectory for slice 撕飞).
if (typeof window !== "undefined") {
  gsap.registerPlugin(MotionPathPlugin);
}

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
// 显示尺寸 = BASE × scoreFactor × perspectiveScale:
//   - scoreFactor: 0.5 (score 0) → 1.2 (score 10) — animal size 完全 score-
//     driven, 不跟 character identity size 走 (liushu 拍板 2026-05-13).
//     反思 hook 直观: 评分 = pizza 分得多少 = animal 显多大.
//   - perspectiveScale: 后排 0.85x foreshortening (远小近大透视, 微差不破坏
//     score → size mapping).
//   - BASE 140 — score 10 animal ~168 px (bottom row), col spacing 160, slight
//     overlap (4 px each side) at score 10. Typical scores 5-8 healthy gap.
//   - 删除 animal.size character identity size — character 通过 PNG visual +
//     color 区分, 不通过 size 区分.
const BASE_SIZE_PX = 140;

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
  // animal size = score-driven only (不跟 character.size 走). liushu 拍板:
  // 同 score → 同 size, 反思 hook 直接对应 pizza 分得多少.
  const displaySize = BASE_SIZE_PX * scoreFactor * perspectiveScale;
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

function WheelPizzaBody({
  scores,
  sectorOut,
}: {
  scores: number[];
  sectorOut?: boolean[];
}) {
  // 每 sector 算 path + clip — 跟 page.tsx Stage 1-2 主 wheel 同算法
  // (ScribbleHatchingFill 蜡笔 multiply hatching + outline). 视觉 register
  // 跟 Stage 2 wheel 连续, "this is the wheel I just painted".
  //
  // 无 internal transform — caller wrap 应用 transform 决定 wheel 位置/缩放.
  // (split view 时 right square wrap with own scale; anticipate 不用 wheel)
  //
  // sectorOut?: boolean[8] — per-sector fade out 跟 slice 撕飞 同步 (slice
  // arrival 时 sector 同步 fade out, "撕走"视觉准确).
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
    <g className="wheel-pizza-body">
      <defs>
        {sectors.map((s) => (
          <clipPath key={`pizza-clip-${s.dimIdx}`} id={`pizza-clip-${s.dimIdx}`}>
            <path d={s.d} />
          </clipPath>
        ))}
      </defs>

      {/* 蜡笔 hatching multiply + outline (跟 Stage 1-2 主 wheel 同视觉).
          Per-sector opacity 跟 sectorOut[dimIdx] 走, slice 撕飞 arrival 时
          sector fade out ("撕走"视觉准确, sector 不再 visible 在 wheel). */}
      {sectors.map((s) => (
        <g
          key={s.animal.id}
          style={{
            opacity: sectorOut?.[s.dimIdx] ? 0 : 1,
            transition: "opacity 0.35s ease-out",
          }}
        >
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

      {/* Crust 黄边 outer ring (darker golden brown for clear contrast against
          cardboard background, pizza 边缘 identity 清晰 visible). */}
      <circle
        cx={0}
        cy={0}
        r={MAX_RADIUS + 4}
        fill="none"
        stroke="#b8843e"
        strokeWidth={7}
        opacity={0.9}
      />
      {/* Inner sector outline marker (subtle dark brown) */}
      <circle
        cx={0}
        cy={0}
        r={MAX_RADIUS}
        fill="none"
        stroke="#5a3a20"
        strokeWidth={1.5}
        opacity={0.45}
      />
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PizzaAdapter — main entry. wheel pizza body + 8 animal lineup + pose timeline.
// ─────────────────────────────────────────────────────────────────────────────

// Slice 撕飞 终点 (in split-view local coord, after split-view translate(0,-50)
// to PizzaAdapter coord: split-view local + (0,-50)). 8 animal lineup positions.
//   Animal lineup in PizzaAdapter coord:
//     上排 y=200, x=[-140, 0, 140] (dim 0, 1, 2)
//     中排 y=380, x=[-70, 70] (dim 3, 4)
//     下排 y=560, x=[-140, 0, 140] (dim 5, 6, 7)
//   Split-view local = PizzaAdapter coord - (0, -50) = animal y + 50.
const SLICE_TARGETS_LOCAL: Array<{ x: number; y: number }> = [
  { x: -160, y: 290 }, // dim 0 河马 top (PizzaAdapter y=240)
  { x: 0, y: 290 }, // dim 1 兔子
  { x: 160, y: 290 }, // dim 2 猫
  { x: -80, y: 490 }, // dim 3 大象 middle (y=440)
  { x: 80, y: 490 }, // dim 4 老鼠
  { x: -160, y: 690 }, // dim 5 长颈鹿 bottom (y=640)
  { x: 0, y: 690 }, // dim 6 小鸟
  { x: 160, y: 690 }, // dim 7 老虎
];
const SLICE_START_LOCAL = { x: 110, y: 0 }; // wheel center (right square center)

export function PizzaAdapter(
  props: Extract<AdapterProps, { metaphor: "pizza" }>,
) {
  const { scores, onFinish } = props;
  const tl = useAnimation();
  const [pose, setPose] = useState<Pose>("anticipate");
  const [wheelOut, setWheelOut] = useState(false);
  const [sectorOut, setSectorOut] = useState<boolean[]>(
    () => new Array(8).fill(false),
  );
  // Per-animal pose state — animal 切 catch 在 slice arrival 时 (per dim),
  // 不是 global pose state. animation feel "slice 落手 animal 才接到".
  const [animalPoses, setAnimalPoses] = useState<Pose[]>(
    () => new Array(8).fill("anticipate"),
  );
  const sliceRefs = useRef<(SVGGElement | null)[]>([]);
  const motionLineRefs = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    // Pose timeline cascade (anticipate → catch → react → onFinish).
    // Wheel crust/outline fade out at catch+1.5s (整体 fallback).
    const t1 = window.setTimeout(() => setPose("catch"), POSE_TIMELINE.catchAt);
    const t2 = window.setTimeout(() => setPose("react"), POSE_TIMELINE.reactAt);
    const t3 = window.setTimeout(() => onFinish?.(), PIZZA_DURATION_MS);
    const t4 = window.setTimeout(
      () => setWheelOut(true),
      POSE_TIMELINE.catchAt + 1500,
    );

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
      tl.kill();
    };
  }, [tl, onFinish]);

  // Pose phase sync: catch start → all animals stay anticipate (slice flying),
  // react phase → all animals → react.
  useEffect(() => {
    if (pose === "anticipate") {
      setAnimalPoses(new Array(8).fill("anticipate"));
    } else if (pose === "react") {
      setAnimalPoses(new Array(8).fill("react"));
    }
    // catch phase per-animal pose handled in slice 撕飞 useEffect.
  }, [pose]);

  // Slice 撕飞 animation: catch phase 起始时, 8 slice 副本 from wheel center
  // fly bezier arc 到 animal positions. Per-sector wheel fade out + per-animal
  // pose 切 catch 都 sync slice arrival.
  useEffect(() => {
    if (pose !== "catch") return;
    const timelines: gsap.core.Timeline[] = [];
    const timers: number[] = [];
    sliceRefs.current.forEach((elem, dimIdx) => {
      if (!elem) return;
      const target = SLICE_TARGETS_LOCAL[dimIdx];
      const score = Math.max(0, Math.min(10, scores[dimIdx] ?? 0));
      // Slice size 跟 score 走: 0.4 (低分小) → 1.0 (满分大). 反思 hook.
      const scaleFactor = 0.4 + (score / 10) * 0.6;
      gsap.set(elem, {
        x: SLICE_START_LOCAL.x,
        y: SLICE_START_LOCAL.y,
        scale: scaleFactor,
        opacity: 0,
      });
      // Bezier arc trajectory: 起点 wheel center → 弧顶 (mid 偏上 60 单位) →
      // 终点 animal position. "扔" 视觉感, 跟 12 principles "arc" anchor align.
      const peakX = (SLICE_START_LOCAL.x + target.x) / 2;
      const peakY = (SLICE_START_LOCAL.y + target.y) / 2 - 60;
      const sliceDelay = dimIdx * 0.08;
      const stl = gsap.timeline({ delay: sliceDelay });
      stl.to(elem, { opacity: 1, duration: 0.1 });
      stl.to(
        elem,
        {
          motionPath: {
            path: [
              { x: SLICE_START_LOCAL.x, y: SLICE_START_LOCAL.y },
              { x: peakX, y: peakY },
              { x: target.x, y: target.y },
            ],
            curviness: 1.3,
          },
          duration: 0.7,
          ease: "power2.in",
        },
        0,
      );
      stl.to(elem, { opacity: 0, duration: 0.2 });
      timelines.push(stl);

      // Motion line trail (dashed bezier path along slice trajectory).
      // Fade in catch start, fade out as slice arrives.
      const lineElem = motionLineRefs.current[dimIdx];
      if (lineElem) {
        gsap.set(lineElem, { opacity: 0 });
        const lineTl = gsap.timeline({ delay: sliceDelay });
        lineTl.to(lineElem, { opacity: 0.45, duration: 0.15 });
        lineTl.to(lineElem, { opacity: 0, duration: 0.35, delay: 0.4 });
        timelines.push(lineTl);
      }

      // Per-sector wheel fade out + per-animal pose 切 catch 都同步 slice
      // arrival (sliceDelay + 0.65s slice mid-flight).
      const arrivalMs = sliceDelay * 1000 + 650;
      const sectorOutTimer = window.setTimeout(() => {
        setSectorOut((prev) => {
          const next = [...prev];
          next[dimIdx] = true;
          return next;
        });
      }, arrivalMs);
      const animalPoseTimer = window.setTimeout(() => {
        setAnimalPoses((prev) => {
          const next = [...prev];
          next[dimIdx] = "catch";
          return next;
        });
      }, arrivalMs);
      timers.push(sectorOutTimer);
      timers.push(animalPoseTimer);
    });
    return () => {
      timelines.forEach((t) => t.kill());
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [pose, scores]);

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
      {/* Anticipate phase: single square pizza box w/ "PIZZA" label.
          Cardboard texture pattern + corner accents + PIZZA logo enhancement. */}
      <defs>
        {/* Cardboard texture — diagonal hatch lines */}
        <pattern
          id="cardboard-texture"
          patternUnits="userSpaceOnUse"
          width={8}
          height={8}
        >
          <path
            d="M0,8 L8,0"
            stroke="#a67d4d"
            strokeWidth={0.4}
            opacity={0.35}
          />
        </pattern>
      </defs>
      <g
        className="closed-box"
        style={{
          opacity: pose === "anticipate" ? 1 : 0,
          transition: "opacity 0.6s ease-out",
        }}
        transform="translate(0 -50) scale(0.65 0.65)"
      >
        {/* Box cardboard fill */}
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
        {/* Cardboard texture overlay (diagonal hatching) */}
        <rect
          x={-200}
          y={-200}
          width={400}
          height={400}
          rx={28}
          ry={28}
          fill="url(#cardboard-texture)"
        />
        {/* Inner outline 壁厚 */}
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
        {/* Corner accent dots (像 box flap reinforcement) */}
        {[
          { x: -170, y: -170 },
          { x: 170, y: -170 },
          { x: -170, y: 170 },
          { x: 170, y: 170 },
        ].map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={5}
            fill="#7a5a30"
            opacity={0.5}
          />
        ))}
        {/* PIZZA logo — shadow + main text (subtle depth) */}
        <text
          x={3}
          y={31}
          textAnchor="middle"
          fontSize={110}
          fontWeight={900}
          fill="#5d3d1a"
          opacity={0.35}
          fontFamily="ui-serif, Georgia, serif"
          letterSpacing={4}
        >
          PIZZA
        </text>
        <text
          x={0}
          y={28}
          textAnchor="middle"
          fontSize={110}
          fontWeight={900}
          fill="#7a5a30"
          opacity={0.75}
          fontFamily="ui-serif, Georgia, serif"
          letterSpacing={4}
        >
          PIZZA
        </text>
        {/* Small decorative stars under PIZZA logo */}
        <text
          x={0}
          y={70}
          textAnchor="middle"
          fontSize={28}
          fill="#7a5a30"
          opacity={0.4}
          letterSpacing={6}
        >
          ★ ★ ★
        </text>
      </g>

      {/* Catch + React phase: 2 squares 连一起 with 中间窄 hinge.
          每个 half 是 180×180 正方形 (1:1 aspect). Combined: x [-200, 200]
          y [-90, 90]. Hinge 20×140 (缺口 20 上下). 披萨真居中 right square. */}
      <g
        className="split-view"
        style={{
          opacity: pose !== "anticipate" ? 1 : 0,
          transition: "opacity 0.6s ease-out",
        }}
        transform="translate(0 -50)"
      >
        {/* Combined outline path: 2 squares 180×180 + 中间 hinge 20×140.
            clockwise from top-left. */}
        <path
          d="M-200,-72 a18,18 0 0 1 18,-18 H-10 V-70 H10 V-90 H182 a18,18 0 0 1 18,18 V72 a18,18 0 0 1 -18,18 H10 V70 H-10 V90 H-182 a18,18 0 0 1 -18,-18 Z"
          fill="#c89968"
          stroke="#7a5a30"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {/* Inner outline 壁厚 — 2 separate rounded squares 160×160 (inset 10) */}
        <rect
          x={-190}
          y={-80}
          width={160}
          height={160}
          rx={10}
          ry={10}
          fill="none"
          stroke="#9a6f3e"
          strokeWidth={1.5}
          opacity={0.5}
        />
        <rect
          x={30}
          y={-80}
          width={160}
          height={160}
          rx={10}
          ry={10}
          fill="none"
          stroke="#9a6f3e"
          strokeWidth={1.5}
          opacity={0.5}
        />

        {/* Left square interior: 空 cardboard (lid inner side). PIZZA label 删除. */}

        {/* Right square interior: wheel pizza body centered at x=110 (right
            square center), scale 0.5 uniform (no deformation, 正上方视角).
            Wheel container 整体在 catch phase visible (wheelOut fallback at
            catch+1.5s), per-sector fade out 跟 slice 撕飞 同步 (sectorOut). */}
        <g
          transform="translate(110 0) scale(0.5 0.5)"
          style={{
            opacity: pose === "catch" && !wheelOut ? 1 : 0,
            transition: "opacity 0.4s ease-out",
          }}
        >
          <WheelPizzaBody scores={scores} sectorOut={sectorOut} />
        </g>

        {/* Motion line trail — dashed bezier path along slice trajectory.
            Calvin & Hobbes 经典手法, fade in catch start, fade out as slice
            arrives. Each line follows same bezier path as slice. */}
        <g className="motion-lines">
          {ANIMALS_BY_DIM.map((animal, dimIdx) => {
            const target = SLICE_TARGETS_LOCAL[dimIdx];
            const peakX = (SLICE_START_LOCAL.x + target.x) / 2;
            const peakY = (SLICE_START_LOCAL.y + target.y) / 2 - 60;
            return (
              <path
                key={`motion-${animal.id}`}
                ref={(el) => {
                  motionLineRefs.current[dimIdx] = el;
                }}
                d={`M${SLICE_START_LOCAL.x},${SLICE_START_LOCAL.y} Q${peakX},${peakY} ${target.x},${target.y}`}
                fill="none"
                stroke={animal.color}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                strokeLinecap="round"
                style={{ opacity: 0 }}
              />
            );
          })}
        </g>

        {/* Slice 副本 撕飞 — catch phase 时 8 slices fly from wheel center to
            animal positions via bezier arc (staggered start). */}
        <g className="slice-pieces">
          {ANIMALS_BY_DIM.map((animal, dimIdx) => (
            <g
              key={`slice-${animal.id}`}
              ref={(el) => {
                sliceRefs.current[dimIdx] = el;
              }}
              style={{ opacity: 0 }}
            >
              <path
                d="M0,-14 L-11,9 L11,9 Z"
                fill={animal.color}
                stroke={darken(animal.color, 0.55)}
                strokeWidth={1.4}
                strokeLinejoin="round"
              />
              <path
                d="M0,-9 L-7,6 L7,6 Z"
                fill="#f5d061"
                opacity={0.6}
              />
            </g>
          ))}
        </g>
      </g>

      {/* Lineup 3-2-3 — viewBox 500×850, 行距 200 单位 (拉大 from 180), col
          spacing ±160 (从 ±140), y 下移 (从 200/380/560 → 240/440/640).
          animalPoses[8] per-dim — slice arrival 时该 animal 切 catch. */}
      {/* 上排 3 (dim 0,1,2 = 河马/兔子/猫): 后方, perspective 0.85x */}
      <g className="animal-lineup-top">
        {[0, 1, 2].map((dimIdx, colIdx) => (
          <AnimalImage
            key={ANIMALS_BY_DIM[dimIdx].id}
            animal={ANIMALS_BY_DIM[dimIdx]}
            pose={animalPoses[dimIdx]}
            x={-160 + colIdx * 160}
            y={240}
            score={scores[dimIdx] ?? 0}
            perspectiveScale={0.85}
          />
        ))}
      </g>
      {/* 中排 2 (dim 3,4 = 大象/老鼠): in-line center, x=±80 错位 */}
      <g className="animal-lineup-middle">
        {[3, 4].map((dimIdx, idx) => (
          <AnimalImage
            key={ANIMALS_BY_DIM[dimIdx].id}
            animal={ANIMALS_BY_DIM[dimIdx]}
            pose={animalPoses[dimIdx]}
            x={idx === 0 ? -80 : 80}
            y={440}
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
            pose={animalPoses[dimIdx]}
            x={-160 + colIdx * 160}
            y={640}
            score={scores[dimIdx] ?? 0}
            perspectiveScale={1.0}
          />
        ))}
      </g>
    </g>
  );
}
