"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";

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
// Phase 2 register craft — placeholder pool. Co-Active NCRW essence:
// 自我接纳 (presence 看见此刻不评判) + 自我权威 (commitment user 自己定义
// 下一步, 不被 product 推). 句式跳脱单一结构, 跨"摆烂式接纳/觉察觉知/真诚
// 情绪/自我关怀行动/领域泛化 fuzz" multiple facets.
// NCRW filter: 不用 user 实际 scores 派生 phrase (product 看 user 状态 →
// propose 具体行动 = 违反 sequence 守则). 不用 specific score 数 (3→7 这种,
// 跟 user 实际可能不符 = 驴唇不对马嘴). 不用"事"字 (生命之轮是 8 领域不是
// "事"). commitment 用领域泛化 fuzz ("我想在 xxx" / "想多照顾一个领域") 让
// user 自己填具体维度.
// 用户主动 click commit signal (button click / Return key keydown / Form Assistant
// Done blur / visualViewport keyboard dismiss) 时若 draft 空, fall back 到选中
// 的 placeholder 作为 user voice (sequence 守则 reframe: user 主动接受 ≠
// product 强加). 每次进入 presence input 阶段 re-pick (useEffect on mode change),
// 让"回去调整车轮再回来" 也看到不同 phrase.
// Note: commitment fall back 等于 commitment "默认值实际做了", 跟圆桌 4
// §双守则覆盖 narrative tension — 2026-05-11 liushu 转向, 圆桌 4 doc 同步 amend.
const PRESENCE_PLACEHOLDERS = [
  "嗯，颠",                       // 极简反应 (李四 anchor "放假的车" echo)
  "看见了",                       // 觉察
  "今天好像就是这样",             // 接纳 + 不评判
  "这一阵子，真的累",             // 真诚情绪
  "原来这就是现在的我",           // 觉察 + 接纳
  "心里有个角落空着",             // 诗意觉察
  "好像也没那么糟",               // 反向接纳
  "怎么觉得有点空",               // 真诚情绪
  "其实我已经走了不少",           // 接纳 + 自我肯定 (积极)
  "也挺好的，原来",               // 反向接纳 (积极)
  "看到了，我自己",               // 觉察 + 自我肯定 (积极)
  "这就是我，就这样",             // 平静接纳 (积极)
];
// Phase 2 Sub-task 2 — 卡片小图画 doodle pool. Calvin & Hobbes 简笔风,
// 出现在 done card "margin zone" 随机位置 + 随机倾斜 (像 Calvin & Hobbes
// 漫画 margin 角落随手画的小图). Doodle pool 跟 placeholder 同 craft 哲学
// — pool 里多 variants random pick per visit, register 一致但 phrase/visual
// 不同, 单 visit 稳定不抖.
type DoodleVariant = "stickFigure" | "animal" | "heart" | "cloud" | "sun" | "moon" | "star" | "cup";
const DOODLE_POOL: DoodleVariant[] = [
  "stickFigure", "animal", "heart",
  "cloud", "sun", "moon", "star", "cup",
];

// Doodle margin position pool (避开 wheel 中心 + 文字主区, 落在 card 角落 /
// 边缘 / 文字之间空白). 每位置 random rotation small ±15° tilt 让感觉 organic.
type DoodlePosition = {
  // CSS positioning (% of card)
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  // PNG positioning (px in PNG canvas, 1080×1350)
  pngX: number;
  pngY: number;
};
const DOODLE_POSITIONS: DoodlePosition[] = [
  { top: "5%", left: "6%", pngX: 80, pngY: 80 },
  { top: "5%", right: "6%", pngX: 920, pngY: 80 },
  { top: "38%", left: "4%", pngX: 60, pngY: 540 },
  { top: "38%", right: "4%", pngX: 940, pngY: 540 },
  { bottom: "22%", left: "8%", pngX: 100, pngY: 1010 },
  { bottom: "22%", right: "8%", pngX: 900, pngY: 1010 },
];

// React inline JSX components (XSS-safe, no dangerouslySetInnerHTML)
function DoodleStickFigure({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.25} viewBox="-20 -25 40 50">
      <g fill="none" stroke="#52525b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={0} cy={-15} r={5} />
        <circle cx={-1.8} cy={-16} r={0.6} fill="#52525b" stroke="none" />
        <circle cx={1.8} cy={-16} r={0.6} fill="#52525b" stroke="none" />
        <path d="M -2 -13.5 Q 0 -12 2 -13.5" />
        <path d="M 0 -10 Q -0.3 -2 0.3 6" />
        <path d="M 0 -7 Q -4 -10 -8 -14" />
        <path d="M 0 -7 Q 4 -5 7 -3" />
        <path d="M 0 6 Q -2 12 -4 18" />
        <path d="M 0 6 Q 2 12 4 18" />
      </g>
    </svg>
  );
}

function DoodleAnimal({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.68} viewBox="-22 -15 44 30">
      <g fill="none" stroke="#52525b" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M -10 0 Q -12 -6 -7 -8 Q 0 -10 8 -8 Q 13 -6 11 0 Q 12 5 7 6 Q 0 7 -8 6 Q -12 5 -10 0 Z" fill="#fef3c7" fillOpacity={0.5} />
        <path d="M -7 -7 L -8 -12 L -4 -9 Z" fill="#fef3c7" />
        <path d="M 7 -7 L 8 -12 L 4 -9 Z" fill="#fef3c7" />
        <circle cx={-3.5} cy={-3} r={0.8} fill="#52525b" stroke="none" />
        <circle cx={3.5} cy={-3} r={0.8} fill="#52525b" stroke="none" />
        <circle cx={0} cy={0.5} r={0.6} fill="#52525b" stroke="none" />
        <path d="M -2 2 Q 0 3.5 2 2" />
        <path d="M 11 0 Q 16 -3 14 -8" />
      </g>
    </svg>
  );
}

function DoodleHeart({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20">
      <path d="M 0 6 Q -8 -2 -6 -6 Q -3 -9 0 -5 Q 3 -9 6 -6 Q 8 -2 0 6 Z" fill="#fda4af" stroke="#52525b" strokeWidth={1} strokeLinejoin="round" />
    </svg>
  );
}

function DoodleCloud({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.42} viewBox="-25 -10 50 20">
      <path
        d="M -18 4 Q -22 -3 -14 -5 Q -8 -10 0 -7 Q 8 -10 14 -5 Q 22 -3 18 4 L 14 5 L -14 5 Z"
        fill="white" stroke="#52525b" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function DoodleSun({ size = 30 }: { size?: number }) {
  const rays = [
    "M 0 -10 L 0 -14", "M 7.07 -7.07 L 9.9 -9.9", "M 10 0 L 14 0", "M 7.07 7.07 L 9.9 9.9",
    "M 0 10 L 0 14", "M -7.07 7.07 L -9.9 9.9", "M -10 0 L -14 0", "M -7.07 -7.07 L -9.9 -9.9",
  ];
  return (
    <svg width={size} height={size} viewBox="-15 -15 30 30">
      <g fill="none" stroke="#52525b" strokeWidth={1.6} strokeLinecap="round">
        <circle cx={0} cy={0} r={6} fill="#fef9c3" />
        {rays.map((d, i) => <path key={i} d={d} />)}
      </g>
    </svg>
  );
}

function DoodleMoon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20">
      <path
        d="M 4 -7 Q -8 -3 -8 4 Q -3 9 4 7 Q -2 4 -2 0 Q -2 -4 4 -7 Z"
        fill="#fef9c3" stroke="#52525b" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
      />
    </svg>
  );
}

function DoodleStar({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20">
      <path
        d="M 0 -8 L 2.4 -2.5 L 8 -2.5 L 3.5 1 L 5.5 7 L 0 3.5 L -5.5 7 L -3.5 1 L -8 -2.5 L -2.4 -2.5 Z"
        fill="#fef3c7" stroke="#52525b" strokeWidth={1.4} strokeLinejoin="round"
      />
    </svg>
  );
}

function DoodleCup({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.1} viewBox="-12 -14 24 26">
      <g fill="none" stroke="#52525b" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M -6 -2 L -6 8 Q -6 11 -3 11 L 3 11 Q 6 11 6 8 L 6 -2 Z" fill="#fef3c7" fillOpacity={0.4} />
        <path d="M 6 0 Q 10 0 10 4 Q 10 8 6 8" />
        <path d="M -6 -2 L 6 -2" />
        <path d="M -2 -7 Q -3 -10 -1 -13" />
        <path d="M 2 -7 Q 3 -10 1 -13" />
      </g>
    </svg>
  );
}

// SVG string builders for Canvas PNG (parallel maintenance with React components above —
// SVG defs 同步, 改一处两处都要改). Used in renderCardToPng to drawImage.
function buildDoodleSvgString(variant: DoodleVariant, sizePx: number): string {
  const ns = 'xmlns="http://www.w3.org/2000/svg"';
  switch (variant) {
    case "stickFigure":
      return `<svg ${ns} width="${sizePx}" height="${sizePx * 1.25}" viewBox="-20 -25 40 50">
  <g fill="none" stroke="#52525b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="0" cy="-15" r="5"/>
    <circle cx="-1.8" cy="-16" r="0.6" fill="#52525b" stroke="none"/>
    <circle cx="1.8" cy="-16" r="0.6" fill="#52525b" stroke="none"/>
    <path d="M -2 -13.5 Q 0 -12 2 -13.5"/>
    <path d="M 0 -10 Q -0.3 -2 0.3 6"/>
    <path d="M 0 -7 Q -4 -10 -8 -14"/>
    <path d="M 0 -7 Q 4 -5 7 -3"/>
    <path d="M 0 6 Q -2 12 -4 18"/>
    <path d="M 0 6 Q 2 12 4 18"/>
  </g>
</svg>`;
    case "animal":
      return `<svg ${ns} width="${sizePx}" height="${sizePx * 0.68}" viewBox="-22 -15 44 30">
  <g fill="none" stroke="#52525b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M -10 0 Q -12 -6 -7 -8 Q 0 -10 8 -8 Q 13 -6 11 0 Q 12 5 7 6 Q 0 7 -8 6 Q -12 5 -10 0 Z" fill="#fef3c7" fill-opacity="0.5"/>
    <path d="M -7 -7 L -8 -12 L -4 -9 Z" fill="#fef3c7"/>
    <path d="M 7 -7 L 8 -12 L 4 -9 Z" fill="#fef3c7"/>
    <circle cx="-3.5" cy="-3" r="0.8" fill="#52525b" stroke="none"/>
    <circle cx="3.5" cy="-3" r="0.8" fill="#52525b" stroke="none"/>
    <circle cx="0" cy="0.5" r="0.6" fill="#52525b" stroke="none"/>
    <path d="M -2 2 Q 0 3.5 2 2"/>
    <path d="M 11 0 Q 16 -3 14 -8"/>
  </g>
</svg>`;
    case "heart":
      return `<svg ${ns} width="${sizePx}" height="${sizePx}" viewBox="-10 -10 20 20">
  <path d="M 0 6 Q -8 -2 -6 -6 Q -3 -9 0 -5 Q 3 -9 6 -6 Q 8 -2 0 6 Z" fill="#fda4af" stroke="#52525b" stroke-width="1" stroke-linejoin="round"/>
</svg>`;
    case "cloud":
      return `<svg ${ns} width="${sizePx}" height="${sizePx * 0.42}" viewBox="-25 -10 50 20">
  <path d="M -18 4 Q -22 -3 -14 -5 Q -8 -10 0 -7 Q 8 -10 14 -5 Q 22 -3 18 4 L 14 5 L -14 5 Z" fill="white" stroke="#52525b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
    case "sun":
      return `<svg ${ns} width="${sizePx}" height="${sizePx}" viewBox="-15 -15 30 30">
  <g fill="none" stroke="#52525b" stroke-width="1.6" stroke-linecap="round">
    <circle cx="0" cy="0" r="6" fill="#fef9c3"/>
    <path d="M 0 -10 L 0 -14"/><path d="M 7.07 -7.07 L 9.9 -9.9"/>
    <path d="M 10 0 L 14 0"/><path d="M 7.07 7.07 L 9.9 9.9"/>
    <path d="M 0 10 L 0 14"/><path d="M -7.07 7.07 L -9.9 9.9"/>
    <path d="M -10 0 L -14 0"/><path d="M -7.07 -7.07 L -9.9 -9.9"/>
  </g>
</svg>`;
    case "moon":
      return `<svg ${ns} width="${sizePx}" height="${sizePx}" viewBox="-10 -10 20 20">
  <path d="M 4 -7 Q -8 -3 -8 4 Q -3 9 4 7 Q -2 4 -2 0 Q -2 -4 4 -7 Z" fill="#fef9c3" stroke="#52525b" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;
    case "star":
      return `<svg ${ns} width="${sizePx}" height="${sizePx}" viewBox="-10 -10 20 20">
  <path d="M 0 -8 L 2.4 -2.5 L 8 -2.5 L 3.5 1 L 5.5 7 L 0 3.5 L -5.5 7 L -3.5 1 L -8 -2.5 L -2.4 -2.5 Z" fill="#fef3c7" stroke="#52525b" stroke-width="1.4" stroke-linejoin="round"/>
</svg>`;
    case "cup":
      return `<svg ${ns} width="${sizePx}" height="${sizePx * 1.1}" viewBox="-12 -14 24 26">
  <g fill="none" stroke="#52525b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M -6 -2 L -6 8 Q -6 11 -3 11 L 3 11 Q 6 11 6 8 L 6 -2 Z" fill="#fef3c7" fill-opacity="0.4"/>
    <path d="M 6 0 Q 10 0 10 4 Q 10 8 6 8"/>
    <path d="M -6 -2 L 6 -2"/>
    <path d="M -2 -7 Q -3 -10 -1 -13"/>
    <path d="M 2 -7 Q 3 -10 1 -13"/>
  </g>
</svg>`;
  }
}

const COMMITMENT_PLACEHOLDERS = [
  "今天做：先不做",                   // anti-commitment 摆烂诚实
  "这周给自己一个晚上不开手机",       // 自我关怀具体 ritual
  "下周约老朋友吃饭",                 // 关系投资 (家庭/朋友领域)
  "今晚早睡 1 小时",                  // 自我关怀小行动 (健康领域)
  "试试每天写三句话给自己",           // 自我关怀 ritual
  "跟自己道个歉",                     // 自我关怀
  "想在某一个领域多投入",             // 领域泛化 fuzz (NCRW: user 自己选)
  "下个月想往前挪一点",               // 模糊推进 (避开 specific score)
  "我决定先停下来，再看看",           // 自我权威 + decisive (active voice)
  "我想认真照顾一下自己",             // 自我权威 + 关怀
  "今天我选择慢一点",                 // 自我权威 + ownership
  "我要给自己一些空间",               // 自我权威 + ownership
];

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
};

function loadState(): StoredState {
  if (typeof window === "undefined") {
    return {
      scores: defaultScores(),
      presence: null,
      commitment: null,
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
      };
    // Phase 1.6 — caption 字段在 v3 短暂引入又删除（自存 reframe 边际价值降，
    // 见 vault 决策记录 2026-05-09）。老数据里如果有 caption 字段，JSON.parse
    // 会解析出来但下面的解构忽略它——unknown field 自然丢弃，不需迁移逻辑。
    const parsed = JSON.parse(raw) as {
      scores?: unknown;
      presence?: unknown;
      commitment?: unknown;
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
    return { scores, presence, commitment };
  } catch {
    return {
      scores: defaultScores(),
      presence: null,
      commitment: null,
    };
  }
}

function saveState(
  scores: Scores,
  presence: Presence | null,
  commitment: Commitment | null
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        scores,
        presence,
        commitment,
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
  // Phase 2 craft — N ∝ sector 面积 (∝ r²) 让密度跨 score constant.
  // liushu fix: 之前算法 N grows linearly 但面积 grows 平方, low-score 显得密
  // high-score 显得潦草; 现在 N 跟面积成正比, 视觉密度 stable.
  // density 系数 0.012 给 score=10 ~120 strokes (比之前 80 +50% 密),
  // score=5 ~36, score=1 fall back to min 18 (避免极小扇区无 stroke).
  // press 时 strokePatternScore=MAX_SCORE → r=MAX_RADIUS → N 锁定满分密度,
  // 拖动半径不抖 (Phase 1.5g 决策仍生效).
  const sectorArea = 0.393 * r * r; // (45/360) × π × r² ≈ pie slice area
  const N = Math.max(18, Math.round(sectorArea * 0.012));
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
        // Phase 2 craft — multiply blend 让重叠 strokes darker, 模拟蜡笔颜料叠加
        // 边缘加深 (kindergarten vibe). SVG 默认 isolated stacking, 不需 isolate
        // declaration; multiply 跟 paper-grain 背景也叠 → strokes 透出纸纹.
        style={{ mixBlendMode: "multiply" }}
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
const GROUND_PER_DEG = 1.8;

function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
}

// Eval-mode viewBox is the original square; post-eval modes extend downward
// for the ground line + bob excursion, and outward horizontally to make room
// for the 8 dimension labels that orbit the wheel.
const VBOX_PAD = 20;
const VBOX_RUN_EXTRA = 60;
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

// =============================================================================
// Phase 1.6 — Canvas 渲染 PNG (子任务 D, Mixed strategy D — v2)
// =============================================================================
//
// 策略 (D): wheel 部分走 SVG-as-Image (复用 ScribbleHatchingFill 几百行 hatching
// 算法), 文字层用 Canvas 2D fillText 直接画在 main page 上下文。
//
// 为什么 v2 切到 Mixed: 原 v1 (B') 把整张卡片打包成 SVG 序列化, 通过 <img>
// 加载到 Canvas — SVG 在 isolated origin 跑, document 的 webfont (next/font
// 自托管的 Ma Shan Zheng / Caveat) 拿不到, PNG 输出回落到系统楷体, 视觉跟 DOM
// 卡片预览不一致, 用户截图存档看到"字体没了"。
//
// Mixed 解法: wheel SVG 不含任何 text, drawImage 到 canvas 后, 在 main page
// font registry 下 ctx.fillText 画文字 (await document.fonts.ready 保证 webfont
// 已加载) — Canvas 2D 跟 page 共享 font registry, webfont 直接 work, PNG 跟
// DOM 视觉一致。

// PNG 输出尺寸: 1080×1350 = 4:5 portrait, mobile share sheet 友好,
// IG / 小红书 portrait 卡片标准比例。
const PNG_WIDTH = 1080;
const PNG_HEIGHT = 1350;

// 构建 wheel-only SVG (无 text, 文字层由 Canvas 2D fillText 后画)。
// 卡片内布局 (1080 x 1350, N4 sign-off 派 — 没顶部 header):
//   y=70..150:    article 上 padding (无 header)
//   y=400:        wheel 中心 (SVG drawImage, 半径 280, 区域 120..680)
//   y=800..:      presence 文字 (Canvas fillText, multi-line) — wheel 加 +120 gap
//                 突出 "标题"语义 (vs 之前 760, 真机反馈后 polish v3)
//   y=...:        commitment 文字 (Canvas fillText, optional)
//   y=...:        sign-off 日期 (右对齐 "— 2026.05.09")
//   y=1280:       watermark "wheel of life" (Canvas fillText)
function buildWheelSvg({ scores }: { scores: Scores }): string {
  const wheelCx = PNG_WIDTH / 2;
  const wheelCy = 400; // N4 layout — 上移 (vs N7 的 510), 无 header 占用顶部空间
  const wheelR = 280; // DOM mini wheel 200px → PNG 280px 让视觉饱满
  const wheelScale = wheelR / MAX_RADIUS;
  const wheelGroupTransform = `translate(${wheelCx} ${wheelCy}) scale(${wheelScale.toFixed(
    4
  )})`;

  // outline dashed circle
  const outline = `<circle cx="0" cy="0" r="${MAX_RADIUS}" fill="none" stroke="#e4e4e7" stroke-width="1" stroke-dasharray="2 4" />`;

  // 8 个扇区: clipPath + hatching + boundary stroke (复用 ScribbleHatchingFill 算法)
  const defs: string[] = [];
  const sectors: string[] = [];
  for (let i = 0; i < DIMENSIONS.length; i++) {
    const dim = DIMENSIONS[i];
    const s = scores[i] ?? DEFAULT_SCORE;
    const path = sectorPath(i, s);
    defs.push(
      `<clipPath id="png-sec-${i}"><path d="${path}" /></clipPath>`
    );
    if (s <= 0) {
      // sector 完全 collapse, 不绘制 hatching / boundary
      continue;
    }
    // hatching strokes — deterministic seed (mulberry32 + hashSeed) 跟 DOM 版本一致
    const r = sectorRadius(s);
    const start = -90 + i * SECTOR_DEG;
    const sectorMidDeg = start + SECTOR_DEG / 2;
    const baseStrokeDeg = sectorMidDeg + 70;
    const N = Math.max(22, Math.round(22 + s * 5.8));
    const rng = mulberry32(hashSeed(i, 0xd2, N));
    const strokes: string[] = [];
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    for (let k = 0; k < N; k++) {
      const tR = Math.sqrt(rng());
      const r0 = tR * r * 0.95;
      const theta0Deg = start + rng() * SECTOR_DEG;
      const theta0 = toRad(theta0Deg);
      const x0 = Math.cos(theta0) * r0;
      const y0 = Math.sin(theta0) * r0;
      const strokeAngleDeg = baseStrokeDeg + (rng() - 0.5) * 50;
      const strokeAngle = toRad(strokeAngleDeg);
      const len = 10 + rng() * (rng() > 0.7 ? 50 : 25);
      const half = len / 2;
      const x1 = x0 - Math.cos(strokeAngle) * half;
      const y1 = y0 - Math.sin(strokeAngle) * half;
      const x2 = x0 + Math.cos(strokeAngle) * half;
      const y2 = y0 + Math.sin(strokeAngle) * half;
      const sw = 1.0 + rng() * 1.6;
      const lightDelta = (rng() - 0.5) * 0.24;
      const strokeColor = jitterColor(dim.color, lightDelta);
      const op = 0.5 + rng() * 0.35;
      strokes.push(
        `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(
          2
        )}" y2="${y2.toFixed(2)}" stroke="${strokeColor}" stroke-width="${sw.toFixed(
          2
        )}" stroke-linecap="round" opacity="${op.toFixed(2)}" />`
      );
    }
    sectors.push(
      `<g clip-path="url(#png-sec-${i})">${strokes.join("")}</g>` +
        `<path d="${path}" fill="none" stroke="${dim.color}" stroke-width="1.4" stroke-linejoin="round" />`
    );
  }

  // 中心点 dot
  const centerDot = `<circle cx="0" cy="0" r="2.5" fill="#27272a" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PNG_WIDTH}" height="${PNG_HEIGHT}" viewBox="0 0 ${PNG_WIDTH} ${PNG_HEIGHT}">
  <defs>${defs.join("")}</defs>
  <g transform="${wheelGroupTransform}">
    ${outline}
    ${sectors.join("")}
    ${centerDot}
  </g>
</svg>`;
}

// Mixed strategy: wheel SVG → Image → drawImage 后用 Canvas 2D fillText 画文字
// (date header / divider / presence / commitment / watermark)。文字用 webfont
// (Ma Shan Zheng / Caveat) 跟 DOM 一致——await document.fonts.ready 保证字体已
// 加载, Canvas 2D 跟 page 共享 font registry。
async function renderCardToPng(opts: {
  presenceText: string;
  commitmentText: string | null;
  signOffDate: string; // "YYYY.MM.DD" 格式 — N4 sign-off 派的右对齐 "— 2026.05.09"
  scores: Scores;
  // Phase 2 Sub-task 2 — doodle params (variant + 位置 + 倾斜角)
  doodleVariant: DoodleVariant;
  doodlePosIdx: number;
  doodleRotation: number;
}): Promise<Blob> {
  const { presenceText, commitmentText, signOffDate, scores, doodleVariant, doodlePosIdx, doodleRotation } = opts;

  // 等 webfont 加载——这步是 PNG 用 webfont 不 fallback 的关键 (跟旧版 B' 不同,
  // 旧版在 isolated origin 拿不到 webfont, 必须 fallback 到 system 楷体)。
  if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
  }

  // Step 1: render wheel-only SVG → Image
  const wheelSvg = buildWheelSvg({ scores });
  const svgBlob = new Blob([wheelSvg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const wheelImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = (e) => reject(e);
      im.src = svgUrl;
    });

    // Step 2: composite on canvas — wheel image + text overlay
    const canvas = document.createElement("canvas");
    canvas.width = PNG_WIDTH;
    canvas.height = PNG_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    // 白底
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PNG_WIDTH, PNG_HEIGHT);

    // wheel SVG 直接绘到 PNG 同尺寸 (svg viewBox 跟 PNG 1:1)
    ctx.drawImage(wheelImg, 0, 0, PNG_WIDTH, PNG_HEIGHT);

    // 文字层 — main page font registry, webfont 已 ready
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // Presence (主) — 字号自适应 + multi-line wrap + cap to prevent overflow
    const presenceLen = presenceText.length;
    const presenceFontSize =
      presenceLen <= 14 ? 64 :
      presenceLen <= 30 ? 52 :
      presenceLen <= 70 ? 44 :
      presenceLen <= 130 ? 36 :
      28;
    ctx.font = `${presenceFontSize}px "Ma Shan Zheng", "STKaiti", "KaiTi", serif`;
    ctx.fillStyle = "#18181b";
    const presenceCharsPerLine = Math.max(
      8,
      Math.floor((PNG_WIDTH - 140) / (presenceFontSize * 0.95))
    );
    // 有 commit + sign-off 时余下空间小, cap 4 行; 没 commit 但有 sign-off cap 6 行
    const MAX_PRESENCE_LINES = commitmentText ? 4 : 6;
    const presenceLines: string[] = [];
    for (let i = 0; i < presenceText.length; i += presenceCharsPerLine) {
      if (presenceLines.length >= MAX_PRESENCE_LINES) {
        const last = presenceLines[presenceLines.length - 1];
        if (last && !last.endsWith("…")) {
          presenceLines[presenceLines.length - 1] = last.slice(0, -1) + "…";
        }
        break;
      }
      presenceLines.push(presenceText.slice(i, i + presenceCharsPerLine));
    }
    // N4 layout: wheel y=400 (R=280, bottom 680), presence y0=800 (wheel + 120 gap)
    // — wheel 承担"标题"语义需要 breathing room, DOM 加 mb-4 同步到 PNG +40 gap
    const presenceY0 = 800;
    const presenceLineHeight = presenceFontSize * 1.35;
    presenceLines.forEach((line, idx) => {
      ctx.fillText(line, PNG_WIDTH / 2, presenceY0 + idx * presenceLineHeight);
    });

    // Commitment (副, optional)
    let nextY = presenceY0 + presenceLines.length * presenceLineHeight;
    if (commitmentText) {
      const commitmentY = nextY + 50;
      ctx.font = '32px "Ma Shan Zheng", "STKaiti", "KaiTi", serif';
      ctx.fillStyle = "#71717a";
      // N4 派 — 删 "— " prefix (sign-off date 独占 dash symbol)
      ctx.fillText(commitmentText, PNG_WIDTH / 2, commitmentY);
      nextY = commitmentY;
    }

    // Sign-off 日期 (N4 派) — 右对齐 "— YYYY.MM.DD", 像信件 sign-off
    const signOffY = nextY + 60;
    ctx.font = '32px "Ma Shan Zheng", "STKaiti", "KaiTi", serif';
    ctx.fillStyle = "#a1a1aa";
    ctx.textAlign = "right";
    ctx.fillText(`— ${signOffDate}`, PNG_WIDTH - 80, signOffY);
    ctx.textAlign = "center"; // reset for watermark

    // Watermark — Caveat (Latin handwriting webfont)
    ctx.font = '28px "Caveat", cursive';
    ctx.fillStyle = "#a1a1aa";
    ctx.fillText("wheel of life", PNG_WIDTH / 2, PNG_HEIGHT - 70);

    // Phase 2 Sub-task 2 — doodle drawn last (overlay over wheel/text), at
    // random margin position with random tilt. PNG sizes 倍数 ~2.5x DOM (PNG
    // 1080 vs DOM ~400 mobile width).
    const doodlePngSizes: Record<DoodleVariant, number> = {
      stickFigure: 70,
      animal: 95,
      heart: 55,
      cloud: 100,
      sun: 78,
      moon: 60,
      star: 65,
      cup: 65,
    };
    const doodleHeightRatios: Record<DoodleVariant, number> = {
      stickFigure: 1.25,
      animal: 0.68,
      heart: 1.0,
      cloud: 0.42,
      sun: 1.0,
      moon: 1.0,
      star: 1.0,
      cup: 1.1,
    };
    const dSize = doodlePngSizes[doodleVariant];
    const dHeight = dSize * doodleHeightRatios[doodleVariant];
    const doodleSvg = buildDoodleSvgString(doodleVariant, dSize);
    const doodleBlob = new Blob([doodleSvg], { type: "image/svg+xml;charset=utf-8" });
    const doodleUrl = URL.createObjectURL(doodleBlob);
    try {
      const doodleImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = (e) => reject(e);
        im.src = doodleUrl;
      });
      const dPos = DOODLE_POSITIONS[doodlePosIdx];
      ctx.save();
      ctx.translate(dPos.pngX, dPos.pngY);
      ctx.rotate((doodleRotation * Math.PI) / 180);
      ctx.drawImage(doodleImg, -dSize / 2, -dHeight / 2, dSize, dHeight);
      ctx.restore();
    } finally {
      URL.revokeObjectURL(doodleUrl);
    }

    // Step 3: canvas → PNG blob
    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png", 1)
    );
    if (!pngBlob) throw new Error("Canvas toBlob returned null");
    return pngBlob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function formatDateYMD(at: string): string {
  const d = new Date(at);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateDots(at: string): string {
  const d = new Date(at);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

export default function Home() {
  const [scores, setScores] = useState<Scores>(defaultScores);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [commitment, setCommitment] = useState<Commitment | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<Mode>("eval");
  const [progress, setProgress] = useState(0);
  const [runId, setRunId] = useState(0);
  // Phase 2 — placeholder pool: lazy init mount 时 random pick; useEffect 监听
  // mode 进入 "presence" 时 re-pick (cover "回去调整车轮再回来" case, SPA 不重
  // mount 但 mode reset → presence 流程会 re-pick).
  const [presencePlaceholder, setPresencePlaceholder] = useState(
    () => PRESENCE_PLACEHOLDERS[Math.floor(Math.random() * PRESENCE_PLACEHOLDERS.length)]
  );
  const [commitmentPlaceholder, setCommitmentPlaceholder] = useState(
    () => COMMITMENT_PLACEHOLDERS[Math.floor(Math.random() * COMMITMENT_PLACEHOLDERS.length)]
  );
  // Phase 2 Sub-task 2 — doodle pool: variant + 位置 + 倾斜角 各自 random pick.
  // 跟 placeholder 同 useEffect re-pick (mode → "presence" 时一起 re-pick),
  // 让 doodle 跟 placeholder 同步换 (一致 "新一轮反思" 体感).
  const [selectedDoodle, setSelectedDoodle] = useState<DoodleVariant>(
    () => DOODLE_POOL[Math.floor(Math.random() * DOODLE_POOL.length)]
  );
  const [selectedDoodlePosIdx, setSelectedDoodlePosIdx] = useState<number>(
    () => Math.floor(Math.random() * DOODLE_POSITIONS.length)
  );
  const [selectedDoodleRotation, setSelectedDoodleRotation] = useState<number>(
    () => Math.floor(Math.random() * 31) - 15 // -15° to +15°
  );
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
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // Persist whenever any persisted field changes, but only after hydration.
  useEffect(() => {
    if (!hydrated) return;
    saveState(scores, presence, commitment);
  }, [scores, presence, commitment, hydrated]);

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

  // Phase 1.5p — 1.5o 的 reflect 阶段 jitter 删除 (liushu: "停止滚动时还在
  // 上下抖动, 不对"). 颠簸物理只在 running 阶段表达 (wheel bob = computeBob
  // 的 wheel 自身不规则; 加 ground obstacles 让 wheel 弹更厉害).

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

  // Phase 1.6 子任务 C — 统一"分享"按钮 + Web Share API
  // mobile (pointer:coarse + canShare files): navigator.share → share sheet → "保存到相册"
  // desktop (pointer:fine 或不支持 share files): fallback <a download> 下载到本地
  // 注: (pointer:coarse) gate 必要, 因为 macOS Safari/Chrome 也实现 canShare files,
  //   仅靠 canShare 会让 desktop 错走 share sheet 分支 (2026-05-10 真机 verify 暴露)
  // AbortError (用户取消 share sheet) 静默吞掉, 不当 error 处理。
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const handleShare = useCallback(async () => {
    if (!presence) return;
    if (sharing) return;
    setSharing(true);
    setShareError(null);
    try {
      const signOffDate = formatDateDots(presence.at); // "2026.05.09"
      const pngBlob = await renderCardToPng({
        presenceText: presence.text,
        commitmentText: commitment ? commitment.text : null,
        signOffDate,
        scores,
        doodleVariant: selectedDoodle,
        doodlePosIdx: selectedDoodlePosIdx,
        doodleRotation: selectedDoodleRotation,
      });
      const dateYmd = formatDateYMD(presence.at);
      const filename = `wheel-of-life-${dateYmd}.png`;
      const dateDots = formatDateDots(presence.at);
      const shareTitle = `我的生命之轮 ${dateDots}`;

      const pngFile = new File([pngBlob], filename, { type: "image/png" });
      const isCoarsePointer =
        typeof window !== "undefined" &&
        window.matchMedia?.("(pointer: coarse)").matches === true;
      const canShareFiles =
        isCoarsePointer &&
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [pngFile] });

      if (canShareFiles) {
        try {
          await navigator.share({
            files: [pngFile],
            title: shareTitle,
            text: shareTitle, // iOS share sheet subtitle 不空 (review C3)
          });
        } catch (err) {
          // 用户在 share sheet 取消是 AbortError, 是正常路径不报错
          const name = (err as { name?: string })?.name;
          if (name !== "AbortError") {
            console.warn("navigator.share failed:", err);
            setShareError("分享未完成，请再试一次");
          }
        }
      } else {
        // desktop fallback: programmatic <a download> click. try/finally 保证
        // blob URL 一定 revoke (review B2 — appendChild/click 抛错时也不泄漏)
        const url = URL.createObjectURL(pngBlob);
        try {
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } finally {
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      }
    } catch (err) {
      // review B1 — silent failure 升级到 user-visible error。Canvas toBlob 返回
      // null / Image load fail / 字体未加载等都走这里, 用户知道点了按钮但失败了
      console.warn("share/render failed:", err);
      setShareError("生成失败，请再试一次");
    } finally {
      setSharing(false);
    }
  }, [presence, commitment, scores, sharing, selectedDoodle, selectedDoodlePosIdx, selectedDoodleRotation]);

  const handleBack = useCallback(() => {
    setMode("eval");
    // Phase 1.5n — 不再 reset touched / scores. user "回去调整"时保留之前
    // 分数, 想调哪个再 press 哪个 (1.5d fix #5 加的 reveal 中断 logic 让
    // press 任意阶段都能进 input + preview + commit 后重新 reveal).
    // evalPhase 直接进 "ready": user 看到完整 wheel + "再跑一程" 按钮.
    setEvalPhase("ready");
    setPressing(null);
    setProgress(0);
    // 重置 scroll position 避免 done page scroll 残留导致 eval page 显示位置过高.
    // Safari iOS scroll API quirky — 单 window.scrollTo 不一定 work. 用 rAF
    // delay 到 React re-render 后 + 3 targets (window / documentElement / body)
    // belt-and-suspenders 兼容 iOS Safari WebKit scroll bug.
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      });
    }
  }, []);

  // Fresh entry into Stage 5 v2 from reflect: clear any prior drafts. The
  // brief is explicit — re-entering presence should start blank, never edit
  // prior text. Persisted presence/commitment in state still surface in done.
  const handleEnterPresence = useCallback(() => {
    setPresenceDraft("");
    setCommitDraft("");
    setPresencePhase("input");
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
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPresenceDraft(e.target.value);
    },
    []
  );

  const handlePresenceBlur = useCallback(() => {
    // 上面对勾 (Safari Form Assistant Bar Done) 触发 input blur (Done 内部
    // call activeElement.blur()), 期待 commit (跟主动 click "我说完了" /
    // 下面 Return key 对称). 空 draft fall back 到 placeholder 跟其它路径
    // 一致 (placeholder = default value 转向, sequence 守则 reframe).
    // side effect: tap outside input 也 commit, 但 presence input phase
    // 失焦 = user 意图 done, 接受 implicit commit.
    witnessNow(presenceDraft.trim() || presencePlaceholder);
  }, [presenceDraft, witnessNow, presencePlaceholder]);

  const handleWitnessClick = useCallback(() => {
    // 主动点 = user-initiated produce; 空 draft fall back 到 placeholder 作 user voice.
    // blur path 不 fall back (avoid implicit commit on focus loss).
    witnessNow(presenceDraft.trim() || presencePlaceholder);
  }, [presenceDraft, witnessNow, presencePlaceholder]);

  const handleFinalize = useCallback(() => {
    // 主动点 "去看留印卡片" 或 mobile 对勾 = user-initiated; 空 commit fall back
    // 到 placeholder 作 user voice (跟 presence handleWitnessClick 对称).
    // Note: 这意味着 commitment 不再 optional — 卡片必显示 commit row.
    const commitText = commitDraft.trim() || commitmentPlaceholder;
    setCommitment({
      text: commitText.slice(0, COMMITMENT_MAX_LEN),
      at: new Date().toISOString(),
    });
    setMode("done");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [commitDraft, commitmentPlaceholder]);

  // Mobile 工具栏对勾 (iOS 拼音键盘 / 九宫格 — 没 Return key, 工具栏对勾是
  // 唯一"完成"入口) 不发 keydown event, 也不一定 trigger blur (iOS 16+ 倾向
  // dismiss keyboard 但保 textarea focus). 监听 visualViewport resize 检测
  // keyboard dismiss 作为 commit trigger fallback. desktop 无虚拟键盘 / 无
  // visualViewport, listener no-op (vv 不存在时直接 return).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mode !== "presence" || presencePhase !== "input") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const KEYBOARD_THRESHOLD = 100;
    let keyboardWasOpen = vv.height < window.innerHeight - KEYBOARD_THRESHOLD;
    const handleResize = () => {
      const isOpen = vv.height < window.innerHeight - KEYBOARD_THRESHOLD;
      if (keyboardWasOpen && !isOpen) {
        // Keyboard 刚 dismiss (工具栏对勾 / tap outside) → user-initiated commit
        witnessNow(presenceDraft.trim() || presencePlaceholder);
      }
      keyboardWasOpen = isOpen;
    };
    vv.addEventListener("resize", handleResize);
    return () => vv.removeEventListener("resize", handleResize);
  }, [mode, presencePhase, presenceDraft, witnessNow, presencePlaceholder]);

  // Phase 2 — placeholder re-pick on entering presence flow. SPA 内 mode 从
  // 别处变 "presence" (e.g., reflect → presence 自然推进, 或 done 阶段 user
  // click 回去调整车轮 → eval 重走 → reflect → presence) 时重新 random pick.
  // 让"回去再回来" case 也看到不同 phrase, 不只 hard reload 才换.
  useEffect(() => {
    if (mode === "presence") {
      setPresencePlaceholder(
        PRESENCE_PLACEHOLDERS[Math.floor(Math.random() * PRESENCE_PLACEHOLDERS.length)]
      );
      setCommitmentPlaceholder(
        COMMITMENT_PLACEHOLDERS[Math.floor(Math.random() * COMMITMENT_PLACEHOLDERS.length)]
      );
      // Doodle re-pick 同步 (variant + 位置 + 倾斜角)
      setSelectedDoodle(
        DOODLE_POOL[Math.floor(Math.random() * DOODLE_POOL.length)]
      );
      setSelectedDoodlePosIdx(
        Math.floor(Math.random() * DOODLE_POSITIONS.length)
      );
      setSelectedDoodleRotation(Math.floor(Math.random() * 31) - 15);
    }
  }, [mode]);

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

  // Phase 1.5t — wheel 经过 obstacle 时上下跟随 + 放大. obstaclesData /
  // groundCurveDeviation 提到 component scope 让 wheel transform 和 ground
  // render block 都能 reuse. wheel center SVG x = 0; obstacle x in SVG =
  // 0 + atProgress - groundProgressAbs.
  const groundProgressAbs = isRunning ? rotation * GROUND_PER_DEG : 0;
  // Phase 2 craft — obstacles 每次 startRide 重新随机 (跟 runId 挂钩, mulberry32
  // deterministic given runId, 同 run 内 React render 间稳定). 3 个 obstacles
  // 在 [200, 1200) 范围, 至少相距 250 避免视觉拥挤. type/radius/height 也微
  // jitter 让每跑视觉不同.
  const obstaclesData = useMemo<
    { atProgress: number; type: "bump" | "pit"; radius: number; height: number }[]
  >(() => {
    const rng = mulberry32(hashSeed(runId, 0xb04d));
    const positions: number[] = [];
    let attempts = 0;
    while (positions.length < 3 && attempts < 50) {
      const at = 200 + Math.floor(rng() * 1000);
      if (positions.every((p) => Math.abs(p - at) >= 250)) {
        positions.push(at);
      }
      attempts++;
    }
    positions.sort((a, b) => a - b);
    return positions.map((at) => ({
      atProgress: at,
      type: rng() < 0.5 ? ("bump" as const) : ("pit" as const),
      radius: 14 + Math.floor(rng() * 6), // 14-19
      height: 7 + Math.floor(rng() * 4), // 7-10
    }));
  }, [runId]);
  const groundCurveDeviation = (x: number) => {
    let dy = 0;
    for (const o of obstaclesData) {
      const obstacleX = o.atProgress - groundProgressAbs;
      const dx = x - obstacleX;
      if (Math.abs(dx) > o.radius) continue;
      const t = dx / o.radius;
      const bell = Math.cos((t * Math.PI) / 2) ** 2;
      dy += (o.type === "bump" ? -1 : 1) * o.height * bell;
    }
    return dy;
  };
  // 2.0× 放大让 wheel 颠簸幅度比 ground 起伏更夸张 (物理上不真实但视觉更"颠").
  const obstacleBob = showGround ? groundCurveDeviation(0) * 2.0 : 0;

  // Phase 1.5l — pulse 取消 (liushu 拍). visual disturbance 完全靠 ground line
  // 起伏 (Phase 1.5k A 路面颠簸) 表达 "路途平坦还是颠簸". sector 不再闪烁.

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
        <main
          className="mx-auto flex max-w-md flex-col items-center gap-6 px-6 pb-12 md:pt-12 md:pb-12 md:min-h-screen md:justify-center"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 4vh)" }}
        >
          {/* Souvenir card — the only emotional outlet of the UI (圆桌 #1 #7).
              Phase 1.6 reframe v4 (N4 sign-off 派, 经 N7 真机反馈后回退): 没顶部
              header, 日期作整张卡 sign-off (commitment / presence 之后右对齐
              "— 2026.05.09" 手写体, 像信件署日期), 再下方 watermark "wheel of
              life"。视觉气场: 用户的话占主导, 日期 sign-off 是 ta 的署名,
              watermark 是产品 ID。 */}
          <article
            className="fade-rise relative w-full overflow-hidden rounded-md bg-white px-7 py-9 shadow-md"
            style={{ animationDelay: "0.1s" }}
            aria-label="留印卡片"
          >
            {/* Phase 2 Sub-task 2 — doodle absolute positioned at random margin
                spot + random tilt. variant + position + rotation 都 mode → presence
                时一起 re-pick (跟 placeholder 同步, 一致"新一轮反思"). */}
            {(() => {
              const pos = DOODLE_POSITIONS[selectedDoodlePosIdx];
              return (
                <div
                  className="pointer-events-none absolute z-10"
                  style={{
                    top: pos.top,
                    bottom: pos.bottom,
                    left: pos.left,
                    right: pos.right,
                    transform: `rotate(${selectedDoodleRotation}deg)`,
                  }}
                  aria-hidden="true"
                >
                  {selectedDoodle === "stickFigure" && <DoodleStickFigure size={28} />}
                  {selectedDoodle === "animal" && <DoodleAnimal size={36} />}
                  {selectedDoodle === "heart" && <DoodleHeart size={22} />}
                  {selectedDoodle === "cloud" && <DoodleCloud size={38} />}
                  {selectedDoodle === "sun" && <DoodleSun size={30} />}
                  {selectedDoodle === "moon" && <DoodleMoon size={24} />}
                  {selectedDoodle === "star" && <DoodleStar size={26} />}
                  {selectedDoodle === "cup" && <DoodleCup size={26} />}
                </div>
              );
            })()}
            <div className="flex flex-col items-center gap-6">
              {/* Mini wheel — 200px N4 layout. mb-4 加在 flex gap-6 之外让
                  wheel ↓ presence 间距 effective 40px (vs 其它元素 24px) — wheel
                  在 N4 没 header 时承担"标题"语义, 需要额外 breathing room 突出。 */}
              <svg
                viewBox={`${-MAX_RADIUS - VBOX_PAD} ${-MAX_RADIUS - VBOX_PAD} ${
                  (MAX_RADIUS + VBOX_PAD) * 2
                } ${(MAX_RADIUS + VBOX_PAD) * 2}`}
                className="h-auto w-full max-w-[200px] mb-4"
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
                    避免跟 main wheel 的 sec-clip-i 冲突。 */}
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

              {/* Presence — main voice, handwritten. text-3xl md:text-4xl N4 layout */}
              <p className="font-zh-hand text-center text-3xl leading-snug text-zinc-900 md:text-4xl">
                {presence.text}
              </p>

              {/* Commitment — optional, sits under presence as a soft echo.
                  N4 派删 "— " prefix (sign-off date 已用 dash, 重复). */}
              {commitment && (
                <p className="font-zh-hand text-center text-xl leading-relaxed text-zinc-500 md:text-2xl">
                  {commitment.text}
                </p>
              )}

              {/* Date sign-off (N4 派) — 整张卡的 "署日期", 跟 commitment 的 dash
                  同款, 右对齐, 像信件 sign-off。日期格式 `YYYY.MM.DD` 点分隔, 简洁。 */}
              <p className="font-zh-hand w-full pr-2 text-right text-base text-zinc-400">
                — {(() => {
                  const d = new Date(presence.at);
                  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
                })()}
              </p>

              {/* Watermark — Latin handwriting echoes the Chinese script above. */}
              <p className="font-en-hand text-sm tracking-wide text-zinc-400">
                wheel of life
              </p>
            </div>
          </article>

          {/* Phase 1.6 子任务 C — 统一"存到相册"按钮 (Web Share API + download
              fallback)。reframe v4 (2026-05-09): 按钮放在 framing 上面 — 主 CTA
              直接接 卡片, framing 一行 hint 在按钮下方作 alternative; 现在 "也"
              指代 "除了存到相册外" 有 referent, 逻辑通顺。 */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              disabled={sharing}
              className="rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm text-zinc-700 shadow-sm transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-60"
            >
              {sharing ? "生成中…" : "存到相册"}
            </button>
            {shareError && (
              <p
                className="text-xs text-red-500"
                role="alert"
                aria-live="polite"
              >
                {shareError}
              </p>
            )}
          </div>

          {/* Affordance — 按钮下方一行 essence 阐述 (不是 alt action)。
              v4 文案 reframe: 删"发给别人"语义, 主推 "留给以后的自己" 跟 Vision
              末段"半年后某个周日"对位 / 教练 stealth 用 "或..." 平等并列。 */}
          <p className="text-sm text-zinc-500">
            留给以后的自己，或跟教练一起探索
          </p>

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
      <main
        className="mx-auto flex max-w-6xl flex-col gap-10 px-6 pb-6 md:flex-row md:items-start md:gap-12 md:py-16"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
      >
        {/* Left: wheel */}
        <section
          className={[
            "flex w-full flex-col items-center",
            "md:w-1/2 md:sticky md:top-10",
            isEval ? "md:sticky md:top-10 md:z-10 md:bg-zinc-50/95 md:backdrop-blur" : "",
            "md:bg-transparent md:pt-0 md:pb-0 md:backdrop-blur-none",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <h2 className="mb-6 self-start text-sm font-medium tracking-wide text-zinc-500">
            我人生的马车
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
              <g transform={`translate(0 ${(bob + obstacleBob).toFixed(3)})`}>
                {outlineCircle()}
                {!isRunning &&
                  DIMENSIONS.map((dim, i) => {
                    const angle = -90 + i * SECTOR_DEG + SECTOR_DEG / 2;
                    const rad = (angle * Math.PI) / 180;
                    const lx = Math.cos(rad) * LABEL_RADIUS;
                    const ly = Math.sin(rad) * LABEL_RADIUS;
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
                        fontWeight={400}
                        style={{ transition: "font-weight 0.5s, opacity 0.4s" }}
                      >
                        {dim.name}
                      </text>
                    );
                  })}
              </g>

              <g transform={`translate(0 ${(bob + obstacleBob).toFixed(3)})`}>
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
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className={
                        evalPhase === "connect"
                          ? "outline-connect"
                          : evalPhase === "shape"
                          ? "outline-flash"
                          : "outline-stable"
                      }
                      opacity={evalPhase === "connect" ? 1 : 0.95}
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

              {showGround && (() => {
                // Phase 1.5t — ground render reuse component-scope
                // obstaclesData + groundCurveDeviation (用于 wheel obstacleBob).
                const groundCurveY = (x: number) =>
                  GROUND_Y + groundCurveDeviation(x);
                const groundX0 = vbox.x + 4;
                const groundXEnd = vbox.x + vbox.w - 4;
                const samples = 80;
                const points = Array.from({ length: samples + 1 }, (_, i) => {
                  const x =
                    groundX0 + ((groundXEnd - groundX0) * i) / samples;
                  return `${x.toFixed(2)},${groundCurveY(x).toFixed(2)}`;
                });
                return (
                  <g>
                    <polyline
                      points={points.join(" ")}
                      stroke="#a1a1aa"
                      strokeWidth={1}
                      fill="none"
                    />
                    {Array.from({ length: TICK_COUNT }, (_, i) => {
                      const x = vbox.x + 4 + i * TICK_SPACING - groundOffset;
                      const yBase = groundCurveY(x);
                      return (
                        <line
                          key={i}
                          x1={x}
                          y1={yBase + 2}
                          x2={x - 8}
                          y2={yBase + 12}
                          stroke="#d4d4d8"
                          strokeWidth={1}
                        />
                      );
                    })}
                  </g>
                );
              })()}
            </svg>
          </div>
        </section>

        {/* Right: framing / running / reflect / presence */}
        <section className="w-full md:w-1/2">
          {isEval ? (
            <>
              <header className="mb-6">
                {/* Phase 2 v2 — h1 + details 恢复 (liushu: details 是给不熟 wheel
                    of life 的 user progressive disclosure 入口, 应露出但不抢眼;
                    h1 brand "生命之轮" 也保留, page 没产品名 全是马车隐喻 不对).
                    紧凑视觉: details summary 改 "不熟悉？看完整说明" (explicit 指
                    给不懂的 user) + text-xs + zinc-400 muted, 比之前更克制 . */}
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                  生命之轮
                </h1>
                <p className="mt-3 text-base leading-relaxed text-zinc-600">
                  {/* mobile (~380px) text-base 24 字会 wrap "车轮。" 单独到下行
                      显得密 (liushu 截图反馈). 缩短到 18 字让 mobile 1 行,
                      "你这辆人生马车的" 隐喻 anchor 已被 wheel 上方 sticky h2
                      "我人生的马车" carry, framing 不需重复. */}
                  圆心 = 0，外缘 = 10。画此刻你的车轮。
                </p>
                <details className="mt-2 text-xs leading-relaxed text-zinc-400">
                  <summary className="cursor-pointer list-none underline-offset-2 hover:text-zinc-600 hover:underline [&::-webkit-details-marker]:hidden">
                    不熟悉？看完整说明
                  </summary>
                  <div className="mt-2 space-y-2 text-zinc-500">
                    <p>
                      生命之轮的 8 个区块代表你生命中的 8 个不同领域。请为你此时此刻这些领域的满意程度打分——圆心代表 0
                      分，外缘代表 10 分。分数越低，外缘越靠近圆心。通过你的分数，重新画出此刻的生命之轮。
                    </p>
                    <p>
                      生命之轮帮你看到不同领域目前正在如何影响你的生活。想想看：如果你人生的马车就在这一车轮上前进，你的路途会有多平坦
                      / 颠簸？生命之轮还会让我们看到自己想往哪个方向走。
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
                {/* Phase 2 — connect/shape phase hints 删除 (朋友反馈"填完色后
                    最后一行很快变化看不过来"). 这两 phase 自动 < 2s, hint 文字
                    闪一下不可读, "克制" UI 原则下 silent 即可. input + ready
                    保留 (user-driven phases needed cue). */}
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
                    {/* whitespace-nowrap on "感觉到——" 避免微信内嵌 webview 等
                        窄 viewport 把 "——" 单独 wrap 到下一行 (em dash 是
                        line-breakable 字符, 默认 wrap 行为视觉断裂). 整 unit
                        nowrap, 空间不够时整 unit 换下一行 (dash 跟字一起). */}
                    看着这辆马车，我此刻<span className="whitespace-nowrap">感觉到——</span>
                  </p>
                  <input
                    type="text"
                    value={presenceDraft}
                    onChange={handlePresenceChange}
                    onBlur={handlePresenceBlur}
                    onKeyDown={(e) => {
                      // mobile 输入法对勾 (input 类型 iOS 视为 form-submit context,
                      // 工具栏对勾 = blur + 发 keydown Enter, 跟 textarea 不同) +
                      // desktop Enter 触发 commit; 中文 IME composing 时 Enter
                      // 是 confirm composition 不 commit
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleWitnessClick();
                      }
                    }}
                    autoFocus
                    maxLength={PRESENCE_MAX_LEN}
                    placeholder={presencePlaceholder}
                    enterKeyHint="done"
                    className="w-full border-none bg-transparent p-0 text-2xl font-light leading-relaxed text-zinc-900 placeholder:text-zinc-300 focus:outline-none md:text-3xl"
                    aria-label="我此刻感觉到"
                  />
                  <button
                    type="button"
                    onClick={handleWitnessClick}
                    className="fade-rise self-start text-sm text-zinc-700 underline-offset-4 transition-colors hover:text-zinc-900 hover:underline"
                  >
                    我说完了 →
                  </button>
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
                      onKeyDown={(e) => {
                        // mobile 对勾 / desktop Enter 触发 finalize, IME composing 时不触发
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleFinalize();
                        }
                      }}
                      placeholder={commitmentPlaceholder}
                      enterKeyHint="done"
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
