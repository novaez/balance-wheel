// PizzaAdapter — Phase 3 v2 §四 reframe (liushu specific).
//
// Essence (v2 §四 + 用户给的核心 reframe):
//   - wheel 几何 = pizza 8 块 (WheelBase persist, 几何不动, 颜色微 shift 到 pizza 色)
//   - 8 动物 + 小朋友排排坐 (wheel 下方一排 perspective, 远小近大, 各 ±10 笔)
//   - 一块块撕飞分给排排坐成员 (slice 副本飞 overlay; 主 wheel persist 不损坏)
//   - 大小对比 3.25x (大象大块 / 小老鼠小块)
//   - 12 principles: anticipation (期待眼神) → snap (sector 飞) → arc trajectory →
//     squash (落到动物手里) → follow-through (摇手 reaction)
//   - motion line dashed trail (Calvin & Hobbes 经典手法)
//   - feTurbulence wobble ambient (Aardman 粘土 stop-motion 颤抖)
//
// Q3 "Self stable + Environment 变化" 落地:
//   - Self (wheel pizza 几何) 不变, 主 wheel persistent visible 在 center
//   - Environment (8 动物 + slice 副本飞动作) 是 overlay, 第三幕 fade out
//   - 第三幕 wheel 还原回 Stage 2 涂色态 (geometry 不变)
//
// Reference craft bar (per [[Phase 3 craft references]]):
//   - Pixar Presto: comic timing 教科书, 节奏 > 动作
//   - Aardman Creature Comforts: quirky ambient + 静态 character 也传神
//   - Pixar Piper: 单 character expressive motion 撑全片
//
// design ref: vault Phase 3 design.md §v2.四 (pizza adapter spec).

"use client";

import { useEffect, useRef } from "react";
import type { AdapterProps } from "../types";
import { useAnimation } from "../useAnimation";
import { SvgFilter, useWobbleSeed } from "../primitives/SvgFilter";

export const PIZZA_DURATION_MS = 5500;

// darken hex by factor (用作 outline color, 比 fill 深 0.45x).
function darken(hex: string, factor: number = 0.55): string {
  const h = hex.replace("#", "");
  const r = Math.floor(parseInt(h.slice(0, 2), 16) * factor);
  const g = Math.floor(parseInt(h.slice(2, 4), 16) * factor);
  const b = Math.floor(parseInt(h.slice(4, 6), 16) * factor);
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Animal character mapping — fixed by-dim (liushu 拍板 2026-05-12).
// ─────────────────────────────────────────────────────────────────────────────
// liushu confirmed: "小朋友就是指那些动物, 是动物小朋友" — 8 character 全是萌型
// 小动物 (不加额外 first-person 化身).
//
// reference register = 低龄绘本萌型 (小熊很忙系列 panel "排好队 一个一个" 是
// 排排坐模板). 大头圆眼 + 高饱和块色 + 朴拙工整线条 + cute 表情. Pizza adapter
// 局部特例 register, 其它 4 metaphor 仍走 Calvin & Hobbes "成熟的不端庄".
//
// Q3 落地: wheel 仍蜡笔 (Self stable, Phase 2 carry), animal lineup 走萌型
// (Environment 独立 register).
//
// **Fixed by-dim mapping** (跨 visit identity stable, 让 "今天大象分到的块小" →
// 直接 surface 反思 hook "健康分低"). 同时 liushu insight: animal natural color
// = dim color (Phase 1.5j palette warm/cool 交替) — visual link "animal ↔ sector
// ↔ dim" 三层对接, 萌型不写实接受蓝象/紫虎/绿长颈鹿/红河马等非自然色.
//
// size ratio 3.25x: 大象 3.25 / 小鸟 ~1.0, 中间按 log-scale 渐变.
// 排排坐 layout 按 dim 顺序 (左到右), 同时形成 Phase 1.5j palette 暖/冷 律动.
interface AnimalChar {
  id: string;
  zh: string;
  size: number; // body height multiplier
  color: string; // = dim color (visual anchor)
}

// ─────────────────────────────────────────────────────────────────────────────
// Animal SVG primitives — 低龄绘本萌型, ±10 笔 神似不形似.
// register: 大头圆眼 + 高饱和块色 + 朴拙工整 outline + cute 表情. 正面视 (面向
// viewer), 头微抬看 wheel (wheel 在 lineup 上方).
// 各 primitive 接 color (= dim color) 作 fill, outline = darken(color, 0.55).
// 视觉坐标系: 头中心 (0, -3), 脚底 y=21, 总高 ~30, 宽 ~22-26 (rx ear extended).
// 实际 scale 由 transform 控制 (size * 0.5).
// ─────────────────────────────────────────────────────────────────────────────

function ElephantPrimitive({ color }: { color: string }) {
  const stroke = darken(color, 0.55);
  return (
    <g className="primitive elephant">
      {/* body — 椭圆 */}
      <ellipse cx="0" cy="10" rx="13" ry="8" fill={color} stroke={stroke} strokeWidth={1.2} />
      {/* 2 条前腿 visible (后腿藏在 body 后) */}
      <rect x="-7" y="15" width="4" height="6" rx="1.5" fill={color} stroke={stroke} strokeWidth={1} />
      <rect x="3" y="15" width="4" height="6" rx="1.5" fill={color} stroke={stroke} strokeWidth={1} />
      {/* head — 大圆 (萌型 head/body ratio 1.2) */}
      <circle cx="0" cy="-3" r="11" fill={color} stroke={stroke} strokeWidth={1.2} />
      {/* ears — 两侧椭圆 */}
      <ellipse cx="-11" cy="-3" rx="4" ry="6" fill={color} stroke={stroke} strokeWidth={1} />
      <ellipse cx="11" cy="-3" rx="4" ry="6" fill={color} stroke={stroke} strokeWidth={1} />
      {/* trunk — 下垂弧线 */}
      <path d="M0 6 Q-2 12 0.5 16" stroke={stroke} strokeWidth={3} fill="none" strokeLinecap="round" />
      {/* eyes — 2 黑圆 (萌型: 大眼 + 小白点 highlight) */}
      <circle cx="-4" cy="-4" r="1.8" fill="#1a1410" />
      <circle cx="4" cy="-4" r="1.8" fill="#1a1410" />
      <circle cx="-3.5" cy="-4.5" r="0.6" fill="white" />
      <circle cx="4.5" cy="-4.5" r="0.6" fill="white" />
      {/* smile — 微笑弧 */}
      <path d="M-3 3 Q0 5 3 3" stroke={stroke} strokeWidth={1} fill="none" strokeLinecap="round" />
    </g>
  );
}

// Phase 3b craft polish: 剩 7 animal primitives 等大象 register 验证 OK 后 batch.
// 当前 placeholder = 圆色块 + 2 黑眼, 让 lineup 整体 visible 验证 layout/size ratio.
function PlaceholderAnimalPrimitive({ color, zh }: { color: string; zh: string }) {
  const stroke = darken(color, 0.55);
  return (
    <g className="primitive placeholder">
      <circle cx="0" cy="0" r="14" fill={color} stroke={stroke} strokeWidth={1.2} opacity={0.9} />
      <circle cx="-4" cy="-3" r="2" fill="#1a1410" />
      <circle cx="4" cy="-3" r="2" fill="#1a1410" />
      <text x="0" y="18" textAnchor="middle" fontSize="5" fill={stroke}>{zh}</text>
    </g>
  );
}

// indexed by dim idx (page.tsx DIMENSIONS 顺序):
//   0: 家庭/朋友  1: 另一半/爱情  2: 娱乐与休闲  3: 健康
//   4: 财富       5: 个人成长     6: 环境         7: 职业
export const ANIMALS_BY_DIM: AnimalChar[] = [
  { id: "hippo",    zh: "河马",   size: 2.55, color: "#ef4444" }, // 家庭/朋友 — 群居慢悠悠
  { id: "rabbit",   zh: "兔子",   size: 1.45, color: "#06b6d4" }, // 另一半/爱情 — 心跳/温柔
  { id: "cat",      zh: "猫",     size: 1.20, color: "#f59e0b" }, // 娱乐与休闲 — 自在放松
  { id: "elephant", zh: "大象",   size: 3.25, color: "#3b82f6" }, // 健康 — 身体是基石
  { id: "mouse",    zh: "老鼠",   size: 1.00, color: "#ec4899" }, // 财富 — 储粮敏感
  { id: "giraffe",  zh: "长颈鹿", size: 1.85, color: "#10b981" }, // 个人成长 — 高视野
  { id: "bird",     zh: "小鸟",   size: 1.00, color: "#f97316" }, // 环境 — 轻盈飞行
  { id: "tiger",    zh: "老虎",   size: 2.10, color: "#a855f7" }, // 职业 — 进取强势
];
// ─────────────────────────────────────────────────────────────────────────────

export function PizzaAdapter(
  props: Extract<AdapterProps, { metaphor: "pizza" }>,
) {
  const { scores, onFinish } = props;
  const svgRef = useRef<SVGGElement>(null);
  const tl = useAnimation();
  const wobbleSeed = useWobbleSeed(120); // ~8 fps stop-motion mimic

  useEffect(() => {
    // TODO (Phase 3b craft iterate) — GSAP timeline:
    //   t=0-0.6s: ambient settle (动物排排坐 fade in, 眨眼)
    //   t=0.6-4.0s: 8 sector 副本 staggered 飞 (大象先, 小鸟最后), bezier arc trajectory
    //     each slice: anticipation (sector 边缘微颤 0.15s) → snap (lift + scale 1.1)
    //                 → arc fly (slow in/out) → squash (落手时 scale 0.9x → 1.0)
    //                 → follow-through (动物摇手 / 笑)
    //   t=4.0-5.5s: rest, ambient breathing, motion line trail fade
    //
    // 实施 anchor: useAnimation.ts top-of-file cheat sheet (12 principles cookbook).

    // Placeholder finish trigger (timeline 接好后改成 timeline 的 onComplete):
    const finishTimer = window.setTimeout(() => {
      onFinish?.();
    }, PIZZA_DURATION_MS);

    return () => {
      window.clearTimeout(finishTimer);
      tl.kill();
    };
  }, [tl, onFinish]);

  // Scene 布局 (viewBox: page.tsx VBOX_RUN ≈ x[-216,216] y[-180,240]):
  //   wheel center (0, 0), MAX_RADIUS = 160 → pizza body
  //   动物排排坐 baseline y ≈ 200 (wheel 下方), x 分 8 等位 [-180, 180]
  //   slice 副本飞行: from sector position → arc → animal hand
  return (
    <g ref={svgRef}>
      <defs>
        <SvgFilter id="pizza-wobble" baseSeed={wobbleSeed} scale={1.2} />
      </defs>

      {/* TODO Phase 3b · 8 slice "副本" overlay (跟 WheelBase sectors 同形状, 起始位置 overlap).
          GSAP animate translate + rotate → 落到对应动物手前. 副本飞走但主 wheel
          persist (几何/颜色不动) — Q3 Self stable 落地. */}
      <g className="pizza-slice-copies" filter="url(#pizza-wobble)">
        {/* Phase 3b craft iterate 时 fill 这里: 8 path 跟 WheelBase computeWheelGeometry
            同 sector geometry, 颜色 = pizza tone (cheese 黄 / 番茄红 / 蘑菇 棕 mixed) */}
      </g>

      {/* TODO Phase 3b · 8 动物排排坐 (一排 lineup, 按 dim 顺序 / Phase 1.5j
          palette 暖冷律动). 各 animal SVG primitive 低龄绘本萌型 ±10 笔 简笔.
          animal natural color = dim color (visual anchor). */}
      <g className="animal-lineup" filter="url(#pizza-wobble)">
        {ANIMALS_BY_DIM.map((animal, dimIdx) => {
          // 排排坐位置: 8 等距 from -180 to 180, baseline y=220 (wheel 下方)
          const x = -180 + (dimIdx / 7) * 360;
          const y = 220;
          return (
            <g
              key={animal.id}
              className={`animal animal-${animal.id}`}
              data-dim-idx={dimIdx}
              transform={`translate(${x.toFixed(1)}, ${y}) scale(${(animal.size * 0.5).toFixed(2)})`}
            >
              {animal.id === "elephant" ? (
                <ElephantPrimitive color={animal.color} />
              ) : (
                <PlaceholderAnimalPrimitive color={animal.color} zh={animal.zh} />
              )}
            </g>
          );
        })}
      </g>

      {/* TODO Phase 3b · motion line dashed trail (Calvin & Hobbes 手法).
          slice 飞行 trajectory 旁配虚线小弧 + 速度感斜线. */}
      <g className="motion-lines" />

      {/* DEBUG: 显示评分 (Phase 3b craft 完移除). */}
      {process.env.NODE_ENV === "development" && (
        <text x="0" y="-180" textAnchor="middle" fontSize="8" fill="#999">
          scores: [{scores.join(",")}]
        </text>
      )}
    </g>
  );
}
