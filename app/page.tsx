"use client";

import { useEffect, useState, useCallback, useRef } from "react";

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

function sectorRadius(score: number): number {
  return MAX_RADIUS * (MIN_VISIBLE_RATIO + (score / MAX_SCORE) * (1 - MIN_VISIBLE_RATIO));
}

function sectorPath(index: number, score: number): string {
  const start = -90 + index * 45;
  const end = start + 45;
  const r = sectorRadius(score);

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

// Find the wheel outline's lowest point in screen-y for a given rotation.
// Each sector contributes (its arc's max screen-y) within its current angular
// range; boundary corners between sectors are captured by the endpoint sin
// values. The wheel drops by MAX_RADIUS - maxY so its lowest point sits on the
// ground line. This gives a smooth transition: as a tall sector's edge sweeps
// past 90°, the wheel rises immediately rather than waiting for the sector
// center to reach screen-bottom.
const SECTOR_DEG = 45;

function computeBob(rotation: number, scores: Scores): number {
  let maxY = 0;
  for (let i = 0; i < 8; i++) {
    const r = sectorRadius(scores[i] ?? DEFAULT_SCORE);
    const startScreen = -90 + i * SECTOR_DEG + rotation;
    const endScreen = startScreen + SECTOR_DEG;
    // sin peaks at 1 when angle = 90 + 360k. Does any such peak fall in [start, end]?
    const k = Math.ceil((startScreen - 90) / 360);
    const peakInRange = 90 + 360 * k <= endScreen;
    const maxSin = peakInRange
      ? 1
      : Math.max(
          Math.sin((startScreen * Math.PI) / 180),
          Math.sin((endScreen * Math.PI) / 180)
        );
    if (maxSin > 0) {
      const sectorMaxY = r * maxSin;
      if (sectorMaxY > maxY) maxY = sectorMaxY;
    }
  }
  return MAX_RADIUS - maxY;
}

// One trip: 2 full turns over 5s, ease-in-out so the ride starts gently,
// peaks in the middle, and glides to a stop. Final orientation matches start.
const RUN_DURATION_MS = 5000;
const RUN_TOTAL_ROTATION_DEG = 720;
const GROUND_PER_DEG = 2.5;

function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
}

// Eval-mode viewBox is the original square; running mode extends downward to make
// room for a ground line plus the bob excursion (up to ~MAX_RADIUS * (1-MIN_RATIO)).
const VBOX_PAD = 20;
const VBOX_RUN_EXTRA = 160;
const GROUND_Y = MAX_RADIUS + 6;
const TICK_SPACING = 30;
const TICK_COUNT = 14;

const VBOX_EVAL = {
  x: -MAX_RADIUS - VBOX_PAD,
  y: -MAX_RADIUS - VBOX_PAD,
  w: (MAX_RADIUS + VBOX_PAD) * 2,
  h: (MAX_RADIUS + VBOX_PAD) * 2,
};
const VBOX_RUN = {
  ...VBOX_EVAL,
  h: VBOX_EVAL.h + VBOX_RUN_EXTRA,
};

export default function Home() {
  const [scores, setScores] = useState<Scores>(defaultScores);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<"eval" | "running">("eval");
  const [progress, setProgress] = useState(0);
  const [runId, setRunId] = useState(0);
  const rafRef = useRef<number | null>(null);

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

  // Drive a single 5-second ride; rAF self-stops at progress=1 so the wheel
  // rests at its final pose. Bumping runId restarts the ride.
  useEffect(() => {
    if (mode !== "running") return;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const t = Math.min(now - startedAt, RUN_DURATION_MS) / RUN_DURATION_MS;
      setProgress(easeInOutQuad(t));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [mode, runId]);

  const handleChange = useCallback((index: number, value: number) => {
    setScores((prev) => {
      if (prev[index] === value) return prev;
      const next = prev.slice();
      next[index] = value;
      return next;
    });
  }, []);

  const handleStart = useCallback(() => {
    setProgress(0);
    setRunId((id) => id + 1);
    setMode("running");
  }, []);

  const handleRestart = useCallback(() => {
    setProgress(0);
    setRunId((id) => id + 1);
  }, []);

  const handleBack = useCallback(() => {
    setMode("eval");
    setProgress(0);
  }, []);

  const isRunning = mode === "running";
  const vbox = isRunning ? VBOX_RUN : VBOX_EVAL;
  const rotation = isRunning ? progress * RUN_TOTAL_ROTATION_DEG : 0;
  const bob = isRunning ? computeBob(rotation, scores) : 0;
  const groundOffset = isRunning
    ? ((rotation * GROUND_PER_DEG) % TICK_SPACING + TICK_SPACING) % TICK_SPACING
    : 0;

  return (
    <div className="min-h-screen w-full bg-zinc-50 text-zinc-900 font-sans">
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 md:flex-row md:items-start md:gap-12 md:py-16">
        {/* Left: wheel */}
        <section className="flex w-full flex-col items-center md:sticky md:top-10 md:w-1/2">
          <h2 className="mb-6 self-start text-sm font-medium tracking-wide text-zinc-500">
            {isRunning ? "我这辆车" : "你的车轮"}
          </h2>
          <div className="w-full max-w-[420px]">
            <svg
              viewBox={`${vbox.x} ${vbox.y} ${vbox.w} ${vbox.h}`}
              className="h-auto w-full"
              role="img"
              aria-label="平衡轮"
            >
              {!isRunning && outlineCircle()}

              <g
                transform={`translate(0 ${bob.toFixed(3)}) rotate(${rotation.toFixed(3)})`}
              >
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
              </g>

              {isRunning && (
                <g>
                  <line
                    x1={vbox.x + 4}
                    y1={GROUND_Y}
                    x2={vbox.x + vbox.w - 4}
                    y2={GROUND_Y}
                    stroke="#a1a1aa"
                    strokeWidth={1}
                  />
                  {Array.from({ length: TICK_COUNT }, (_, i) => {
                    const x = vbox.x + 4 + i * TICK_SPACING - groundOffset;
                    return (
                      <line
                        key={i}
                        x1={x}
                        y1={GROUND_Y + 2}
                        x2={x - 8}
                        y2={GROUND_Y + 12}
                        stroke="#d4d4d8"
                        strokeWidth={1}
                      />
                    );
                  })}
                </g>
              )}
            </svg>
          </div>
        </section>

        {/* Right: sliders OR running controls */}
        <section className="w-full md:w-1/2">
          {!isRunning ? (
            <>
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

              <button
                type="button"
                onClick={handleStart}
                className="mt-10 w-full rounded-full bg-zinc-900 px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                让我看看我的车
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-6">
              <header>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                  让它跑一跑
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                  这是我现在的车。颠的地方，是我现在的失衡。
                </p>
              </header>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="rounded-full bg-zinc-900 px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                >
                  再跑一次
                </button>
                <button
                  type="button"
                  onClick={handleBack}
                  className="self-start text-sm text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-700 hover:underline"
                >
                  回去调整
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
