// WheelBase — Stage 2 涂色 wheel 持续 component (cross-stage self anchor).
// v2 spec ref: Phase 3 design.md §v2.E (Wheel persistence).
//
// Phase 3a foundation scaffold. 当前 car metaphor 仍走 page.tsx 主 wheel SVG
// (Phase 2 sediment carry, 不动). v2 Phase 3b craft 4 新 adapter 时, adapter 用
// 此 component 作 wheel background layer — environment overlay 在 wheel 周围/
// 上面/底下 ("Self stable + Environment 变化" Q3 落地).
//
// Adapter 用法 (Phase 3b):
//   <WheelBase scores={scores} visitSeed={visitSeed} transform="scale(0.55, 0.45) translate(0, -90)" />
//   {/* environment overlay 围着 wheel */}
//
// 8 sector colors 复用 Phase 2 sediment palette (kindergarten 高饱和).
//
// design.md §v2.E: wheel 几何 + 颜色 persist 跨 3 幕, metaphor 是 overlay.

export interface WheelGeometry {
  cx: number;
  cy: number;
  maxRadius: number;
  sectors: { startAngle: number; endAngle: number; radius: number }[];
}

/**
 * Compute 8 sector geometry from scores. Inlined in WheelBase (Phase 3a
 * foundation scaffold). Phase 3b 可考虑 lift 到 usePhysics.ts shared util.
 */
export function computeWheelGeometry(
  scores: number[],
  cx: number,
  cy: number,
  maxRadius: number,
): WheelGeometry {
  return {
    cx,
    cy,
    maxRadius,
    sectors: scores.map((s, i) => ({
      startAngle: (i / 8) * 2 * Math.PI - Math.PI / 2,
      endAngle: ((i + 1) / 8) * 2 * Math.PI - Math.PI / 2,
      radius: (Math.max(0, Math.min(10, s)) / 10) * maxRadius,
    })),
  };
}

interface WheelBaseProps {
  scores: number[]; // 8 维度, 0-10
  visitSeed: number; // 跟 page.tsx 同 seed, 保证视觉一致
  cx?: number; // center x in SVG coords
  cy?: number; // center y
  maxRadius?: number;
  transform?: string; // 给 wheel 加 transform (e.g., 第二幕 scaleY 透视 hint)
  opacity?: number; // 第二幕 fade 用
}

// 8 sector colors (Phase 2 sediment palette, 复用 kindergarten 蜡笔色)
const SECTOR_COLORS = [
  "#d04030", // red — 健康
  "#e88a3d", // orange — 财富
  "#f3c843", // yellow — 个人成长
  "#6ba84f", // green — 环境
  "#5a9fb7", // cyan — 职业
  "#4060a8", // blue — 家庭朋友
  "#8a6db5", // purple — 另一半爱情
  "#e07ba0", // pink — 娱乐与休闲
];

/**
 * 渲染 Stage 2 涂色 wheel (8 sector 彩色). 复用 Phase 2 sediment 几何 + 颜色.
 *
 * v2 Phase 3b adapter 用法: 把此 component 放在 adapter SVG 内, 加 transform
 * (第二幕 wheel 缩 + 上移 + scaleY 透视 hint), environment 元素 fade in 围着.
 *
 * 当前 Phase 3a foundation: page.tsx 主 wheel SVG 仍 Phase 2 carry, 此
 * component 未集成 production code, scaffold ready for Phase 3b.
 */
export function WheelBase({
  scores,
  visitSeed: _visitSeed,
  cx = 200,
  cy = 200,
  maxRadius = 150,
  transform,
  opacity = 1,
}: WheelBaseProps) {
  const geometry = computeWheelGeometry(scores, cx, cy, maxRadius);

  return (
    <g transform={transform} opacity={opacity}>
      {geometry.sectors.map((sector, i) => {
        const x0 = cx + Math.cos(sector.startAngle) * sector.radius;
        const y0 = cy + Math.sin(sector.startAngle) * sector.radius;
        const x1 = cx + Math.cos(sector.endAngle) * sector.radius;
        const y1 = cy + Math.sin(sector.endAngle) * sector.radius;
        const d = `M${cx},${cy} L${x0},${y0} A${sector.radius},${sector.radius} 0 0,1 ${x1},${y1} Z`;
        return (
          <path
            key={i}
            d={d}
            fill={SECTOR_COLORS[i]}
            stroke="rgba(20,16,12,0.4)"
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        );
      })}
      {/* Phase 3b 集成时考虑加: HatchFill multiply overlay (Phase 2 sediment 蜡笔感) */}
      {/* Phase 3b 集成时考虑加: SvgFilter wobble (Camillo Visini feTurbulence, mimic 粘土 stop-motion) */}
    </g>
  );
}
