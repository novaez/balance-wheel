// MetaphorRenderer — Phase 3 主 entry. v2 修订 (Phase 3a foundation).
//
// v2 spec: vault Phase 3 design.md §v2 修订. wheel 几何 + 颜色 persist 跨 3 幕,
// metaphor 是 environment overlay (不替换 wheel).
//
// v2 Phase 3a 当前状态: 仅 car metaphor active (Phase 2 carry, pass-through).
// 4 个其它 adapter (cookie / pizza / pot-plants / campfires) 在 v2 Phase 3b
// craft 阶段重做 (per v2 §D 5 metaphor dynamic reframe spec). 那时按 v2 spec
// 加 import + dispatch case + 加入 METAPHOR_POOL (见 selectMetaphor.ts).
//
// 接口: { scores, metaphor, visitSeed, onFinish }
//
// 当 metaphor === 'car' 时返回 null — 让 page.tsx 主 wheel SVG 自行 render
// (CarAdapter 是 pass-through; 这也是 v2 wheel persistent pattern 的原型).

import { useCraft } from "./useCraft";
import { ambientBreathFrom, scoresEntropy } from "./usePhysics";
import type { MetaphorName, Scores } from "./types";
import { CarAdapter } from "./adapters/CarAdapter";

interface MetaphorRendererProps {
  scores: Scores;
  metaphor: MetaphorName;
  visitSeed: number;
  onFinish?: () => void;
}

export function MetaphorRenderer({
  scores,
  metaphor,
  visitSeed,
  onFinish,
}: MetaphorRendererProps) {
  const craft = useCraft(visitSeed);

  // ambient physics is shared infra; computed at render snapshot.
  const ambient = {
    jitter: Math.min(1, scoresEntropy(scores) / 5),
    ambientBreath: ambientBreathFrom(performance.now()),
  };

  switch (metaphor) {
    case "car":
      // Pass-through: main wheel SVG in page.tsx carries Phase 2 car render.
      return CarAdapter({
        metaphor: "car",
        scores,
        physics: {
          ...ambient,
          rotation: 0,
          bob: 0,
          velocity: 0,
          groundY: 166,
          progress: 0,
          runId: 0,
          groundProgressAbs: 0,
          terrainElements: [],
        },
        craft,
        visitSeed,
        onFinish,
      });
    case "cookie":
    case "pizza":
    case "pot-plants":
    case "campfires":
      // v2 Phase 3a: 4 个 non-car adapter 等 Phase 3b craft 时实施.
      // selectMetaphor POOL 当前只含 'car', 这些 case 实际不会被命中 — keep for
      // type exhaustiveness. Phase 3b 加 adapter + dispatch case + POOL 时移除
      // 此处 fallthrough.
      return null;
  }
}
