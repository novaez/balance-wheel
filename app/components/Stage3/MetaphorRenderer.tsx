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
import { PizzaAdapter } from "./adapters/PizzaAdapter";

interface MetaphorRendererProps {
  scores: Scores;
  metaphor: MetaphorName;
  visitSeed: number;
  onFinish?: () => void;
}

// page.tsx running mode VBOX_RUN: x=-216 y=-180 w=432 h=420. pizza metaphor
// 用 expanded viewBox 540×990. Lineup vertical 下移 (上 330, 中 550, 下 770).
// Mobile container ~340×624 px, iPhone 12 ~74%.
const PIZZA_VBOX = "-270 -180 540 990";

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
      // MetaphorRenderer 不会真被 mount (page.tsx gate `pick.metaphor !== "car"`).
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
    case "pizza":
      // v2 Phase 3b craft 中 (大象 register baseline, 其它 7 animal placeholder).
      // POOL enable 'pizza' 让 dev server 50% 几率 visit pick → 真机 verify register.
      return (
        <svg
          viewBox={PIZZA_VBOX}
          className="h-auto w-full"
          role="img"
          aria-label="生命之轮"
        >
          {PizzaAdapter({
            metaphor: "pizza",
            scores,
            physics: ambient,
            craft,
            visitSeed,
            onFinish,
          })}
        </svg>
      );
    case "cookie":
    case "pot-plants":
    case "campfires":
      // 等 Phase 3b 各自 craft 时实施 (per v2 §四 reframe). POOL 不含这些 metaphor,
      // 实际不会被命中. type exhaustiveness 占位.
      return null;
  }
}
