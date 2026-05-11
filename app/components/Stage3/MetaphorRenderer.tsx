// MetaphorRenderer — Phase 3 主 entry. 根据 metaphor name dispatch 到对应
// adapter.
//
// 接口: { scores, metaphor, visitSeed, onFinish }
//
// 当 metaphor === 'car' 时返回 null — 让 page.tsx 主 wheel SVG 自行 render
// (CarAdapter 是 pass-through). 其它 4 metaphor 返回各自 self-contained <svg>
// 元素, 替换主 wheel SVG.
//
// design ref: vault Phase 3 design.md §三.

import { useCraft } from "./useCraft";
import {
  ambientBreathFrom,
  scoresEntropy,
} from "./usePhysics";
import type { MetaphorName, Scores } from "./types";
import { CarAdapter } from "./adapters/CarAdapter";
import { CookieAdapter } from "./adapters/CookieAdapter";
import { PizzaAdapter } from "./adapters/PizzaAdapter";
import { PotPlantsAdapter } from "./adapters/PotPlantsAdapter";
import { CampfiresAdapter } from "./adapters/CampfiresAdapter";

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

  // ambient physics is shared infra; we compute a snapshot at render time
  // (adapters that need fresh-frame ambient drive their own rAF loop).
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
      return (
        <CookieAdapter
          metaphor="cookie"
          scores={scores}
          physics={ambient}
          craft={craft}
          visitSeed={visitSeed}
          onFinish={onFinish}
        />
      );
    case "pizza":
      return (
        <PizzaAdapter
          metaphor="pizza"
          scores={scores}
          physics={ambient}
          craft={craft}
          visitSeed={visitSeed}
          onFinish={onFinish}
        />
      );
    case "pot-plants":
      return (
        <PotPlantsAdapter
          metaphor="pot-plants"
          scores={scores}
          physics={ambient}
          craft={craft}
          visitSeed={visitSeed}
          onFinish={onFinish}
        />
      );
    case "campfires":
      return (
        <CampfiresAdapter
          metaphor="campfires"
          scores={scores}
          physics={ambient}
          craft={craft}
          visitSeed={visitSeed}
          onFinish={onFinish}
        />
      );
  }
}
