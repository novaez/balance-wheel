// useAnimation — GSAP timeline hook for v2 metaphor adapter animations.
// v2 spec ref: Phase 3 design.md §v2.C (Implementation stack B + C).
//
// Phase 3a foundation scaffold. Phase 3b adapter use 此 hook 拿 timeline
// instance, 用 timeline.to/from/add 编排 12 principles 动画:
//
//   import { gsap } from "gsap";
//   import { useAnimation } from "../useAnimation";
//
//   function CookieAdapter() {
//     const ref = useRef<SVGSVGElement>(null);
//     const tl = useAnimation();
//     useEffect(() => {
//       if (!ref.current) return;
//       const giant = ref.current.querySelector(".giant");
//       const cookie = ref.current.querySelector(".cookie");
//       // anticipation: 巨人张嘴 (back.in 反向准备)
//       tl.from(giant, { scale: 0.8, ease: "back.in(2)", duration: 0.3 });
//       // snap: 咬下 (overshoot)
//       tl.to(giant, { scale: 1.15, ease: "back.out(3)", duration: 0.15 });
//       // follow-through: 饼干震动
//       tl.to(cookie, { x: "+=2", yoyo: true, repeat: 5, duration: 0.05 });
//     }, []);
//     return <svg ref={ref}>...</svg>;
//   }
//
// 12 principles 兑现 cheat sheet (Alan Becker YouTube 系列):
//   #2 anticipation:    ease "back.in(N)" 反向准备
//   #5 follow-through:  yoyo + repeat 振荡 / overshoot easing
//   #6 slow in/out:     ease "power2.inOut" 或 "power3.inOut"
//   #7 arcs:            motionPath plugin (gsap-trial / paid) 或 manual bezier
//   #9 timing:          tl.add(delay), tl.set(); 用 stagger 给多元素错开
//   #12 appeal:         character reaction 加 tl.to(face/eyes/mouth)
//
// design.md §v2.C: Implementation stack B = hand-coded GSAP + SVG primitives +
// 12 animation principles 手 craft.

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

/**
 * 提供 GSAP timeline instance. mount 时 create, unmount 时 kill (cleanup).
 *
 * Phase 3a foundation scaffold. Phase 3b adapter use:
 *   const tl = useAnimation();
 *   useEffect(() => { tl.to(...).to(...); }, []);
 */
export function useAnimation(): gsap.core.Timeline {
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  if (timelineRef.current === null) {
    timelineRef.current = gsap.timeline();
  }

  useEffect(() => {
    const tl = timelineRef.current;
    return () => {
      tl?.kill();
    };
  }, []);

  return timelineRef.current;
}
