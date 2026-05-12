// Phase 3 渲染抽象层类型定义。
// design ref: vault 30 Projects 🎯/2026-04.生命之轮/过程/Phase 3 design.md §三

import type { ReactElement } from "react";

export type Scores = number[]; // length 8, each 0..10 integer (复用 page.tsx Scores)

// 5 metaphor first batch — visit 间纯随机切换 (mulberry32 per visit).
export type MetaphorName =
  | "car"
  | "cookie"
  | "pizza"
  | "pot-plants"
  | "campfires";

// metaphor 中文名 (Stage 6 卡片 footer "今日 · {name}" 用)
export const METAPHOR_DISPLAY_NAME_ZH: Record<MetaphorName, string> = {
  car: "车",
  cookie: "饼干",
  pizza: "pizza",
  "pot-plants": "盆栽",
  campfires: "篝火",
};

// visit-level pick result. mulberry32 seeded by Date.now(); 不存 localStorage.
export interface MetaphorPick {
  metaphor: MetaphorName;
  visitSeed: number; // Date.now() at mount; adapter 内部 random 用同 seed
}

// 5 metaphor 共用 craft state (蜡笔 multiply / palette / rotation jitter).
export interface CraftState {
  strokeWidth: number;
  blendMode: "multiply";
  rotationJitter: number; // ±15° random, mulberry32 seeded
}

// AmbientPhysics — 静态场景 metaphor 共用 (cookie / pizza / pot-plants / campfires).
// 仅有 ambient breathing + jitter, 没有 vertical bob / velocity / ground.
export interface AmbientPhysics {
  jitter: number; // 评分 entropy 驱动 angular 微抖
  ambientBreath: number; // 0-1 sin loop, 共享 breathing curve
}

// TerrainPhysics — 车 metaphor 专用. 含 vertical bob / velocity / ground y.
export interface TerrainPhysics extends AmbientPhysics {
  rotation: number; // 当前角度 (deg), running 阶段 progress * 720
  bob: number; // vertical 位移 (terrain-driven, 车 metaphor 专用)
  velocity: number; // 当前速度 (terrain-modulated, design 未来用)
  groundY: number; // 当前 ground y position
  progress: number; // 0-1, 5s 跑一程
  runId: number; // mulberry32 per runId 用, 每次 startRide 重新生成 terrain
  groundProgressAbs: number; // ground 已 scroll 的绝对距离 (px)
  // terrain elements: 沟 / 坡 / 沙地 / 雪地 / 石块 / 草丛
  terrainElements: TerrainElement[];
}

export type TerrainElementType =
  | "pit" // 沟
  | "slope-up" // 上坡
  | "slope-down" // 下坡
  | "sand" // 沙地
  | "snow" // 雪地
  | "rock" // 石块
  | "grass"; // 草丛 (装饰)

export interface TerrainElement {
  atProgress: number; // distance along run (px)
  type: TerrainElementType;
  radius: number;
  height: number;
  length: number; // 沿 ground 方向覆盖距离 (slope/sand/snow/grass)
}

// AdapterProps · discriminated union per metaphor.
// CarAdapter 拿 TerrainPhysics, 其它 4 个拿 AmbientPhysics subset.
// 4 个 non-car metaphor 各自独立分支 (而不是合一 union literal), 让
// Extract<AdapterProps, { metaphor: 'campfires' }> 正确 narrow 出 single member,
// 不返回 never.
interface AmbientAdapterPropsBase {
  scores: Scores;
  physics: AmbientPhysics;
  craft: CraftState;
  visitSeed: number;
  onFinish?: () => void;
}
export type AdapterProps =
  | {
      metaphor: "car";
      scores: Scores;
      physics: TerrainPhysics;
      craft: CraftState;
      visitSeed: number;
      onFinish?: () => void;
    }
  | (AmbientAdapterPropsBase & { metaphor: "cookie" })
  | (AmbientAdapterPropsBase & { metaphor: "pizza" })
  | (AmbientAdapterPropsBase & { metaphor: "pot-plants" })
  | (AmbientAdapterPropsBase & { metaphor: "campfires" });

export interface MetaphorAdapter {
  name: MetaphorName;
  duration: number; // animation 总时长 (ms), running mode 后自动进 reflect
  render: (props: AdapterProps) => ReactElement;
}
