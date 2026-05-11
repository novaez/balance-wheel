// Phase 3 shared craft state. 5 metaphor 共用蜡笔 multiply / palette / rotation jitter.
// design ref: vault Phase 3 design.md §三

import { useMemo } from "react";
import { mulberry32 } from "./random";
import type { CraftState } from "./types";

/**
 * 给一 visit (seed = visitSeed) 算 CraftState. mulberry32 deterministic, 同
 * visit 内多次 render 稳定 ±15° rotation jitter (Calvin&Hobbes "略歪"风).
 */
export function useCraft(visitSeed: number): CraftState {
  return useMemo(() => {
    const rng = mulberry32(visitSeed);
    const rotationJitter = (rng() - 0.5) * 30; // -15° ~ +15°
    return {
      strokeWidth: 1.4, // 蜡笔笔触基线, 跟 Phase 2 sectorPath stroke 一致
      blendMode: "multiply",
      rotationJitter,
    };
  }, [visitSeed]);
}
