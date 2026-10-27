// 열차 피하기 규칙·시간표 테스트: node tests/trainDodge.test.mjs
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { createRng } from '../js/core/random.js';
import {
  alcoveIndexAt,
  alcoveRect,
  clampToArea,
  corridorLayout,
  enteredAlcoveAt,
  greenCountForTurn,
  inCorridor,
  isHitByTrain,
  pickGreens,
  spawnSpots,
} from '../js/minigames/trainDodge/trainDodgeRules.js';
import {
  isAlcoveOpen,
  isLampGreen,
  ledPhase,
  pistonLift,
  shakeAt,
  shutterOpenness,
  trainFrontZ,
  turnTimes,
} from '../js/minigames/trainDodge/turnTimeline.js';

const CFG = CONFIG.trainDodge;
const R = CONFIG.player.radius;
const L = corridorLayout(CFG);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);

// ---- 시간표: 확정 기획의 시각과 같은지 ----
const T = turnTimes(CFG);
const expected = {
  openAt: 2, revealAt: 3, enterAt: 3.3, arriveAt: 7, bottomAt: 8, tailOutAt: 10.8,
  shakeEndAt: 12.1, shutterCloseAt: 12.6, closeAt: 13.3, crushAt: 13.6, period: 14.6, speed: 14, trainLength: 39.2,
};
for (const [k, v] of Object.entries(expected)) near(T[k], v, k);

// 열차: 7초에 셔터, 8초에 아래 끝, 10.8초에 꼬리가 아래 끝
near(trainFrontZ(7, T, L.zTop), L.zTop, '셔터 도착');
near(trainFrontZ(8, T, L.zTop), L.zBottom, '아래 끝 도착');
near(trainFrontZ(10.8, T, L.zTop) - T.trainLength, L.zBottom, '꼬리 통과');

// 셔터
near(shutterOpenness(-1, T), 0, '턴 전');
near(shutterOpenness(1.99, T), 0, '열리기 전');
near(shutterOpenness(2.5, T), 0.5, '여는 중');
near(shutterOpenness(3, T), 1, '다 열림');
near(shutterOpenness(12.6, T), 1, '닫히기 직전');
near(shutterOpenness(13.1, T), 0.5, '닫는 중');
near(shutterOpenness(13.6, T), 0, '다 닫힘');
near(shutterOpenness(14.5, T), 0, '다음 턴 전');

// 피스톤: 빨간 구역은 항상 내려와 있음
for (const t of [0, 3.3, 8, 13.4, 14]) near(pistonLift(t, T, false), 0, `빨간 구역 ${t}`);
near(pistonLift(2.99, T, true), 0, '공개 전');
near(pistonLift(3.15, T, true), 0.5, '올라가는 중');
near(pistonLift(3.3, T, true), 1, '다 올라감');
near(pistonLift(13.3, T, true), 1, '내려오기 직전');
near(pistonLift(13.45, T, true), 0.5, '내려오는 중');
near(pistonLift(13.6, T, true), 0, '바닥');

// 진입 가능 시간과 바닥등
assert.equal(isAlcoveOpen(3.29, T, true), false);
assert.equal(isAlcoveOpen(3.3, T, true), true);
assert.equal(isAlcoveOpen(13.29, T, true), true);
assert.equal(isAlcoveOpen(13.3, T, true), false);
assert.equal(isAlcoveOpen(5, T, false), false);
assert.equal(isLampGreen(2.99, T, true), false);
assert.equal(isLampGreen(3.0, T, true), true);
assert.equal(isLampGreen(13.3, T, true), false);
assert.equal(isLampGreen(5, T, false), false);

// LED: 2초부터 번갈아, 압착과 함께 꺼짐
assert.equal(ledPhase(1.99, T, CFG.ledInterval), -1);
assert.equal(ledPhase(2.0, T, CFG.ledInterval), 0);
assert.equal(ledPhase(2.3, T, CFG.ledInterval), 1);
assert.equal(ledPhase(2.5, T, CFG.ledInterval), 0);
assert.equal(ledPhase(13.6, T, CFG.ledInterval), -1);

// 진동: 2초 시작, 열차가 올 때까지 강해짐, 12.1초 멈춤
assert.equal(shakeAt(1.99, T, CFG), 0);
near(shakeAt(2, T, CFG), CFG.shakeStart, '진동 시작');
for (let t = 2; t < 6.9; t += 0.5) assert.ok(shakeAt(t + 0.1, T, CFG) > shakeAt(t, T, CFG), '점점 강해짐');
near(shakeAt(7, T, CFG), CFG.shakeMax, '열차 도착');
near(shakeAt(10, T, CFG), CFG.shakeMax, '통과 중');
assert.ok(shakeAt(11.5, T, CFG) < CFG.shakeMax);
assert.equal(shakeAt(12.1, T, CFG), 0);

// ---- 통로와 구역 ----
assert.equal(L.count, 8);
assert.deepEqual(L.alcoves.slice(0, 4).map((a) => a.z), [-5.25, -1.75, 1.75, 5.25]);
assert.ok(Math.max(...CONFIG.lobby.maxPlayersOptions) <= L.count, '첫 턴 초록 구역 수(인원수)가 구역 수를 넘으면 안 됨');
L.alcoves.forEach((a, i) => {
  assert.equal(alcoveIndexAt(L, a.side * (L.halfW + L.alcoveDepth / 2), a.z), i);
  assert.equal(alcoveIndexAt(L, a.side * (L.halfW - 0.01), a.z), -1, '통로 쪽은 구역 밖');
  assert.equal(alcoveIndexAt(L, a.side * (L.halfW + 0.3), a.z + 1), -1, '구역 사이 벽');
});
assert.equal(inCorridor(L, L.halfW), true);
assert.equal(inCorridor(L, L.halfW + 0.01), false);

// 1인용: 발 중심이 구역 안(통로 밖)인 두 사람은 몸이 겹칠 수밖에 없다
for (let i = 0; i < L.count; i++) {
  const rc = alcoveRect(L, i, R);
  const xs = [L.halfW + 1e-3, L.halfW + L.alcoveDepth - R].map((x) => x * L.alcoves[i].side);
  assert.ok(xs.every((x) => x >= rc.minX - 1e-9 && x <= rc.maxX + 1e-9));
  let maxD = 0;
  for (const x1 of xs) for (const x2 of xs) for (const z1 of [rc.minZ, rc.maxZ]) for (const z2 of [rc.minZ, rc.maxZ]) {
    maxD = Math.max(maxD, Math.hypot(x1 - x2, z1 - z2));
  }
  assert.ok(maxD < 2 * R, `구역 ${i}에 두 명이 들어갈 수 있음 (${maxD.toFixed(3)})`);
}

// 이동 제한: 닫힌 구역은 못 들어가고, 열린 구역은 들어가며, 뒷벽은 못 뚫음
const right = L.count / 2 + 1; // 오른쪽 위에서 두 번째
const az = L.alcoves[right].z;
const none = () => false;
const only = (k) => (i) => i === k;
let p = clampToArea(L, 2.4, az, none, R);
near(p.x, L.halfW - R, '닫힌 구역 → 통로 벽까지 밀려남');
p = clampToArea(L, 2.4, az, only(right), R);
assert.deepEqual(p, { x: 2.4, z: az }, '열린 구역 안은 그대로');
p = clampToArea(L, 5, az, only(right), R);
near(p.x, L.halfW + L.alcoveDepth - R, '뒷벽에서 멈춤');
p = clampToArea(L, 0.3, -2, none, R);
assert.deepEqual(p, { x: 0.3, z: -2 }, '통로 안은 그대로');
p = clampToArea(L, 0, L.zTop - 3, none, R);
near(p.z, L.zTop + R, '셔터 쪽으로 못 나감');
p = clampToArea(L, 2.3, az + 1, only(right), R);
near(p.x, L.halfW - R, '구역 사이 벽에 막힘');

// 들어가 있는 구역: 통로 벽에 붙어 선 것은 들어간 것이 아님
assert.equal(enteredAlcoveAt(L, L.halfW - R, az, R), -1);
assert.equal(enteredAlcoveAt(L, L.halfW - R + 0.01, az, R), right);
assert.equal(enteredAlcoveAt(L, L.halfW - R + 0.01, az + 1, R), -1);

// 열차 판정
const front = trainFrontZ(7.5, T, L.zTop); // 0
assert.equal(isHitByTrain(L, 0, 0.2, front, T.trainLength, R), true, '앞부분이 몸에 닿음');
assert.equal(isHitByTrain(L, 0, 1, front, T.trainLength, R), false, '아직 안 옴');
assert.equal(isHitByTrain(L, L.halfW + 0.01, 0, front, T.trainLength, R), false, '발 중심이 구역 안이면 생존');
assert.equal(isHitByTrain(L, 0, L.zBottom - R, trainFrontZ(10.79, T, L.zTop), T.trainLength, R), true, '꼬리가 빠지기 직전');
assert.equal(isHitByTrain(L, 0, L.zBottom - R, trainFrontZ(10.9, T, L.zTop), T.trainLength, R), false, '꼬리가 빠진 뒤');
// 통로 맨 아래에 있어도 8초 전에 치임
const tLast = T.arriveAt + (L.zBottom - R - R - L.zTop) / T.speed;
assert.ok(tLast <= T.bottomAt);

// 초록 구역 수: 인원수부터 1개씩, 최소 1개
assert.deepEqual([1, 2, 3, 4, 5].map((k) => greenCountForTurn(4, k, L.count)), [4, 3, 2, 1, 1]);
assert.deepEqual([1, 8, 9].map((k) => greenCountForTurn(8, k, L.count)), [8, 1, 1]);
assert.deepEqual([1, 2].map((k) => greenCountForTurn(1, k, L.count)), [1, 1]);

const rng = createRng(99);
for (let n = 1; n <= L.count; n++) {
  const g = pickGreens(rng, n, L.count);
  assert.equal(new Set(g).size, n);
  assert.ok(g.every((i, k) => i >= 0 && i < L.count && (k === 0 || g[k - 1] < i)));
}

// 시작 위치: 최대 인원까지 서로 겹치지 않고 통로 안
const spots = spawnSpots(L, L.count, createRng(5));
assert.equal(spots.length, L.count);
for (const s of spots) {
  assert.ok(inCorridor(L, s.x) && Math.abs(s.x) <= L.halfW - R && s.z > L.zTop + R && s.z < L.zBottom - R);
  for (const o of spots) if (o !== s) assert.ok(Math.hypot(o.x - s.x, o.z - s.z) >= 2 * R);
}

console.log('열차 피하기 테스트 모두 통과');
