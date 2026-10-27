import { randInt, sample } from '../../core/random.js';

// 기호 타일 미니게임의 순수 규칙 (화면·통신과 무관해서 Node에서도 테스트 가능).

export const SYMBOL_COUNT = 3; // 0: 원, 1: 엑스, 2: 네모

export function gridLayout({ cols, rows, tileSize, tileGap }) {
  const pitch = tileSize + tileGap;
  const width = cols * pitch;
  const depth = rows * pitch;
  return { cols, rows, pitch, tileSize, width, depth, x0: -width / 2, z0: -depth / 2 };
}

export function tileCountOf(layout) {
  return layout.cols * layout.rows;
}

export function cellCenter(layout, index) {
  const c = index % layout.cols;
  const r = Math.floor(index / layout.cols);
  return { x: layout.x0 + (c + 0.5) * layout.pitch, z: layout.z0 + (r + 0.5) * layout.pitch };
}

/** 위치가 속한 칸 번호. 격자 밖이면 -1 */
export function cellIndexAt(layout, x, z) {
  const c = Math.floor((x - layout.x0) / layout.pitch);
  const r = Math.floor((z - layout.z0) / layout.pitch);
  if (c < 0 || r < 0 || c >= layout.cols || r >= layout.rows) return -1;
  return r * layout.cols + c;
}

export function gridBounds(layout, margin) {
  return {
    minX: layout.x0 + margin,
    maxX: layout.x0 + layout.width - margin,
    minZ: layout.z0 + margin,
    maxZ: layout.z0 + layout.depth - margin,
  };
}

export function countAlive(tileAlive) {
  return tileAlive.reduce((n, alive) => n + (alive ? 1 : 0), 0);
}

/**
 * 한 라운드 결과를 미리 정한다 (방장 전용).
 * - 벽 기호 1개, 남은 타일마다 기호 1개를 무작위로 정한다.
 * - 벽 기호와 같은 타일만 살아남고 나머지는 떨어진다.
 * - 떨어진 타일 중 removePerRound개는 다시 올라오지 않는다.
 * - 남은 타일이 guaranteeSafeAbove보다 많으면 살아남는 타일이 최소 1칸 있도록 보정한다.
 *   (그 이하로 줄면 보정하지 않아서 타일이 모두 사라질 수 있다 → 게임이 반드시 끝난다)
 * @param {boolean[]} tileAlive 영구 제거되지 않은 타일 표시
 * @returns {{ wall:number, symbols:number[], falling:number[], removed:number[] }} symbols는 제거된 칸이 -1
 */
export function planRound(tileAlive, rng, { removePerRound, guaranteeSafeAbove }) {
  const active = [];
  tileAlive.forEach((alive, i) => {
    if (alive) active.push(i);
  });
  const wall = randInt(rng, SYMBOL_COUNT);
  const symbols = tileAlive.map(() => -1);
  for (const i of active) symbols[i] = randInt(rng, SYMBOL_COUNT);
  if (active.length > guaranteeSafeAbove && !active.some((i) => symbols[i] === wall)) {
    symbols[active[randInt(rng, active.length)]] = wall;
  }
  const falling = active.filter((i) => symbols[i] !== wall);
  const removed = sample(rng, falling, removePerRound).sort((a, b) => a - b);
  return { wall, symbols, falling, removed };
}

export function applyRemoval(tileAlive, removed) {
  const next = tileAlive.slice();
  for (const i of removed) next[i] = false;
  return next;
}

/** 시작 위치: 서로 최대한 멀리 떨어진 칸을 고른다. */
export function pickSpawnCells(layout, count, rng) {
  const n = tileCountOf(layout);
  if (count <= 0) return [];
  const chosen = [randInt(rng, n)];
  while (chosen.length < Math.min(count, n)) {
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < n; i++) {
      if (chosen.includes(i)) continue;
      const a = cellCenter(layout, i);
      let minD = Infinity;
      for (const j of chosen) {
        const b = cellCenter(layout, j);
        minD = Math.min(minD, (a.x - b.x) ** 2 + (a.z - b.z) ** 2);
      }
      const score = minD + rng() * 0.5; // 거리가 같으면 무작위
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    chosen.push(best);
  }
  return chosen;
}
