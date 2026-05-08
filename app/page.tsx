"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// 8 dimensions, clockwise starting from 12 o'clock.
const DIMENSIONS = [
  // Phase 1.5j — palette C "warm/cool 交替" (1 暖 1 冷律动)
  // 邻接色对比最强; 维度↔颜色语义改动 liushu 已知拍板.
  { name: "家庭/朋友", color: "#ef4444" }, // 红 (暖)
  { name: "另一半/爱情", color: "#06b6d4" }, // 青 (冷)
  { name: "娱乐与休闲", color: "#f59e0b" }, // 琥珀 (暖)
  { name: "健康", color: "#3b82f6" }, // 蓝 (冷)
  { name: "财富", color: "#ec4899" }, // 粉 (暖)
  { name: "个人成长", color: "#10b981" }, // 翠绿 (冷)
  { name: "环境", color: "#f97316" }, // 橘 (暖)
  { name: "职业", color: "#a855f7" }, // 紫 (冷)
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

// Phase 1.5g — 手绘填色：奋笔疾书 hatching
// =========================================
// liushu oracle："框架是精确印好的纸 (boundary 不抖, 严格规整), 填色是手绘
// 涂出来的"。D' 方案 = N 条独立 <line> 段，每条角度 / 长度 / 位置 jitter，
// 模拟真人快速涂色的草图感：线条不齐 / 有交叉 / 有空隙 / 有粗细变化。
// clipPath 把溢出的部分裁掉 → 精确 boundary 在外层 stroke path 描出，内层
// hatching 自然落在 sector 内（边缘 stroke 被切到 boundary 上，类似真人涂
// 色超出格子被画框框住）。
//
// helpers (零依赖)：
//   mulberry32(seed) — 32-bit deterministic PRNG，[0,1)；React render 间稳定。
//   hashSeed(...nums) — 简单整数 mix → 32-bit seed。
//   jitterColor(hex, lightDelta) — 同色微 lightness 偏移（线性插值到白/黑）。

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(...nums: number[]): number {
  let h = 0x9e3779b9 | 0;
  for (const n of nums) {
    h ^= n | 0;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

// 同色微 lightness jitter。delta > 0 向白偏（变浅），delta < 0 向黑偏。
function jitterColor(hex: string, lightDelta: number): string {
  const { r, g, b } = hexToRgb(hex);
  if (lightDelta >= 0) {
    return rgbToHex(
      r + (255 - r) * lightDelta,
      g + (255 - g) * lightDelta,
      b + (255 - b) * lightDelta
    );
  } else {
    const k = 1 + lightDelta; // 0..1
    return rgbToHex(r * k, g * k, b * k);
  }
}

// 奋笔疾书 hatching 渲染。在扇区 bounding region 内 sample N 条短 stroke,
// clipPath 裁回扇区精确轮廓内。
//
// Phase 1.5g 关键：strokePatternScore 跟 displayScore 解耦。
//   - displayScore：决定"色块半径 r"——press 时随手指走 (preview value)。
//   - strokePatternScore：决定"stroke 数 N + seed"——press 时锁定到 MAX_SCORE,
//     避免 score 跨整数边界 reseed-resample 产生 stroke 数 / 位置 jitter。
//   非 press 时两者相等；press 时 stroke pattern 用满分密度，clipPath 按
//   preview 半径裁切，stroke 数 / 位置 / 走向稳定。
function ScribbleHatchingFill({
  sectorIndex,
  displayScore,
  strokePatternScore,
  color,
}: {
  sectorIndex: number;
  displayScore: number;
  strokePatternScore: number;
  color: string;
}): React.ReactElement | null {
  if (displayScore <= 0) return null;
  // 注意：r 用 strokePatternScore 算 stroke 总走向范围（press 时是满分半径），
  // clipPath 用 displayScore 把 stroke 裁到 preview 半径。这样 press 拖动时
  // stroke 数量 / 起点不变，只是被 clip 的"露出范围"在变。
  const r = sectorRadius(strokePatternScore);
  const start = -90 + sectorIndex * SECTOR_DEG;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const sectorMidDeg = start + SECTOR_DEG / 2;
  const baseStrokeDeg = sectorMidDeg + 70; // 跟扇区中线 ~70° 夹角
  // density: 满分 ~80 strokes (扇区面积大), 低分 ~22。N 由 strokePatternScore
  // 决定 → press 时是 80（满分密度），所以拖动半径不抖。
  const N = Math.max(22, Math.round(22 + strokePatternScore * 5.8));
  const rng = mulberry32(hashSeed(sectorIndex, 0xd2, N));
  const lines: React.ReactElement[] = [];
  for (let i = 0; i < N; i++) {
    // 起点：极坐标 sample（sqrt 让分布更均匀，按面积比例）
    const tR = Math.sqrt(rng());
    const r0 = tR * r * 0.95;
    const theta0Deg = start + rng() * SECTOR_DEG;
    const theta0 = toRad(theta0Deg);
    const x0 = Math.cos(theta0) * r0;
    const y0 = Math.sin(theta0) * r0;
    // stroke 方向：base 角度 ± 25° jitter（奋笔疾书时手不稳定）
    const strokeAngleDeg = baseStrokeDeg + (rng() - 0.5) * 50;
    const strokeAngle = toRad(strokeAngleDeg);
    // stroke 长度：短 stroke 居多（10-35），偶尔长（35-60）
    const len = 10 + rng() * (rng() > 0.7 ? 50 : 25);
    const half = len / 2;
    const x1 = x0 - Math.cos(strokeAngle) * half;
    const y1 = y0 - Math.sin(strokeAngle) * half;
    const x2 = x0 + Math.cos(strokeAngle) * half;
    const y2 = y0 + Math.sin(strokeAngle) * half;
    const sw = 1.0 + rng() * 1.6;
    const lightDelta = (rng() - 0.5) * 0.24;
    const strokeColor = jitterColor(color, lightDelta);
    const op = 0.5 + rng() * 0.35;
    lines.push(
      <line
        key={`scribble-${sectorIndex}-${i}`}
        x1={x1.toFixed(3)}
        y1={y1.toFixed(3)}
        x2={x2.toFixed(3)}
        y2={y2.toFixed(3)}
        stroke={strokeColor}
        strokeWidth={sw.toFixed(2)}
        strokeLinecap="round"
        opacity={op.toFixed(2)}
      />
    );
  }
  return <g>{lines}</g>;
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

// Phase 1.5c 试用版：press 起点放宽
// ----------------------------------
// 1.5b 之前：pointer 必须落在 wheel 中心 1/3 半径才进入 press（CENTER_PRESS_RADIUS
//   = MAX_RADIUS / 3）；圆桌 #3 设计延伸为"中心起 + 从内向外推"。
// 1.5c reframe：1st person essence 只指"操作发生在 wheel / 轮辐上"（vs 外部滑杆），
//   没特指中心起点 / 没特指方向。任意扇区任意 radius 都能起 press；preview 双向
//   跟手指走（向外 = 加分、向内 = 减分），松开 commit。
// 落 wheel 外（distance > MAX_RADIUS）—— 静默忽略（保持现行）。

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

// Press state during press-preview-release. Phase 1.5c 试用版：sectorIndex 在
// pointer down 那一刻由 down 点角度即时确定（atan2 → 0..7），press 期间不再
// 切换；preview value 跟手指距中心的距离实时双向更新。
type Pressing = {
  sectorIndex: number; // 0..7, locked at pointer down
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
  // Phase 1.5h fix #2 — commit 后让 PreviewNumber 保留 500ms 再消失，
  // 让 quick tap (down + 即 up，无 move) 也能看到数字浮现。
  const [commitFlash, setCommitFlash] = useState<{
    sectorIndex: number;
    value: number;
  } | null>(null);
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
  // Phase 1.5d fix #5 — 加 !pressing 守门：reveal 阶段被 re-press 打断回 input
  // 时，user 手指还按着，不能立即 600ms 就 advance；要等 release 后再算 timer。
  useEffect(() => {
    if (mode !== "eval") return;
    if (evalPhase !== "input") return;
    if (pressing) return;
    if (touched.every((t) => t)) {
      // 给最后一次 release 视觉沉淀一拍，再触发 reveal 序列
      const t1 = window.setTimeout(() => setEvalPhase("connect"), 600);
      return () => window.clearTimeout(t1);
    }
  }, [touched, evalPhase, mode, pressing]);

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

  // ---- 1st person press-preview-release handlers (Phase 1.5c 试用版) ----
  // 设计决策（圆桌 #3 essence + 1.5c reframe）：
  //   - "1st person" essence = 操作发生在 wheel / 轮辐上（vs 外部滑杆），不
  //     特指中心起点 / 不特指方向。
  //   - 起点：pointer down 落在 wheel 任何位置（≤ MAX_RADIUS）都进入 press state。
  //     落 wheel 外（distance > MAX_RADIUS）静默忽略。
  //   - sectorIndex 由 pointer down 那一刻角度即时确定（atan2 → 0..7），press
  //     期间不切换——即便手指划过相邻扇区也始终在 down 时锚定的扇区上 commit。
  //   - preview 双向跟手指：preview radius = clamp(|finger − center|, 0, MAX_RADIUS)；
  //     preview score = round(preview radius / MAX_RADIUS * 10)。落在已色块内
  //     = 调小，落在已色块外 = 调大。
  //   - 时长由 user 自决（无 timer）；松开 commit scores[sectorIndex] = preview score。
  //   - 已 commit 的扇区可以重新 press 改值（解圆桌 #3 之前的"调小困难"）。

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
      // Phase 1.5d fix #5 — reveal 阶段（connect/shape/ready）允许 re-press 打断
      // 动画回 input + preview。release 后 useEffect 会重新触发 connect → shape
      // → ready 序列。原来 evalPhase !== "input" 直接 return 让 user 在 reveal
      // 期间感觉"突然不能调了"。
      const local = getSvgPoint(e.clientX, e.clientY);
      if (!local) return;
      const dist = Math.hypot(local.x, local.y);
      if (dist > MAX_RADIUS) {
        // 落 wheel 外（满分圆之外）静默忽略——保持"操作在轮辐上"的 essence。
        return;
      }
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // some browsers reject capture on synthetic events; safe to ignore
      }
      // 如果当前在 reveal 阶段，重置回 input 中断动画。touched 不重置——已 commit
      // 的扇区保持已 commit 状态，只是新一次 press 会覆盖被按扇区的值。
      if (evalPhase !== "input") {
        setEvalPhase("input");
      }
      const sectorIndex = angleToSectorIndex(local.x, local.y);
      const value = distanceToScore(dist);
      setPressing({ sectorIndex, value });
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
      // sectorIndex 已在 down 时锚定，不重新计算——避免手指划过相邻扇区时 commit
      // 错位置。preview 只跟距离更新（双向：向外加分、向内减分）。
      setPressing({ sectorIndex: pressing.sectorIndex, value });
    },
    [pressing, getSvgPoint]
  );

  const commitPress = useCallback(() => {
    if (!pressing) return;
    const idx = pressing.sectorIndex;
    const value = pressing.value;
    setScores((prev) => {
      const next = prev.slice();
      next[idx] = value;
      return next;
    });
    setTouched((prev) => {
      if (prev[idx]) return prev;
      const next = prev.slice();
      next[idx] = true;
      return next;
    });
    setPressing(null);
    // Phase 1.5h fix #2 — 让数字 linger 500ms 再消失。
    setCommitFlash({ sectorIndex: idx, value });
  }, [pressing]);

  // Phase 1.5h fix #2 — commitFlash 自动 clear，配合 PreviewNumber linger 显示。
  useEffect(() => {
    if (!commitFlash) return;
    const t = setTimeout(() => setCommitFlash(null), 500);
    return () => clearTimeout(t);
  }, [commitFlash]);

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

  // Phase 1.5b — 整轮 outline 沿"扇区外弧"描线，而不是 polygon 直线连 sector
  // 中线尖端。视觉上是"真车轮的胎面"——8 段圆弧（每段 45°，半径 = 该扇区
  // 当前 score 对应半径）相连；扇区之间 score 不同时半径不同，用径向短直线
  // 沿扇区边界连接（即 outline 完全沿真实扇区外缘走）。
  //
  // 实现：SVG path，对每个 sector i 用 A (arc) 命令画 45° 弧；扇区交界处用
  // L (line) 跳到下个扇区的起点半径。score = 0 的扇区半径退化为 0，arc
  // 走不通——降级为穿过 (0,0) 的两段直线（视觉上 outline "扎进中心"，跟
  // sectorPath 的 collapse 行为一致）。
  const outlinePath = (() => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const ptOnSector = (sectorIndex: number, deg: number) => {
      const r = sectorRadius(displayScores[sectorIndex]);
      return {
        r,
        x: Math.cos(toRad(deg)) * r,
        y: Math.sin(toRad(deg)) * r,
      };
    };
    const segs: string[] = [];
    // 起点 = sector 0 起始边的外缘点
    const p0 = ptOnSector(0, -90);
    if (p0.r > 0) {
      segs.push(`M ${p0.x.toFixed(3)} ${p0.y.toFixed(3)}`);
    } else {
      segs.push(`M 0 0`);
    }
    for (let i = 0; i < 8; i++) {
      const start = -90 + i * SECTOR_DEG;
      const end = start + SECTOR_DEG;
      const r = sectorRadius(displayScores[i]);
      if (r > 0) {
        // 沿本扇区外弧走 45° (largeArc=0, sweep=1，跟 sectorPath 一致)
        const p2 = ptOnSector(i, end);
        segs.push(
          `A ${r.toFixed(3)} ${r.toFixed(3)} 0 0 1 ${p2.x.toFixed(
            3
          )} ${p2.y.toFixed(3)}`
        );
      } else {
        // score = 0 的扇区：绕到中心 (0,0)，等下一段再从中心 L 到下扇区起点
        segs.push(`L 0 0`);
      }
      // 跨扇区边界：L 到下扇区起始边（同一角度 = end，但下扇区半径可能不同）
      const nextI = (i + 1) % 8;
      const nextStart = ptOnSector(nextI, end);
      if (nextStart.r > 0) {
        segs.push(`L ${nextStart.x.toFixed(3)} ${nextStart.y.toFixed(3)}`);
      } else {
        segs.push(`L 0 0`);
      }
    }
    segs.push(`Z`);
    return segs.join(" ");
  })();

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
                {/* Phase 1.5g — souvenir card 的 mini wheel 也用 hatching fill,
                    跟 main wheel 视觉一致。done 阶段不存在 press, 所以
                    strokePatternScore = scores[i]。clipPath id 加 -snap 后缀
                    避免跟 main wheel 的 sec-clip-i 冲突（同一 DOM 同时存在
                    会指向 main wheel 的 displayScores 路径）。 */}
                <defs>
                  {DIMENSIONS.map((_, i) => (
                    <clipPath key={`snap-clip-${i}`} id={`snap-clip-${i}`}>
                      <path d={sectorPath(i, scores[i] ?? DEFAULT_SCORE)} />
                    </clipPath>
                  ))}
                </defs>
                {DIMENSIONS.map((dim, i) => {
                  const s = scores[i] ?? DEFAULT_SCORE;
                  return (
                    <g key={dim.name}>
                      <g clipPath={`url(#snap-clip-${i})`}>
                        <ScribbleHatchingFill
                          sectorIndex={i}
                          displayScore={s}
                          strokePatternScore={s}
                          color={dim.color}
                        />
                      </g>
                      <path
                        d={sectorPath(i, s)}
                        fill="none"
                        stroke={dim.color}
                        strokeWidth={1.4}
                        strokeLinejoin="round"
                      />
                    </g>
                  );
                })}
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
            {isEval ? "我人生的马车" : "我人生的马车"}
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
                // Phase 1.5e fix #3 — wheel-shape-bob-host 一直 apply transition,
                // shape 阶段加 wheel-shape-bob 触发一次性 keyframes 动画;
                // 动画被 press 中断 / 自然结束 class 移除时, transition 兜底
                // 让 transform 平滑回 0, 不再 "跳一下"。
                isEval ? "wheel-shape-bob-host" : "",
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
                  {/* Phase 1.5g — 框架 vs 填色分层（奋笔疾书 hatching D'）
                      ====================================================
                      oracle: 边界（径向分隔线 + 外弧）= 精确印好的纸；填色 =
                      手绘涂出来的。每个扇区用 clipPath 裁回精确轮廓，内部
                      ScribbleHatchingFill 走 N 条 jitter 短 stroke，外层
                      sectorPath 描精确 boundary stroke（不抖）。
                      press 期间 stroke pattern 锁定到 MAX_SCORE 密度，clipPath
                      跟 preview 半径走 → stroke 数稳定，只是露出半径在变。 */}
                  <defs>
                    {DIMENSIONS.map((_, i) => (
                      <clipPath key={`sec-clip-${i}`} id={`sec-clip-${i}`}>
                        <path d={sectorPath(i, displayScores[i])} />
                      </clipPath>
                    ))}
                  </defs>
                  {DIMENSIONS.map((dim, i) => {
                    const isPressing =
                      pressing != null && pressing.sectorIndex === i;
                    // press 期间锁定 stroke pattern 到满分密度；非 press 时按
                    // displayScore 决定密度。 score=0 不渲染 fill。
                    const strokePatternScore = isPressing
                      ? MAX_SCORE
                      : displayScores[i];
                    const sectorOpacity =
                      pressing != null
                        ? isPressing
                          ? 1
                          : 0.55
                        : 1;
                    const cls =
                      [
                        lowestSet?.has(i) ? "pulse-sector" : "",
                        isPressing ? "press-active-sector" : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined;
                    return (
                      <g
                        key={dim.name}
                        opacity={sectorOpacity}
                        className={cls}
                        style={{ transition: "opacity 0.2s" }}
                      >
                        {/* (1) 奋笔疾书 hatching fill，clipPath 裁到精确扇区。 */}
                        <g clipPath={`url(#sec-clip-${i})`}>
                          <ScribbleHatchingFill
                            sectorIndex={i}
                            displayScore={displayScores[i]}
                            strokePatternScore={strokePatternScore}
                            color={dim.color}
                          />
                        </g>
                        {/* (2) 精确 boundary stroke：同 sectorPath，无 fill。
                            stroke = dim.color，1.4px，round join。 */}
                        <path
                          d={sectorPath(i, displayScores[i])}
                          fill="none"
                          stroke={dim.color}
                          strokeWidth={1.4}
                          strokeLinejoin="round"
                        />
                      </g>
                    );
                  })}

                  {/* Phase 1.5j fix #2 — touched + score=0 时的 dot marker。
                      score>0 已有 hatching fill 作 visual presence，无需 dot;
                      score=0 时扇区无几何 (sectorRadius(0)=0, 保留"圆心 = 0"
                      honest 语义), dot 是独立 marker 让 user 区分"画过 0 分"
                      vs "没画过". 位置: sector 中心方向 r=8, dot r=4. */}
                  {DIMENSIONS.map((dim, i) => {
                    if (!touched[i]) return null;
                    if (displayScores[i] !== 0) return null;
                    const angle = -90 + i * SECTOR_DEG + SECTOR_DEG / 2;
                    const rad = (angle * Math.PI) / 180;
                    const r = 8;
                    return (
                      <circle
                        key={`zero-dot-${i}`}
                        cx={Math.cos(rad) * r}
                        cy={Math.sin(rad) * r}
                        r={4}
                        fill={dim.color}
                      />
                    );
                  })}

                  {/* Phase 1.5b connect 阶段：沿 8 个扇区外弧描整轮 outline。
                      不再是 polygon 直线连尖端 (会显成八边形)，而是 A (arc)
                      命令沿真实扇区外缘走——平衡时圆滚滚、失衡时凹凸不平。
                      stroke-dasharray 动画从 "全是 gap" 渐变到 "全连"，1.2s
                      走完；shape / ready 阶段持续显示静态 outline。 */}
                  {isEval && evalPhase !== "input" && (
                    <path
                      d={outlinePath}
                      fill="none"
                      stroke="#27272a"
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className={
                        evalPhase === "connect" ? "outline-connect" : undefined
                      }
                      opacity={evalPhase === "connect" ? 1 : 0.5}
                      style={{ transition: "opacity 0.4s" }}
                    />
                  )}

                  {/* center dot */}
                  <circle cx={0} cy={0} r={2.5} fill="#27272a" />

                  {/* Phase 1.5c 试用版 onboarding：input 阶段持续显示 8 个
                      dashed 扇区轮廓（满半径外缘 dashed 圆 + 8 条径向 dashed 线），
                      告诉用户"任何扇区都可按住" + 提供"画时感受分数"的参考线。

                      Phase 1.5g — dashed 调稀（liushu 反馈 "3 3" 点过密）：
                      dasharray "3 3" → "2 6"（点更短 + 间隔更大），strokeWidth
                      1.5 → 1.0 配合稀疏 gap 让点更细。视觉上 dashed 仍可见做
                      reference, 但更克制不抢 wheel 焦点（原则 7）。 */}
                  {isEval && evalPhase === "input" && (
                      <g
                        className="onboarding-hint"
                        pointerEvents="none"
                        style={{ transition: "opacity 0.2s ease-out" }}
                      >
                        <circle
                          cx={0}
                          cy={0}
                          r={MAX_RADIUS}
                          fill="none"
                          stroke="#71717a"
                          strokeWidth={1.0}
                          strokeDasharray="2 6"
                          opacity={pressing ? 0.2 : 0.4}
                        />
                        {Array.from({ length: 8 }, (_, i) => {
                          const deg = -90 + i * SECTOR_DEG;
                          const rad = (deg * Math.PI) / 180;
                          const x = Math.cos(rad) * MAX_RADIUS;
                          const y = Math.sin(rad) * MAX_RADIUS;
                          return (
                            <line
                              key={`onboarding-spoke-${i}`}
                              x1={0}
                              y1={0}
                              x2={x.toFixed(3)}
                              y2={y.toFixed(3)}
                              stroke="#71717a"
                              strokeWidth={1.0}
                              strokeDasharray="2 6"
                              opacity={pressing ? 0.2 : 0.4}
                            />
                          );
                        })}
                      </g>
                    )}
                </g>
              </g>

              {/* Press preview 数字浮现：实时显示当前预览的 score 整数。
                  位置在被 press 扇区的中线略偏外缘（既不挡视线又跟着方向走）。
                  挂在最外层 g (无 rotate)，因为这时 rotation=0 反正不影响。 */}
              {(pressing || commitFlash) && (
                <PreviewNumber
                  sectorIndex={(pressing ?? commitFlash!).sectorIndex}
                  value={(pressing ?? commitFlash!).value}
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
                {/* Phase 1.5 — 入口 framing block。22 字 hook 显眼锚 "圆心 = 0
                    / 外缘 = 10 / 马车隐喻"；详情段落收在 <details> 里默认
                    收起，遵守原则 7 克制 UI——hook 不抢 wheel 视觉，需要更多
                    引导的用户主动展开。 */}
                <p className="mt-3 text-base leading-relaxed text-zinc-600">
                  圆心 = 0，外缘 = 10。画出此刻你这辆人生马车的车轮。
                </p>
                <details className="mt-2 text-sm leading-relaxed text-zinc-500">
                  <summary className="cursor-pointer list-none text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline [&::-webkit-details-marker]:hidden">
                    完整说明 / 怎么玩
                  </summary>
                  {/* 经典 wheel of life 文案（润色版）：保留 8 领域 / 满意度 /
                      圆心 0 外缘 10 / 重新画出此刻 / 马车隐喻 / 未来方向 essence。 */}
                  <div className="mt-3 space-y-3 text-zinc-600">
                    <p>
                      生命之轮的 8 个区块代表你生命中的 8 个不同领域。请为你此时此刻这些领域的满意程度打分——圆心代表 0
                      分，外缘代表 10 分。分数越低，外缘越靠近圆心。通过你的分数，重新画出此刻的生命之轮。
                    </p>
                    <p>
                      生命之轮帮你看到不同领域目前正在如何影响你的生活。想想看：如果你人生的马车就在这一车轮上前进，你的路途会有多平坦
                      / 颠簸？生命之轮还会提供给我们一个未来工作的方向。
                    </p>
                  </div>
                </details>
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
                      ? "按住任意扇区某半径，松开就是分数。"
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
                    准备好了——让它跑一程，看看路途平坦还是颠簸。
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
                    // Phase 1.5d fix #2 — 读 displayScores 跟 wheel 同源真相，
                    // fresh load 时未 touched 的扇区 wheel 强制归 0；slider 之
                    // 前直接读 scores 会显示历史 commit 的 stale 值，跟 wheel
                    // 不一致。改值仍走 handleSliderChange 标 touched。
                    const value = displayScores[i] ?? DEFAULT_SCORE;
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
                这是我现在的车。颠簸的地方，是我现在的失衡。
              </p>
            </header>
          ) : isReflect ? (
            <div className="flex flex-col gap-10 pt-2">
              <h1
                className="fade-rise text-3xl font-medium leading-snug tracking-tight text-zinc-900 md:text-4xl"
                style={{ animationDelay: "1.2s" }}
              >
                我人生这辆马车，路途平坦还是颠簸？
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
