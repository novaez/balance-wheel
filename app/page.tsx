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

const STORAGE_KEY = "wheel-of-life-current";
// 2026-05-08 改名（balance-wheel → wheel-of-life）后保留向后读，让早期用户的
// localStorage 数据不丢；下次 saveState 自然落到新 key 上，老 key 留作 stale
// 不主动清理（用户清浏览器数据时一并清掉即可）。
const LEGACY_STORAGE_KEY = "balance-wheel-current";
const DEFAULT_SCORE = 0;
// 1st person 改造：圆心 = 0、外缘 = 10。Phase 1 曾把下限设到 1（避免滑块滑到底
// 整块色扇消失带来的"我的健康一无所有"误读）；Phase 1.5 因为顶部 framing 已
// 显式锚 "圆心 = 0"，0 是产品语义里合法的回答（"完全失重 / 完全空"），下限放
// 开到 0；wire-compatibility：旧数据里 1-10 的整数继续被读、被显示，没有迁移成本。
const MIN_SCORE = 0;
const MAX_SCORE = 10;
const PRESENCE_MAX_LEN = 240;
const COMMITMENT_MAX_LEN = 80;
const CAPTION_MAX_LEN = 80;

type Scores = number[]; // length 8, each 0..10 integer
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
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
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
// Radius = score / 10 * MAX_RADIUS, with a small floor for non-zero scores so
// even score=1 reads as a visible color slice. Score=0 collapses to the
// center (no slice) — Phase 1.5 lets users say "圆心 = 0" honestly.
const MAX_RADIUS = 160;
const MIN_VISIBLE_RATIO = 0.12;

function sectorRadius(score: number): number {
  if (score <= 0) return 0;
  return MAX_RADIUS * (MIN_VISIBLE_RATIO + (score / MAX_SCORE) * (1 - MIN_VISIBLE_RATIO));
}

function sectorPath(index: number, score: number): string {
  const start = -90 + index * 45;
  const end = start + 45;
  const r = sectorRadius(score);
  if (r <= 0) {
    // Sector collapsed to a point — render an invisible degenerate path so
    // React's keyed list stays stable and stroke-based animations don't error.
    return `M 0 0 Z`;
  }

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
// Eval-mode internal phases. 圆桌 #3 4-阶段框架的数字折叠：
//   input    — user × 8 次 press-preview-release（主动）
//   connect  — 全轮 outline 一次性自动连线（动画 reveal，~1.2s）
//   shape    — 整轮 bob + 形状显现（动画 reveal，~1.2s）
//   ready    — 静置态，"让它跑一跑"按钮 fade-rise 出现，接 Stage 3
type EvalPhase = "input" | "connect" | "shape" | "ready";

// Center-press 起点判定：pointer 必须落在 wheel 中心 1/3 半径区域才进入 press
// state。这是 1st person 物理隐喻的硬约束（"我从中心往外伸展"）——避免边缘
// 误触把范式偷偷退回 3rd person scrubbing。圆桌 #3 赵博士的"directional intent"。
const CENTER_PRESS_RADIUS = MAX_RADIUS / 3;

// Map distance-from-center to a 0-10 score with continuous interior, integer
// display. Distance > MAX_RADIUS clamps to 10; distance ≤ 0 clamps to 0.
function distanceToScore(distance: number): number {
  const raw = (distance / MAX_RADIUS) * MAX_SCORE;
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, Math.round(raw)));
}

// Angle in screen coords (atan2 with svg y-down): convert to wheel sector
// index 0..7 (clockwise from 12 o'clock).
function angleToSectorIndex(x: number, y: number): number {
  // atan2 returns radians in (-PI, PI], 0 at +x axis, +PI/2 at +y (screen down).
  // We want 0 at -y axis (12 o'clock), increasing clockwise.
  let deg = (Math.atan2(y, x) * 180) / Math.PI; // -180..180, 0=right
  deg = deg + 90; // 0 at top (12 o'clock)
  if (deg < 0) deg += 360;
  if (deg >= 360) deg -= 360;
  return Math.floor(deg / SECTOR_DEG) % 8;
}

// Press state during press-preview-release. sectorIndex stays locked once the
// first significant move out of the center disambiguates which direction the
// user is pushing — prevents jitter across sector boundaries from re-targeting.
type Pressing = {
  sectorIndex: number | null; // null = pointer is in center, direction undecided
  value: number; // 0..10 integer, what would commit if release now
} | null;

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
  // Phase 1.5 — Stage 2 1st person 交互状态
  const [evalPhase, setEvalPhase] = useState<EvalPhase>("input");
  // touched[i] = 用户已经亲手按过这个扇区一次（首次进入时全 false；进 ready
  // 后才 reveal）。用 touched 而不是 score>0 是因为 score=0 是合法的回答——
  // user 故意把某个维度推到中心代表"完全空"。
  const [touched, setTouched] = useState<boolean[]>(() =>
    DIMENSIONS.map(() => false)
  );
  const [pressing, setPressing] = useState<Pressing>(null);
  const [a11yOpen, setA11yOpen] = useState(false);
  const wheelSvgRef = useRef<SVGSVGElement | null>(null);
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

  // Phase 1.5 — 8 个维度全都 touched 时，自动从 input 推进到 connect → shape → ready。
  // 不依赖按钮，因为最后一次 release 本身就是过渡 affordance。
  useEffect(() => {
    if (mode !== "eval") return;
    if (evalPhase !== "input") return;
    if (touched.every((t) => t)) {
      // 给最后一次 release 视觉沉淀一拍，再触发 reveal 序列
      const t1 = window.setTimeout(() => setEvalPhase("connect"), 600);
      return () => window.clearTimeout(t1);
    }
  }, [touched, evalPhase, mode]);

  useEffect(() => {
    if (mode !== "eval") return;
    if (evalPhase === "connect") {
      // outline 连线动画 ~1.2s，结束后进 shape
      const t = window.setTimeout(() => setEvalPhase("shape"), 1200);
      return () => window.clearTimeout(t);
    }
    if (evalPhase === "shape") {
      // 整轮 bob ~1.2s，结束后 ready（按钮 fade-rise）
      const t = window.setTimeout(() => setEvalPhase("ready"), 1200);
      return () => window.clearTimeout(t);
    }
  }, [evalPhase, mode]);

  // ---- 1st person press-preview-release handlers ----
  // 设计决策（圆桌 #3 + 上游约束）：
  //   - 起点 (pointerdown) 必须落在 wheel 中心 1/3 半径以内才进入 press state。
  //     这是 1st person 物理隐喻——"我在中心向外伸展"。边缘 down 不响应（不是
  //     bug，是 affordance：把范式锚死在中心）。
  //   - sectorIndex 在第一次显著移动出中心后锁定，避免 jitter 在扇区边界来回切。
  //   - 距离映射为 score 是连续的；显示数字是 round 到整数（粒度内部连续，显示整数）。
  //   - 时长由 user 自决（无 timer）；松开 commit。

  const getSvgPoint = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = wheelSvgRef.current;
      if (!svg) return null;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const local = pt.matrixTransform(ctm.inverse());
      return { x: local.x, y: local.y };
    },
    []
  );

  const onWheelPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (mode !== "eval") return;
      if (evalPhase !== "input") return;
      const local = getSvgPoint(e.clientX, e.clientY);
      if (!local) return;
      const dist = Math.hypot(local.x, local.y);
      if (dist > CENTER_PRESS_RADIUS) {
        // 边缘点击不响应——保留 1st person 锚点；如果用户发现"按外面没反应"，
        // 自然会把手指挪到中间（这一动作本身就是 frame 提示）。
        return;
      }
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // some browsers reject capture on synthetic events; safe to ignore
      }
      setPressing({ sectorIndex: null, value: 0 });
    },
    [mode, evalPhase, getSvgPoint]
  );

  const onWheelPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!pressing) return;
      const local = getSvgPoint(e.clientX, e.clientY);
      if (!local) return;
      const dist = Math.hypot(local.x, local.y);
      const value = distanceToScore(dist);
      // 第一次离开中心 ~10px 时锁定方向；之后即便 finger 摇摆也不再换扇区。
      let nextIndex = pressing.sectorIndex;
      if (nextIndex == null && dist > 10) {
        nextIndex = angleToSectorIndex(local.x, local.y);
      }
      setPressing({ sectorIndex: nextIndex, value });
    },
    [pressing, getSvgPoint]
  );

  const commitPress = useCallback(() => {
    if (!pressing) return;
    const idx = pressing.sectorIndex;
    if (idx == null) {
      // user 没移出中心就松手——视为取消（不计入 touched）
      setPressing(null);
      return;
    }
    setScores((prev) => {
      const next = prev.slice();
      next[idx] = pressing.value;
      return next;
    });
    setTouched((prev) => {
      if (prev[idx]) return prev;
      const next = prev.slice();
      next[idx] = true;
      return next;
    });
    setPressing(null);
  }, [pressing]);

  const onWheelPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!pressing) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      commitPress();
    },
    [pressing, commitPress]
  );

  const onWheelPointerCancel = useCallback(() => {
    // 系统取消（滑出窗口 / 接电话等）：当前预览值丢弃，不计入 touched。
    setPressing(null);
  }, []);

  // ---- a11y fallback slider ----
  const handleSliderChange = useCallback((index: number, value: number) => {
    setScores((prev) => {
      if (prev[index] === value) return prev;
      const next = prev.slice();
      next[index] = value;
      return next;
    });
    setTouched((prev) => {
      if (prev[index]) return prev;
      const next = prev.slice();
      next[index] = true;
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
    setEvalPhase("input");
    setTouched(DIMENSIONS.map(() => false));
    setPressing(null);
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
  // Phase 1.5 — eval/shape 阶段的"整轮 bob 形状显现"：用 CSS class 触发一次性
  // bob 动画，而不是用 computeBob（那个跟跑车物理耦合，不适合 reveal 时刻）。
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

  // 渲染时为每个扇区准备"实际显示的 score"——press 中的扇区用 preview value
  // 替代已存的 score，松手才回落到真实 scores[i]。
  const displayScores: Scores = scores.map((s, i) => {
    if (pressing && pressing.sectorIndex === i) return pressing.value;
    // 未 touched 的扇区在 input 阶段不展示（避免 "5 分默认" 的暗示——让用户
    // 真的从 0 开始 reach out）。
    if (mode === "eval" && evalPhase === "input" && !touched[i]) return 0;
    return s;
  });

  // 8 sector tips for the connect-phase outline polygon. 用 sector 中线半径
  // 取尖 (而不是 sector 的边角) — 视觉上是"把每个方向你伸到了哪连起来"，
  // 跟纸质 wheel of life "连线" 步骤的语义一致。
  const polygonPoints = displayScores
    .map((s, i) => {
      const r = sectorRadius(s);
      const angle = -90 + i * SECTOR_DEG + SECTOR_DEG / 2;
      const rad = (angle * Math.PI) / 180;
      return `${(Math.cos(rad) * r).toFixed(2)},${(Math.sin(rad) * r).toFixed(2)}`;
    })
    .join(" ");

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
                aria-label="生命之轮快照"
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
                wheel of life
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
            {isEval ? "我这辆车" : "我这辆车"}
          </h2>
          {/* Wheel SVG — Phase 1.5 装上 pointer 事件做 1st person 推扇区。
              touch-action: none 阻止 mobile 默认 pull-to-refresh / page scroll
              在 wheel 区域上拦截 pointer move（关键 mobile fix）。 */}
          <div className="w-full max-w-[340px] md:max-w-[440px]">
            <svg
              ref={wheelSvgRef}
              viewBox={`${vbox.x} ${vbox.y} ${vbox.w} ${vbox.h}`}
              className={[
                "h-auto w-full",
                isEval ? "select-none" : "",
                isEval && evalPhase === "shape" ? "wheel-shape-bob" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={isEval ? { touchAction: "none" } : undefined}
              role="img"
              aria-label="生命之轮"
              onPointerDown={isEval ? onWheelPointerDown : undefined}
              onPointerMove={isEval ? onWheelPointerMove : undefined}
              onPointerUp={isEval ? onWheelPointerUp : undefined}
              onPointerCancel={isEval ? onWheelPointerCancel : undefined}
              onPointerLeave={isEval ? onWheelPointerCancel : undefined}
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
                    // Eval input 阶段：未 touched 的标签字号弱化（dim），
                    // 已 touched 的标签升到正常色——视觉上是"我经过的方向亮起来"。
                    const dimUntouched =
                      isEval && evalPhase === "input" && !touched[i];
                    return (
                      <text
                        key={`label-${dim.name}`}
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="14"
                        fill={dim.color}
                        opacity={dimUntouched ? 0.45 : 1}
                        fontWeight={isPulsing ? 700 : 400}
                        style={{ transition: "font-weight 0.5s, opacity 0.4s" }}
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
                      d={sectorPath(i, displayScores[i])}
                      fill={dim.color}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                      // Press preview 视觉强度（克制原则裁判）：
                      // 当前正在 press 的扇区只调 opacity（subtle scale lift via
                      // CSS），不加 glow / color shift / 复杂 motion。其它扇区
                      // 略 fade 让被推的方向自然成为视觉焦点。
                      opacity={
                        pressing != null
                          ? pressing.sectorIndex === i
                            ? 1
                            : 0.55
                          : 1
                      }
                      className={[
                        lowestSet?.has(i) ? "pulse-sector" : "",
                        pressing && pressing.sectorIndex === i
                          ? "press-active-sector"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined}
                      style={{ transition: "opacity 0.2s" }}
                    />
                  ))}

                  {/* Phase 1.5 connect 阶段：8 个 sector 尖端的 polygon 连线。
                      stroke-dasharray 动画从 "全是 gap" 渐变到 "全连"，1.2s 走完。
                      shape / ready 阶段持续显示静态 polygon。 */}
                  {isEval && evalPhase !== "input" && (
                    <polygon
                      points={polygonPoints}
                      fill="none"
                      stroke="#27272a"
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                      className={
                        evalPhase === "connect" ? "outline-connect" : undefined
                      }
                      opacity={evalPhase === "connect" ? 1 : 0.5}
                      style={{ transition: "opacity 0.4s" }}
                    />
                  )}

                  {/* center dot */}
                  <circle cx={0} cy={0} r={2.5} fill="#27272a" />

                  {/* Phase 1.5 input 阶段中央 hint 圆圈 — 标记"中心 = 0"
                      的 framing 锚点。仅在 user 还没开始 press 时显示，press
                      期间隐藏避免干扰。 */}
                  {isEval &&
                    evalPhase === "input" &&
                    !pressing &&
                    touched.every((t) => !t) && (
                      <circle
                        cx={0}
                        cy={0}
                        r={CENTER_PRESS_RADIUS}
                        fill="none"
                        stroke="#a1a1aa"
                        strokeWidth={1}
                        strokeDasharray="3 5"
                        opacity={0.5}
                        className="center-hint-pulse"
                      />
                    )}
                </g>
              </g>

              {/* Press preview 数字浮现：实时显示当前预览的 score 整数。
                  位置在被 press 扇区的中线略偏外缘（既不挡视线又跟着方向走）。
                  挂在最外层 g (无 rotate)，因为这时 rotation=0 反正不影响。 */}
              {pressing && pressing.sectorIndex != null && (
                <PreviewNumber
                  sectorIndex={pressing.sectorIndex}
                  value={pressing.value}
                  bob={bob}
                />
              )}

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

        {/* Right: framing / running / reflect / presence */}
        <section className="w-full md:w-1/2">
          {isEval ? (
            <>
              <header className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                  生命之轮
                </h1>
                {/* Phase 1.5 — 入口 framing block。12-30 字，圆心-外缘锚点 +
                    马车隐喻。位置在 H1 之下、操作提示之上；字号比 H1 小、比
                    操作提示略大；中性色不抢 wheel 视觉。 */}
                <p className="mt-3 text-base leading-relaxed text-zinc-600">
                  圆心 = 0，外缘 = 10。看你人生这辆车此刻的形状，颠不颠。
                </p>
              </header>

              {/* 操作提示 — 跟 framing 区分开（一个是"为什么"，一个是"怎么做"）。
                  随 evalPhase 变文案：input 期间提示如何 press；touched 全满后
                  reveal 阶段切到"看到你的车"叙事。 */}
              <div className="mb-8 min-h-[3rem]">
                {evalPhase === "input" && (
                  <p
                    key="hint-input"
                    className="text-sm leading-relaxed text-zinc-500"
                  >
                    {touched.every((t) => !t)
                      ? "把手指按在轮子中心，朝 8 个方向各推到你此刻感觉到的程度。松开就定。"
                      : `${touched.filter(Boolean).length} / 8 — 继续推完剩下的方向。`}
                  </p>
                )}
                {evalPhase === "connect" && (
                  <p
                    key="hint-connect"
                    className="fade-rise text-sm leading-relaxed text-zinc-500"
                  >
                    把你伸到的位置连起来，看见你的车轮。
                  </p>
                )}
                {evalPhase === "shape" && (
                  <p
                    key="hint-shape"
                    className="fade-rise text-sm leading-relaxed text-zinc-500"
                  >
                    这是你这辆车此刻的形状。
                  </p>
                )}
                {evalPhase === "ready" && (
                  <p
                    key="hint-ready"
                    className="fade-rise text-sm leading-relaxed text-zinc-500"
                  >
                    准备好了——让它跑一程，看看颠不颠。
                  </p>
                )}
              </div>

              {evalPhase === "ready" && (
                <button
                  type="button"
                  onClick={startRide}
                  className="fade-rise w-full rounded-full bg-zinc-900 px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                >
                  让它跑一跑 →
                </button>
              )}

              {/* a11y fallback — slider 折叠在 details 后。键盘 / screen reader
                  / 不便做 press-preview-release 手势的用户走这条路。
                  默认收起；展开后跟 Phase 1 一样的 8 滑块（min=0 max=10）。 */}
              <details
                className="mt-10 rounded-lg border border-zinc-200 bg-white/40"
                open={a11yOpen}
                onToggle={(e) =>
                  setA11yOpen((e.target as HTMLDetailsElement).open)
                }
              >
                <summary className="cursor-pointer list-none px-4 py-3 text-sm text-zinc-600 hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
                  无障碍模式 — 用滑块代替手势
                </summary>
                <ul className="flex flex-col gap-5 px-4 pb-5 pt-2">
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
                          onChange={(e) =>
                            handleSliderChange(i, Number(e.target.value))
                          }
                          onInput={(e) =>
                            handleSliderChange(
                              i,
                              Number((e.target as HTMLInputElement).value)
                            )
                          }
                          className="w-full accent-zinc-900 h-1 appearance-none cursor-pointer"
                          style={{ touchAction: "none" }}
                          aria-label={`${dim.name} 评分，0 到 10`}
                          aria-valuemin={MIN_SCORE}
                          aria-valuemax={MAX_SCORE}
                          aria-valuenow={value}
                        />
                      </li>
                    );
                  })}
                </ul>
              </details>
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

// Floating preview number for press-preview-release. Renders a number near the
// outer edge of the actively pressed sector so the user reads "I'm at 7" while
// the finger is still down. Position interpolates between center hint and
// outer edge based on the value, so the number tracks the finger.
function PreviewNumber({
  sectorIndex,
  value,
  bob,
}: {
  sectorIndex: number;
  value: number;
  bob: number;
}) {
  const angle = -90 + sectorIndex * SECTOR_DEG + SECTOR_DEG / 2;
  const rad = (angle * Math.PI) / 180;
  // 显示位置：扇区中线上、当前预览半径稍外一点（+18px），让数字浮在色块顶端
  // 而不是被色块盖住。
  const r = sectorRadius(value) + 18;
  const x = Math.cos(rad) * r;
  const y = Math.sin(rad) * r + bob;
  return (
    <g pointerEvents="none">
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="20"
        fontWeight={600}
        fill="#18181b"
        className="preview-number"
      >
        {value}
      </text>
    </g>
  );
}
