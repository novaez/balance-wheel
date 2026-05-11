// CarAdapter — Phase 2 carry. 视觉 / 行为 100% 一致 (verify 抽象层 work).
//
// 当前实现: pass-through marker. Phase 2 的 Stage 3 渲染逻辑保留在 page.tsx
// 主 wheel SVG 中 (rotation / bob / obstacles / ground 都跟 Stage 2/4 共享 SVG
// infrastructure). CarAdapter 的作用是声明 "car metaphor 用主 wheel SVG render"
// 而不是另起 scene.
//
// 这种 split 是设计折衷: 车 metaphor 跟 wheel 的几何完全耦合 (rotation +
// vertical bob), Phase 3a 重写整套机制会破 Phase 2 sediment (Mobile UX baseline
// 12 条 / 蜡笔 multiply / N∝r² density / obstacles random). 保持 Phase 2 carry
// 验证 minimum scope, 其它 4 metaphor 各自独立 scene 不受影响.
//
// Phase 3c 后此 adapter 升级: terrain elements 多样化 (沟 / 坡 / 沙 / 雪 /
// 石 / 草) 替换原 obstacles, 但 wheel + ground geometry 仍走主 wheel SVG.
//
// design ref: vault Phase 3 design.md §三 + Metaphor 1.

import type { AdapterProps } from "../types";

export function CarAdapter(_props: Extract<AdapterProps, { metaphor: "car" }>) {
  // pass-through: 主 wheel SVG 已 carry Stage 3 行为, 此处不渲染额外内容.
  // 返回 null, MetaphorRenderer 收到 null 也 propagate null, 主 page.tsx
  // 知道 "metaphor === 'car' 走主 wheel SVG render" (不替换).
  return null;
}

export const CAR_DURATION_MS = 5000;
