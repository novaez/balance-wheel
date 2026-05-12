// mulberry32 + hashSeed — 跟 page.tsx 同源 (Phase 1.5g sediment). 抽出独立
// 文件让 selectMetaphor / usePhysics / adapters 都能 import 不复制实现.

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...nums: number[]): number {
  let h = 0x9e3779b9 | 0;
  for (const n of nums) {
    h ^= n | 0;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
  }
  return h >>> 0;
}
