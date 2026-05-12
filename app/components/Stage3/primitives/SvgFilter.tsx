// SvgFilter — feTurbulence wobble filter primitive (Camillo Visini pattern).
// v2 spec ref: Phase 3 design.md §v2.C (Implementation stack C — feTurbulence
// wobble filter polish layer, mimic Aardman 粘土 stop-motion 颤抖).
//
// Phase 3a foundation scaffold. v2 Phase 3b craft adapter 用法:
//
//   import { SvgFilter, useWobbleSeed } from "../primitives/SvgFilter";
//
//   function CookieAdapter() {
//     const seed = useWobbleSeed(); // frame-by-frame seed change
//     return (
//       <svg>
//         <defs>
//           <SvgFilter id="cookie-wobble" baseSeed={seed} scale={2} />
//         </defs>
//         <path filter="url(#cookie-wobble)" d="..." />
//       </svg>
//     );
//   }
//
// feTurbulence + feDisplacementMap 组合: 给 SVG path / shape 加 hand-drawn
// 颤抖效果, 模仿 Aardman 粘土 stop-motion 的每帧"重画"感.
//
// 调参建议 (依视觉效果反馈调):
//   - baseFrequency 0.01-0.05: 0.02 默认温和, 0.05 强 wobble. 高频 = 细颤
//   - scale 1-5: 1 微 wobble, 3 中等, 5+ 强 wobble. 高 = 大幅度位移
//   - seed change 频率: 80-150ms (大约 6-12 fps, mimic stop-motion 帧率)
//
// reference: https://camillovisini.com/coding/svg-wobbly-handdrawn-effect

import { useEffect, useState } from "react";

interface SvgFilterProps {
  id: string;
  baseSeed?: number;
  baseFrequency?: number;
  scale?: number;
  numOctaves?: number;
}

/**
 * SVG filter definition for hand-drawn wobble effect.
 * Pair with `useWobbleSeed()` for frame-by-frame stop-motion 颤抖.
 *
 * 放在 <defs> 内, path / shape 用 filter="url(#id)" 引用.
 */
export function SvgFilter({
  id,
  baseSeed = 0,
  baseFrequency = 0.02,
  scale = 1.5,
  numOctaves = 2,
}: SvgFilterProps) {
  return (
    <filter id={id}>
      <feTurbulence
        type="fractalNoise"
        baseFrequency={baseFrequency}
        numOctaves={numOctaves}
        seed={baseSeed}
      />
      <feDisplacementMap in="SourceGraphic" scale={scale} />
    </filter>
  );
}

/**
 * Frame-by-frame seed change hook for stop-motion 颤抖效果.
 * 默认 100ms (10 fps), mimic Aardman / Wallace & Gromit 帧率感.
 *
 * Returns: current seed (integer), tick 触发 SvgFilter re-render → 视觉颤抖.
 */
export function useWobbleSeed(intervalMs: number = 100): number {
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeed((s) => (s + 1) % 1000);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return seed;
}
