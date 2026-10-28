// 규칙 단위 테스트: node tests/rules.test.mjs
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { createRng } from '../js/core/random.js';
import { combineRoundRows, rankGroupsToResults, ScoreManager } from '../js/core/scoreManager.js';
import { buildMatchOrder } from '../js/core/minigameRegistry.js';
import {
  applyRemoval,
  cellCenter,
  cellIndexAt,
  countAlive,
  gridLayout,
  pickSpawnCells,
  planRound,
} from '../js/minigames/symbolTiles/symbolTilesRules.js';
import { fallingTileY, isTileSolidAt, roundTimes, symbolPhaseAt } from '../js/minigames/symbolTiles/roundTimeline.js';

const CFG = CONFIG.symbolTiles;
const layout = gridLayout(CFG);
const N = layout.cols * layout.rows;

// 칸 ↔ 좌표
for (let i = 0; i < N; i++) {
  const c = cellCenter(layout, i);
  assert.equal(cellIndexAt(layout, c.x, c.z), i);
}
assert.equal(cellIndexAt(layout, layout.x0 - 0.01, 0), -1);

// 라운드 계획: 수천 판을 돌려 규칙이 항상 지켜지는지 확인
const rng = createRng(12345);
let totalRounds = 0;
const GAMES = 3000;
for (let g = 0; g < GAMES; g++) {
  let alive = new Array(N).fill(true);
  let rounds = 0;
  while (countAlive(alive) > 0) {
    rounds += 1;
    assert.ok(rounds < 200, '타일이 줄지 않고 끝나지 않는 경우가 있음');
    const before = countAlive(alive);
    const plan = planRound(alive, rng, CFG);
    // 사라진 칸은 -1, 남은 칸은 0~2
    plan.symbols.forEach((s, i) => assert.equal(s < 0, !alive[i]));
    // 떨어지는 칸 = 벽 기호와 다른 칸
    const expectFalling = plan.symbols.flatMap((s, i) => (s >= 0 && s !== plan.wall ? [i] : []));
    assert.deepEqual(plan.falling, expectFalling);
    // 영구 제거는 떨어지는 칸 중 최대 6개
    assert.equal(plan.removed.length, Math.min(CFG.removePerRound, plan.falling.length));
    for (const i of plan.removed) assert.ok(plan.falling.includes(i));
    assert.equal(new Set(plan.removed).size, plan.removed.length);
    // 타일이 많을 때는 살아남는 칸이 최소 1개
    if (before > CFG.guaranteeSafeAbove) assert.ok(plan.symbols.some((s) => s === plan.wall));
    alive = applyRemoval(alive, plan.removed);
  }
  totalRounds += rounds;
}
console.log(`타일이 모두 사라질 때까지 평균 ${(totalRounds / GAMES).toFixed(1)} 라운드`);

// 시간표
const T = roundTimes(CFG);
assert.deepEqual(T, { decideAt: 3, dropAt: 6, riseAt: 10, endAt: 14 });
assert.deepEqual(symbolPhaseAt(0.1, CFG, T), { mode: 'flicker', blink: 0, on: true });
assert.deepEqual(symbolPhaseAt(0.9, CFG, T), { mode: 'flicker', blink: 0, on: false });
assert.deepEqual(symbolPhaseAt(2.2, CFG, T), { mode: 'flicker', blink: 2, on: true });
assert.equal(symbolPhaseAt(3.0, CFG, T).mode, 'final');
assert.equal(symbolPhaseAt(9.9, CFG, T).mode, 'final');
assert.equal(symbolPhaseAt(10.0, CFG, T).mode, 'off');
const g = CONFIG.player.gravity;
assert.equal(fallingTileY(5.9, T, CFG, false, g), 0);
assert.ok(fallingTileY(7, T, CFG, false, g) < -10);
assert.equal(fallingTileY(9, T, CFG, false, g), -CFG.pitDepth);
assert.equal(fallingTileY(11, T, CFG, true, g), null);
assert.ok(fallingTileY(14, T, CFG, false, g) === 0); // -0도 0으로 취급
assert.ok(fallingTileY(12, T, CFG, false, g) < 0);
assert.equal(isTileSolidAt(5.99, T, true, false), true);
assert.equal(isTileSolidAt(6.0, T, true, false), false);
assert.equal(isTileSolidAt(13.9, T, true, false), false);
assert.equal(isTileSolidAt(14.0, T, true, false), true);
assert.equal(isTileSolidAt(14.0, T, true, true), false);
assert.equal(isTileSolidAt(12.9, T, true, false, CFG.solidLead), false);
assert.equal(isTileSolidAt(13.0, T, true, false, CFG.solidLead), true); // 1초 일찍 밟을 수 있음
assert.ok(fallingTileY(13.0, T, CFG, false, g) === 0, '밟을 수 있게 되는 순간 타일은 다 올라와 있음');
assert.equal(isTileSolidAt(8, T, false, false), true);

// 순위 → 점수 (공동 순위)
assert.deepEqual(rankGroupsToResults([['A'], ['B', 'C'], ['D']], 4), [
  { id: 'A', rank: 1, points: 4 },
  { id: 'B', rank: 2, points: 3 },
  { id: 'C', rank: 2, points: 3 },
  { id: 'D', rank: 4, points: 1 },
]);
assert.deepEqual(rankGroupsToResults([['A', 'B']], 2), [
  { id: 'A', rank: 1, points: 2 },
  { id: 'B', rank: 1, points: 2 },
]);
// 한 라운드 두 판 합산: 획득 점수는 합, 순위는 합계 기준 (동점은 공동 순위)
assert.deepEqual(
  combineRoundRows([
    rankGroupsToResults([['A'], ['B'], ['C']], 3),
    rankGroupsToResults([['B'], ['A', 'C']], 3),
  ]),
  [
    { id: 'A', rank: 1, points: 5 },
    { id: 'B', rank: 1, points: 5 },
    { id: 'C', rank: 3, points: 3 },
  ],
);
// 두 번째 판 전에 나간 사람은 첫 판 점수만
assert.deepEqual(
  combineRoundRows([rankGroupsToResults([['A'], ['B']], 2), rankGroupsToResults([['A']], 1)]),
  [
    { id: 'A', rank: 1, points: 3 },
    { id: 'B', rank: 2, points: 1 },
  ],
);
const sm = new ScoreManager();
sm.reset(['A', 'B', 'C']);
sm.apply([{ id: 'A', points: 3 }, { id: 'B', points: 3 }, { id: 'C', points: 1 }]);
assert.deepEqual(sm.standings().map((s) => [s.id, s.total, s.rank]), [['A', 3, 1], ['B', 3, 1], ['C', 1, 3]]);

// 미니게임 순서: 한 바퀴 안에서는 중복 없음, 경계에서도 연속 중복 없음
const order = buildMatchOrder(12, ['a', 'b', 'c'], createRng(7));
for (let i = 0; i < 12; i += 3) assert.equal(new Set(order.slice(i, i + 3)).size, 3);
for (let i = 1; i < order.length; i++) assert.notEqual(order[i], order[i - 1]);
assert.deepEqual(buildMatchOrder(3, ['solo']), ['solo', 'solo', 'solo']);

// 시작 위치: 서로 다른 칸
const spawn = pickSpawnCells(layout, 8, createRng(3));
assert.equal(new Set(spawn).size, 8);

console.log('규칙 테스트 모두 통과');
