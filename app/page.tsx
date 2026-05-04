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
const PRESENCE_MAX_LEN = 240;
const COMMITMENT_MAX_LEN = 80;
const CAPTION_MAX_LEN = 80;

type Scores = number[]; // length 8, each 1..10 integer
type Presence = { text: string; at: string };
type Commitment = { text: string; at: string };

function defaultScores(): Scores {
  return DIMENSIONS.map(() => DEFAULT_SCORE);
}

type StoredState = {
  scores: Scores;
  presence: Presence | null;
  commitment: Commitment | null;
  caption: string;
};

function loadState(): StoredState {
  if (typeof window === "undefined") {
    return {
      scores: defaultScores(),
      presence: null,
      commitment: null,
      caption: "",
    };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw)
      return {
        scores: defaultScores(),
        presence: null,
        commitment: null,
        caption: "",
      };
    const parsed = JSON.parse(raw) as {
      scores?: unknown;
      presence?: unknown;
      commitment?: unknown;
      caption?: unknown;
    };
    // Scores
    let scores: Scores;
    if (
      !Array.isArray(parsed.scores) ||
      parsed.scores.length !== DIMENSIONS.length
    ) {
      scores = defaultScores();
    } else {
      scores = parsed.scores.map((v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return DEFAULT_SCORE;
        const i = Math.round(n);
        return Math.min(MAX_SCORE, Math.max(MIN_SCORE, i));
      });
    }
    // Presence (v2 field, may be absent on old data)
    let presence: Presence | null = null;
    const p = parsed.presence;
    if (p && typeof p === "object") {
      const pp = p as Record<string, unknown>;
      const text = typeof pp.text === "string" ? pp.text.trim() : "";
      const at = typeof pp.at === "string" ? pp.at : new Date().toISOString();
      if (text) presence = { text: text.slice(0, PRESENCE_MAX_LEN), at };
    }
    // Commitment (v1 had {dimension, text, createdAt}; v2 keeps text only).
    // Old `dimension` is ignored; old `createdAt` migrates to `at`.
    let commitment: Commitment | null = null;
    const c = parsed.commitment;
    if (c && typeof c === "object") {
      const cc = c as Record<string, unknown>;
      const text = typeof cc.text === "string" ? cc.text.trim() : "";
      const at =
        typeof cc.at === "string"
          ? cc.at
          : typeof cc.createdAt === "string"
          ? cc.createdAt
          : new Date().toISOString();
      if (text) commitment = { text: text.slice(0, COMMITMENT_MAX_LEN), at };
    }
    // Caption (v3 field). Old data without it loads as empty string.
    const caption =
      typeof parsed.caption === "string"
        ? parsed.caption.slice(0, CAPTION_MAX_LEN)
        : "";
    return { scores, presence, commitment, caption };
  } catch {
    return {
      scores: defaultScores(),
      presence: null,
      commitment: null,
      caption: "",
    };
  }
}

function saveState(
  scores: Scores,
  presence: Presence | null,
  commitment: Commitment | null,
  caption: string
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        scores,
        presence,
        commitment,
        caption,
        updatedAt: new Date().toISOString(),
      })
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

// Reference outline at exactly MAX_RADIUS — a 10-score sector touches it
// (that's what "10 / 满分" means). Visibility under partial scores comes
// from stroke depth (zinc-400 dashed on a near-white background), not from
// physical distance from the wheel.
function outlineCircle(): React.ReactElement {
  return (
    <circle
      cx={0}
      cy={0}
      r={MAX_RADIUS}
      fill="none"
      stroke="#a1a1aa" // zinc-400
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

// Eval-mode viewBox is the original square; post-eval modes extend downward
// for the ground line + bob excursion, and outward horizontally to make room
// for the 8 dimension labels that orbit the wheel.
const VBOX_PAD = 20;
const VBOX_RUN_EXTRA = 160;
const VBOX_LABEL_PAD = 56;
const LABEL_RADIUS = MAX_RADIUS + 24;
const GROUND_Y = MAX_RADIUS + 6;
const TICK_SPACING = 30;
const TICK_COUNT = 14;

const VBOX_EVAL = {
  x: -MAX_RADIUS - VBOX_LABEL_PAD,
  y: -MAX_RADIUS - VBOX_PAD,
  w: (MAX_RADIUS + VBOX_LABEL_PAD) * 2,
  h: (MAX_RADIUS + VBOX_PAD) * 2,
};
const VBOX_RUN = {
  x: -MAX_RADIUS - VBOX_LABEL_PAD,
  y: -MAX_RADIUS - VBOX_PAD,
  w: (MAX_RADIUS + VBOX_LABEL_PAD) * 2,
  h: VBOX_EVAL.h + VBOX_RUN_EXTRA,
};

type Mode = "eval" | "running" | "reflect" | "presence" | "done";
type PresencePhase = "input" | "witnessed";

export default function Home() {
  const [scores, setScores] = useState<Scores>(defaultScores);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [commitment, setCommitment] = useState<Commitment | null>(null);
  // Stage 6 — caption is the user-editable line on the souvenir card. Lives
  // alongside presence/commit in localStorage but is reset on each new
  // presence cycle so each lap around the arc gets a fresh card line.
  const [caption, setCaption] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<Mode>("eval");
  const [progress, setProgress] = useState(0);
  const [runId, setRunId] = useState(0);
  // Stage 5 v2 transient state. presenceDraft is what the textarea holds while
  // the user types; presencePhase gates whether the witness affordance has
  // fired (input → witnessed). commitDraft is the optional follow-up.
  const [presenceDraft, setPresenceDraft] = useState("");
  const [presencePhase, setPresencePhase] = useState<PresencePhase>("input");
  const [commitDraft, setCommitDraft] = useState("");
  const rafRef = useRef<number | null>(null);

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    const s = loadState();
    setScores(s.scores);
    setPresence(s.presence);
    setCommitment(s.commitment);
    setCaption(s.caption);
    setHydrated(true);
  }, []);

  // Re-hydrate on bfcache restore (browser back/forward). Without this, a
  // restored page renders with React state captured at navigation time —
  // user would see default scores until a manual refresh.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        const s = loadState();
        setScores(s.scores);
        setPresence(s.presence);
        setCommitment(s.commitment);
        setCaption(s.caption);
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // Persist whenever any persisted field changes, but only after hydration.
  useEffect(() => {
    if (!hydrated) return;
    saveState(scores, presence, commitment, caption);
  }, [scores, presence, commitment, caption, hydrated]);

  // Drive a single 5-second ride; rAF self-stops at progress=1 so the wheel
  // rests at its final pose, then auto-advances to the reflect stage so the
  // disturbance / question can land without an interrupting button click.
  useEffect(() => {
    if (mode !== "running") return;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const t = Math.min(now - startedAt, RUN_DURATION_MS) / RUN_DURATION_MS;
      setProgress(easeInOutQuad(t));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setMode("reflect");
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

  const startRide = useCallback(() => {
    setProgress(0);
    setRunId((id) => id + 1);
    setMode("running");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handleBack = useCallback(() => {
    setMode("eval");
    setProgress(0);
  }, []);

  // Fresh entry into Stage 5 v2 from reflect: clear any prior drafts. The
  // brief is explicit — re-entering presence should start blank, never edit
  // prior text. Persisted presence/commitment in state still surface in done.
  const handleEnterPresence = useCallback(() => {
    setPresenceDraft("");
    setCommitDraft("");
    setPresencePhase("input");
    // Each new lap through presence gets a blank caption — the card line is
    // bound to the freshly-witnessed presence text, not carried over.
    setCaption("");
    setMode("presence");
  }, []);

  // Witness affordance — fires when the user explicitly says "我说完了" or
  // when the textarea blurs. Idle pause (debounce) was tried and removed:
  // long thoughts naturally include >1.5s pauses, which falsely triggered
  // the flip mid-sentence. User-asserted action is the right signal.
  const witnessNow = useCallback((rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    setPresence({ text: text.slice(0, PRESENCE_MAX_LEN), at: new Date().toISOString() });
    setPresencePhase("witnessed");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handlePresenceChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPresenceDraft(e.target.value);
    },
    []
  );

  const handlePresenceBlur = useCallback(() => {
    witnessNow(presenceDraft);
  }, [presenceDraft, witnessNow]);

  const handleWitnessClick = useCallback(() => {
    witnessNow(presenceDraft);
  }, [presenceDraft, witnessNow]);

  const handleFinalize = useCallback(() => {
    const trimmedCommit = commitDraft.trim();
    if (trimmedCommit) {
      setCommitment({
        text: trimmedCommit.slice(0, COMMITMENT_MAX_LEN),
        at: new Date().toISOString(),
      });
    } else {
      setCommitment(null);
    }
    setMode("done");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [commitDraft]);

  const isEval = mode === "eval";
  const isRunning = mode === "running";
  const isReflect = mode === "reflect";
  const isPresence = mode === "presence";
  const isDone = mode === "done";
  // Keep the extended viewBox + ground line through everything past eval so
  // the wheel rests on the same ground it just rolled across — no layout snap.
  const showGround = !isEval;
  const vbox = showGround ? VBOX_RUN : VBOX_EVAL;
  const rotation = isRunning ? progress * RUN_TOTAL_ROTATION_DEG : 0;
  // In reflect/presence/done, rotation is 0 (= 720 mod 360, same final
  // orientation), so computeBob gives the same resting offset the wheel had
  // at end-of-ride — no upward jolt at running→reflect transition.
  const bob = showGround ? computeBob(rotation, scores) : 0;
  const groundOffset = isRunning
    ? ((rotation * GROUND_PER_DEG) % TICK_SPACING + TICK_SPACING) % TICK_SPACING
    : 0;

  // Pulse only fires in reflect; once the user moves to presence/done, the
  // form is the focus, so the disturbance cue stops to avoid distraction.
  const minScore = scores.reduce((a, b) => (b < a ? b : a), MAX_SCORE);
  const lowestSet = isReflect
    ? new Set(scores.map((s, i) => (s === minScore ? i : -1)).filter((i) => i >= 0))
    : null;

  if (isDone && presence) {
    return (
      <div className="min-h-screen w-full bg-zinc-50 text-zinc-900 font-sans">
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-12">
          {/* Souvenir card — the only emotional outlet of the UI (圆桌 #1 #7).
              Single warm artifact: wheel snapshot + handwritten presence + soft
              commit + user-owned caption + watermark. Designed to be screenshot-
              shared as-is; no download / share APIs (privacy-first). */}
          <article
            className="fade-rise relative w-full overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-amber-50/40 via-white to-white px-7 py-9 shadow-md"
            style={{ animationDelay: "0.1s" }}
            aria-label="留印卡片"
          >
            <div className="flex flex-col items-center gap-6">
              {/* Mini wheel — clean snapshot, no ground / labels / bob. */}
              <svg
                viewBox={`${-MAX_RADIUS - VBOX_PAD} ${-MAX_RADIUS - VBOX_PAD} ${
                  (MAX_RADIUS + VBOX_PAD) * 2
                } ${(MAX_RADIUS + VBOX_PAD) * 2}`}
                className="h-auto w-full max-w-[200px]"
                role="img"
                aria-label="平衡轮快照"
              >
                <circle
                  cx={0}
                  cy={0}
                  r={MAX_RADIUS}
                  fill="none"
                  stroke="#e4e4e7"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                />
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
                <circle cx={0} cy={0} r={2.5} fill="#27272a" />
              </svg>

              {/* Presence — main voice, handwritten, large. */}
              <p className="font-zh-hand text-center text-3xl leading-snug text-zinc-900 md:text-4xl">
                {presence.text}
              </p>

              {/* Commitment — optional, sits under presence as a soft echo. */}
              {commitment && (
                <p className="font-zh-hand text-center text-xl leading-relaxed text-zinc-500 md:text-2xl">
                  — {commitment.text}
                </p>
              )}

              {/* Caption — user writes their own line. The empty input itself
                  is the invitation; on screenshot, only the typed text shows. */}
              <div className="w-full border-t border-dashed border-zinc-200 pt-5">
                <input
                  type="text"
                  value={caption}
                  onChange={(e) =>
                    setCaption(e.target.value.slice(0, CAPTION_MAX_LEN))
                  }
                  onBlur={() => {
                    // Mobile soft-keyboard dismiss leaves the page scrolled
                    // past the card; pull viewport back to the top after the
                    // keyboard collapse animation settles.
                    if (typeof window !== "undefined") {
                      setTimeout(() => {
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }, 100);
                    }
                  }}
                  placeholder="给自己写一句话…"
                  maxLength={CAPTION_MAX_LEN}
                  className="font-zh-hand w-full bg-transparent text-center text-xl leading-relaxed text-zinc-700 placeholder:text-zinc-300 focus:outline-none md:text-2xl"
                  aria-label="给自己写一句话"
                />
              </div>

              {/* Watermark — virality hook. Latin handwriting echoes the
                  Chinese script above; subtle but unmistakable. */}
              <p className="font-en-hand mt-1 text-sm tracking-wide text-zinc-400">
                balance-wheel
              </p>
            </div>
          </article>

          <p className="text-xs text-zinc-400">想分享，可以截屏发给在乎的人。</p>

          <button
            type="button"
            onClick={handleBack}
            className="text-sm text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-700 hover:underline"
          >
            回去调整车轮
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-zinc-50 text-zinc-900 font-sans">
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 pt-16 pb-10 md:flex-row md:items-start md:gap-12 md:py-16">
        {/* Left: wheel */}
        <section
          className={[
            "flex w-full flex-col items-center",
            "md:w-1/2 md:sticky md:top-10",
            isEval ? "sticky top-0 z-10 bg-zinc-50/95 pt-4 pb-2 backdrop-blur border-b border-zinc-200" : "",
            "md:bg-transparent md:pt-0 md:pb-0 md:backdrop-blur-none",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <h2 className="mb-6 self-start text-sm font-medium tracking-wide text-zinc-500">
            {isEval ? "你的车轮" : "我这辆车"}
          </h2>
          <div className="w-full max-w-[340px] md:max-w-[440px]">
            <svg
              viewBox={`${vbox.x} ${vbox.y} ${vbox.w} ${vbox.h}`}
              className="h-auto w-full"
              role="img"
              aria-label="平衡轮"
            >
              {/* Outline + labels — geometric annotations of the wheel,
                  share the bob translate so they sink with the wheel; both
                  stay outside the rotate group so running doesn't spin them. */}
              <g transform={`translate(0 ${bob.toFixed(3)})`}>
                {outlineCircle()}
                {!isRunning &&
                  DIMENSIONS.map((dim, i) => {
                    const angle = -90 + i * SECTOR_DEG + SECTOR_DEG / 2;
                    const rad = (angle * Math.PI) / 180;
                    const lx = Math.cos(rad) * LABEL_RADIUS;
                    const ly = Math.sin(rad) * LABEL_RADIUS;
                    const isPulsing = isReflect && lowestSet?.has(i);
                    return (
                      <text
                        key={`label-${dim.name}`}
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="14"
                        fill={dim.color}
                        fontWeight={isPulsing ? 700 : 400}
                        style={{ transition: "font-weight 0.5s" }}
                      >
                        {dim.name}
                      </text>
                    );
                  })}
              </g>

              <g transform={`translate(0 ${bob.toFixed(3)})`}>
                <g transform={`rotate(${rotation.toFixed(3)})`}>
                  {DIMENSIONS.map((dim, i) => (
                    <path
                      key={dim.name}
                      d={sectorPath(i, scores[i] ?? DEFAULT_SCORE)}
                      fill={dim.color}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                      className={lowestSet?.has(i) ? "pulse-sector" : undefined}
                    />
                  ))}
                  {/* center dot */}
                  <circle cx={0} cy={0} r={2.5} fill="#27272a" />
                </g>
              </g>

              {showGround && (
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

        {/* Right: sliders / running / reflect / presence / done */}
        <section className="w-full md:w-1/2">
          {isEval ? (
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
                        style={{ touchAction: "none" }}
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
                onClick={startRide}
                className="mt-10 w-full rounded-full bg-zinc-900 px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                让它跑一跑 →
              </button>
            </>
          ) : isRunning ? (
            <header>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                让它跑一跑
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                这是我现在的车。颠的地方，是我现在的失衡。
              </p>
            </header>
          ) : isReflect ? (
            <div className="flex flex-col gap-10 pt-2">
              <h1
                className="fade-rise text-3xl font-medium leading-snug tracking-tight text-zinc-900 md:text-4xl"
                style={{ animationDelay: "1.2s" }}
              >
                我这辆车，颠在哪？
              </h1>
              <div
                className="fade-rise flex flex-col gap-3"
                style={{ animationDelay: "2.4s" }}
              >
                <button
                  type="button"
                  onClick={handleEnterPresence}
                  className="rounded-full bg-zinc-900 px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                >
                  写下我此刻的感觉 →
                </button>
                <button
                  type="button"
                  onClick={startRide}
                  className="self-start text-sm text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-700 hover:underline"
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
          ) : isPresence ? (
            <div className="flex flex-col gap-8 pt-2">
              {/* Phase A — input. Prompt + textarea, no CTA. The user types
                   freely; debounce or blur triggers the witness flip. */}
              {presencePhase === "input" ? (
                <>
                  <p className="text-2xl font-medium leading-snug tracking-tight text-zinc-700 md:text-3xl">
                    看着这辆车，我此刻感觉到——
                  </p>
                  <textarea
                    value={presenceDraft}
                    onChange={handlePresenceChange}
                    onBlur={handlePresenceBlur}
                    autoFocus
                    rows={4}
                    maxLength={PRESENCE_MAX_LEN}
                    className="w-full resize-none border-none bg-transparent p-0 text-2xl font-light leading-relaxed text-zinc-900 placeholder:text-zinc-300 focus:outline-none md:text-3xl"
                    aria-label="我此刻感觉到"
                  />
                  {presenceDraft.trim() && (
                    <button
                      type="button"
                      onClick={handleWitnessClick}
                      className="fade-rise self-start text-sm text-zinc-700 underline-offset-4 transition-colors hover:text-zinc-900 hover:underline"
                    >
                      我说完了 →
                    </button>
                  )}
                </>
              ) : (
                <>
                  {/* Phase B — witnessed. The text "lifts" into a quiet,
                       larger statement; below it the optional commit and
                       the final CTA fade in after a beat. */}
                  <p className="witness text-2xl font-medium leading-relaxed tracking-tight text-zinc-900 md:text-3xl">
                    {presence?.text ?? presenceDraft}
                  </p>

                  <div
                    className="fade-rise flex flex-col gap-3"
                    style={{ animationDelay: "1.2s" }}
                  >
                    <label
                      htmlFor="commit-text"
                      className="text-sm leading-relaxed text-zinc-500"
                    >
                      如果你愿意，再写一行你想做的事。
                    </label>
                    <input
                      id="commit-text"
                      type="text"
                      value={commitDraft}
                      onChange={(e) => setCommitDraft(e.target.value)}
                      placeholder=""
                      maxLength={COMMITMENT_MAX_LEN}
                      className="w-full border-b border-zinc-200 bg-transparent py-2 text-base text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-900 focus:outline-none"
                    />
                  </div>

                  <div
                    className="fade-rise flex flex-col gap-3 pt-2"
                    style={{ animationDelay: "2.0s" }}
                  >
                    <button
                      type="button"
                      onClick={handleFinalize}
                      className="rounded-full bg-zinc-900 px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                    >
                      去看留印卡片 →
                    </button>
                    <button
                      type="button"
                      onClick={handleBack}
                      className="self-start text-sm text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-700 hover:underline"
                    >
                      回去调整车轮
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
