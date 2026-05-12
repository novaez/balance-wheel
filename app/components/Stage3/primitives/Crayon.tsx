// Crayon primitive — Phase 2 蜡笔 mix-blend-mode multiply 抽取.
// 任何 stroke / fill 子元素套上 <Crayon> 自动叠加蜡笔颜料效果 (重叠 darker).
// design ref: vault Phase 3 design.md §三 + Phase 2 craft sediment "蜡笔 multiply".

import type { ReactNode } from "react";

interface CrayonProps {
  children: ReactNode;
  // opacity 让 stroke 透出"纸纹" (蜡笔不完全 opaque)
  opacity?: number;
}

export function Crayon({ children, opacity = 0.85 }: CrayonProps) {
  return (
    <g style={{ mixBlendMode: "multiply", opacity }}>{children}</g>
  );
}
