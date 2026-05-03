"use client";

import { useEffect, useState, useCallback } from "react";

// 8 dimensions, clockwise starting from 12 o'clock.
const DIMENSIONS = [
  { name: "家庭/朋友", color: "#ef4444" }, // red-500
  { name: "另一半/爱情", color: "#f97316" }, // orange-500
  { name: "娱乐与休闲", color: "#f59e0b" }, // amber-500
  { name: "健康", color: "#22c55e" }, // green-500
  { name: "财富", color: "#06b6d4" }, // cyan-500
  { name: "个人成长", color: "#3b82f6" }, // blue-500
  { name: "环境", color: "#a855f7" }, // purple-500
  { name: "职业", color: "#ec4899" }, // pink-500
] as const;

const STORAGE_KEY = "balance-wheel-current";
const DEFAULT_SCORE = 5;
const MIN_SCORE = 1;
const MAX_SCORE = 10;

type Scores = number[]; // length 8, each 1..10 integer

function defaultScores(): Scores {
  return DIMENSIONS.map(() => DEFAULT_SCORE);
}

function loadScores(): Scores {
  if (typeof window === "undefined") return defaultScores();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultScores();
    const parsed = JSON.parse(raw) as { scores?: unknown };
    if (!Array.isArray(parsed.scores) || parsed.scores.length !== DIMENSIONS.length) {
      return defaultScores();
    }
    const cleaned = parsed.scores.map((v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return DEFAULT_SCORE;
      const i = Math.round(n);
      return Math.min(MAX_SCORE, Math.max(MIN_SCORE, i));
    });
    return cleaned;
  } catch {
    return defaultScores();
  }
}

function saveScores(scores: Scores) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ scores, updatedAt: new Date().toISOString() })
    );
  } catch {
    // ignore quota / privacy mode errors
  }
}

// Build an SVG path for one sector of the wheel.
// Wheel center is (0,0). Sector i covers angles
//   start = -90 + i * 45  (degrees, clockwise from 12 o'clock)
//   end   = start + 45
// Radius = score / 10 * MAX_RADIUS, but with a small floor so score=1 still shows.
const MAX_RADIUS = 160;
const MIN_VISIBLE_RATIO = 0.12;

function sectorPath(index: number, score: number): string {
  const start = -90 + index * 45;
  const end = start + 45;
  const ratio = MIN_VISIBLE_RATIO + (score / MAX_SCORE) * (1 - MIN_VISIBLE_RATIO);
  const r = MAX_RADIUS * ratio;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = Math.cos(toRad(start)) * r;
  const y1 = Math.sin(toRad(start)) * r;
  const x2 = Math.cos(toRad(end)) * r;
  const y2 = Math.sin(toRad(end)) * r;

  // 45deg < 180, so largeArc = 0, sweep = 1 (clockwise in SVG y-down)
  return `M 0 0 L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r.toFixed(3)} ${r.toFixed(
    3
  )} 0 0 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
}

// Reference outline at full radius — a subtle ring so users see the "perfect circle" target.
function outlineCircle(): React.ReactElement {
  return (
    <circle
      cx={0}
      cy={0}
      r={MAX_RADIUS}
      fill="none"
      stroke="#e4e4e7" // zinc-200
      strokeWidth={1}
      strokeDasharray="2 4"
    />
  );
}

export default function Home() {
  const [scores, setScores] = useState<Scores>(defaultScores);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    setScores(loadScores());
    setHydrated(true);
  }, []);

  // Persist whenever scores change, but only after hydration.
  useEffect(() => {
    if (!hydrated) return;
    saveScores(scores);
  }, [scores, hydrated]);

  const handleChange = useCallback((index: number, value: number) => {
    setScores((prev) => {
      if (prev[index] === value) return prev;
      const next = prev.slice();
      next[index] = value;
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen w-full bg-zinc-50 text-zinc-900 font-sans">
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 md:flex-row md:items-start md:gap-12 md:py-16">
        {/* Left: wheel */}
        <section className="flex w-full flex-col items-center md:sticky md:top-10 md:w-1/2">
          <h2 className="mb-6 self-start text-sm font-medium tracking-wide text-zinc-500">
            你的车轮
          </h2>
          <div className="w-full max-w-[420px]">
            <svg
              viewBox={`${-MAX_RADIUS - 10} ${-MAX_RADIUS - 10} ${(MAX_RADIUS + 10) * 2} ${
                (MAX_RADIUS + 10) * 2
              }`}
              className="h-auto w-full"
              role="img"
              aria-label="平衡轮"
            >
              {outlineCircle()}
              {DIMENSIONS.map((dim, i) => (
                <path
                  key={dim.name}
                  d={sectorPath(i, scores[i] ?? DEFAULT_SCORE)}
                  fill={dim.color}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              ))}
              {/* center dot */}
              <circle cx={0} cy={0} r={2.5} fill="#27272a" />
            </svg>
          </div>
        </section>

        {/* Right: sliders */}
        <section className="w-full md:w-1/2">
          <header className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              平衡轮自评
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              给 8 个生活维度各打 1 - 10 分。拖动滑块，左侧的轮子会实时变形。
            </p>
          </header>

          <ul className="flex flex-col gap-5">
            {DIMENSIONS.map((dim, i) => {
              const value = scores[i] ?? DEFAULT_SCORE;
              return (
                <li key={dim.name} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <label
                      htmlFor={`slider-${i}`}
                      className="flex items-center gap-2 text-sm font-medium text-zinc-700"
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: dim.color }}
                        aria-hidden
                      />
                      {dim.name}
                    </label>
                    <span className="tabular-nums text-sm font-semibold text-zinc-900">
                      {value}
                    </span>
                  </div>
                  <input
                    id={`slider-${i}`}
                    type="range"
                    min={MIN_SCORE}
                    max={MAX_SCORE}
                    step={1}
                    value={value}
                    onChange={(e) => handleChange(i, Number(e.target.value))}
                    onInput={(e) =>
                      handleChange(i, Number((e.target as HTMLInputElement).value))
                    }
                    className="w-full accent-zinc-900 h-1 appearance-none cursor-pointer"
                    style={{ touchAction: "pan-y" }}
                    aria-label={`${dim.name} 评分`}
                    aria-valuemin={MIN_SCORE}
                    aria-valuemax={MAX_SCORE}
                    aria-valuenow={value}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
