// Phase 3 shared physics. 从 page.tsx Phase 2 sediment 抽取:
//   - computeBob (wheel rotation → vertical offset, 车 metaphor 用)
//   - obstaclesData / terrain (per runId mulberry32, 车 metaphor 用 + Phase 3c terrain elements)
//   - ambient breath (5 metaphor 都用, sin loop 0-1)
//   - ambient jitter (评分 entropy 驱动, 0-1)
//
// design ref: vault Phase 3 design.md §三 + §六

import { useMemo } from "react";
import { mulberry32, hashSeed } from "./random";
import type {
  AmbientPhysics,
  Scores,
  TerrainElement,
  TerrainPhysics,
} from "./types";

// 几何常量 — 跟 page.tsx 同步.
export const MAX_RADIUS = 160;
export const SECTOR_DEG = 45;
export const RUN_DURATION_MS = 5000;
export const RUN_TOTAL_ROTATION_DEG = 720;
export const GROUND_PER_DEG = 1.8;

const MIN_VISIBLE_RATIO = 0.12;

export function sectorRadius(score: number): number {
  if (score <= 0) return 0;
  return (
    MAX_RADIUS * (MIN_VISIBLE_RATIO + (score / 10) * (1 - MIN_VISIBLE_RATIO))
  );
}

/**
 * computeBob — wheel 转动时 lowest point of outline 的 y 跟 ground 对齐.
 * Phase 2 sediment, 车 metaphor 专用 (wheel rotation + vertical drop).
 */
export function computeBob(rotation: number, scores: Scores): number {
  let maxY = 0;
  for (let i = 0; i < 8; i++) {
    const r = sectorRadius(scores[i] ?? 0);
    const startScreen = -90 + i * SECTOR_DEG + rotation;
    const endScreen = startScreen + SECTOR_DEG;
    const k = Math.ceil((startScreen - 90) / 360);
    const peakInRange = 90 + 360 * k <= endScreen;
    const maxSin = peakInRange
      ? 1
      : Math.max(
          Math.sin((startScreen * Math.PI) / 180),
          Math.sin((endScreen * Math.PI) / 180)
        );
    if (maxSin > 0) {
      const sectorMaxY = r * maxSin;
      if (sectorMaxY > maxY) maxY = sectorMaxY;
    }
  }
  return MAX_RADIUS - maxY;
}

/**
 * 评分 entropy — 8 个评分的方差 / 标准差作为"颠不颠"信号. Phase 2 obstacle
 * count 基于 entropy 比基于固定 3 更 ground (高 entropy = wheel 更不规则 =
 * 视觉应该更颠). 5 metaphor 共用 entropy 概念, 不同 adapter 用不同 mapping.
 */
export function scoresEntropy(scores: Scores): number {
  if (scores.length === 0) return 0;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / scores.length;
  return Math.sqrt(variance); // standard deviation, 0..~5
}

/**
 * 车 metaphor terrain elements. Phase 3c · design §六 spec.
 * 4-6 elements per 1200px run, mulberry32 per runId.
 *
 * type 分布:
 *   - pit (沟): vertical 30-80px deep
 *   - slope-up / slope-down: 15-30°
 *   - sand: 摩擦+ (减速, 视觉颗粒)
 *   - snow: 浅凹
 *   - rock: random scatter (Phase 2 obstacle sediment 复用)
 *   - grass: 装饰, 无 physics
 */
export function useTerrainElements(runId: number): TerrainElement[] {
  return useMemo(() => {
    const rng = mulberry32(hashSeed(runId, 0xb04d));
    const elements: TerrainElement[] = [];
    const used: number[] = [];
    // 4-6 elements in [180, 1200), min spacing 180
    const target = 4 + Math.floor(rng() * 3); // 4-6
    let attempts = 0;
    while (elements.length < target && attempts < 80) {
      attempts++;
      const at = 180 + Math.floor(rng() * 1020);
      if (used.some((p) => Math.abs(p - at) < 180)) continue;
      used.push(at);
      // 按概率分配 type — pit/rock 重一些 (Phase 2 carry), 其它装饰类轻
      const roll = rng();
      let type: TerrainElement["type"];
      let radius = 14 + Math.floor(rng() * 6);
      let height = 7 + Math.floor(rng() * 4);
      let length = 0;
      if (roll < 0.28) {
        type = "rock";
        radius = 14 + Math.floor(rng() * 6);
        height = 7 + Math.floor(rng() * 4);
      } else if (roll < 0.46) {
        type = "pit";
        radius = 22 + Math.floor(rng() * 10);
        height = 10 + Math.floor(rng() * 6);
      } else if (roll < 0.6) {
        type = "slope-up";
        length = 60 + Math.floor(rng() * 50);
        radius = length / 2;
        height = Math.floor(length * (0.25 + rng() * 0.25)); // tan 15-30°
      } else if (roll < 0.72) {
        type = "slope-down";
        length = 60 + Math.floor(rng() * 50);
        radius = length / 2;
        height = Math.floor(length * (0.25 + rng() * 0.25));
      } else if (roll < 0.82) {
        type = "sand";
        length = 80 + Math.floor(rng() * 70);
        radius = length / 2;
        height = 3;
      } else if (roll < 0.92) {
        type = "snow";
        length = 100 + Math.floor(rng() * 100);
        radius = length / 2;
        height = 4;
      } else {
        type = "grass";
        length = 50 + Math.floor(rng() * 50);
        radius = length / 2;
        height = 6;
      }
      elements.push({ atProgress: at, type, radius, height, length });
    }
    elements.sort((a, b) => a.atProgress - b.atProgress);
    return elements;
  }, [runId]);
}

/**
 * groundCurveDeviation — 给定 ground-local x, 返回 ground y 的 deviation.
 * 用于 ground polyline 绘制 + wheel 跟随 (obstacleBob).
 *
 * 跟 page.tsx Phase 2 同 signature, 但 dispatch 到不同 terrain type.
 */
export function makeGroundCurveDeviation(
  elements: TerrainElement[],
  groundProgressAbs: number
): (x: number) => number {
  return (x: number) => {
    let dy = 0;
    for (const e of elements) {
      const ex = e.atProgress - groundProgressAbs;
      const dx = x - ex;
      const r = e.radius;
      if (Math.abs(dx) > r) continue;
      const t = dx / r;
      const bell = Math.cos((t * Math.PI) / 2) ** 2;
      switch (e.type) {
        case "rock":
          // 凸起 — Phase 2 bump 行为, wheel 弹起
          dy += -e.height * bell;
          break;
        case "pit":
          // 下沉 — wheel 落入
          dy += e.height * bell;
          break;
        case "slope-up":
          // 渐升 — left half flat, right half rises. 简化: bell 给 half-positive
          dy += -e.height * bell * 0.7;
          break;
        case "slope-down":
          // 渐降
          dy += e.height * bell * 0.5;
          break;
        case "sand":
          // 浅 ripple — small vertical noise
          dy += Math.sin(dx * 0.5) * 2 * bell;
          break;
        case "snow":
          // 浅凹
          dy += e.height * bell * 0.6;
          break;
        case "grass":
          // 装饰, 不改 ground (visual only)
          break;
      }
    }
    return dy;
  };
}

/**
 * 5 metaphor 共用 ambient breath. 输入 timestamp (ms), 返回 0-1 sin loop.
 * 共享 breathing curve 让多个 adapter 视觉律动同源.
 */
export function ambientBreathFrom(timeMs: number): number {
  return 0.5 + 0.5 * Math.sin(timeMs / 1200);
}

/**
 * 构造 AmbientPhysics — non-car metaphor (cookie / pizza / pot-plants / campfires) 用.
 */
export function buildAmbientPhysics(
  scores: Scores,
  timeMs: number
): AmbientPhysics {
  const entropy = scoresEntropy(scores);
  return {
    jitter: Math.min(1, entropy / 5),
    ambientBreath: ambientBreathFrom(timeMs),
  };
}

/**
 * 构造 TerrainPhysics — 车 metaphor 用. 输入 progress (0-1) + runId + scores.
 */
export function buildTerrainPhysics(
  scores: Scores,
  progress: number,
  runId: number,
  terrainElements: TerrainElement[],
  timeMs: number
): TerrainPhysics {
  const rotation = progress * RUN_TOTAL_ROTATION_DEG;
  const groundProgressAbs = rotation * GROUND_PER_DEG;
  const bob = computeBob(rotation, scores);
  const curve = makeGroundCurveDeviation(terrainElements, groundProgressAbs);
  // velocity proxy: ease-in-out derivative * base speed
  const velocity = GROUND_PER_DEG * (1 - Math.abs(2 * progress - 1));
  return {
    rotation,
    bob,
    velocity,
    groundY: 166, // MAX_RADIUS + 6, matches page.tsx GROUND_Y
    jitter: Math.min(1, scoresEntropy(scores) / 5),
    ambientBreath: ambientBreathFrom(timeMs),
    progress,
    runId,
    groundProgressAbs,
    terrainElements,
    // shadow field — adapter 用 (curve 是闭包, 不进 dataclass; 在 adapter 内部 reconstruct)
    // 这里保留 type 不携 closure; CarAdapter 用 makeGroundCurveDeviation 自行 reconstruct.
  };
}
