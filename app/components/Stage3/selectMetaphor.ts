// Phase 3 切换机制 · visit 间纯随机 (mulberry32 per visit, 不存 localStorage).
// design ref: vault 30 Projects 🎯/2026-04.生命之轮/过程/Phase 3 design.md §四

import { mulberry32 } from "./random";
import type { MetaphorName, MetaphorPick } from "./types";

// METAPHOR_POOL · only includes shipped adapters. Phase 3b 实施过程中, deferred
// adapter 不进 pool. Phase 3 final ship 时 5 个全在 pool 即 first batch 全 work.
//
// "5 候选一个 work" 策略: 若某 adapter 单 round 内 fix 不了, 从此 pool 中移除,
// commit 标 "deferred: {metaphor} (reason: ...)", 不阻塞其它 adapter ship.
//
// 2026-05-12 Phase 3b 初始: 4 个新 adapter (cookie / pizza / pot-plants / campfires)
// 全 ship 进 pool. CarAdapter 是 Phase 2 carry, baseline 必 work.
export const METAPHOR_POOL: MetaphorName[] = [
  "car",
  "cookie",
  "pizza",
  "pot-plants",
  "campfires",
];

/**
 * 给一个 visit 选一个 metaphor. 仅在 useEffect / event handler 内调用 — **不能**
 * 在 useState init / render path 跑, 否则 SSG prerender (output: 'export') 跟
 * client hydrate 不一致 → hydration mismatch.
 *
 * Date.now() 作 seed: 每次访问 / "再跑一次" / hard reload 都产新 seed → 大概率
 * 不同 metaphor (5 个 pool, ~1/5 重复率, 跨 visit 体感"随机").
 */
export function selectMetaphorForVisit(): MetaphorPick {
  const visitSeed = Date.now();
  const rng = mulberry32(visitSeed);
  const idx = Math.floor(rng() * METAPHOR_POOL.length);
  return {
    metaphor: METAPHOR_POOL[idx],
    visitSeed,
  };
}
