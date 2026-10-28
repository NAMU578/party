// 분류 작업 규칙·시간표 테스트: node tests/sortingLine.test.mjs
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import {
  ART_KINDS,
  BURN,
  DEVICE_KINDS,
  PASS,
  applyAction,
  canAct,
  correctAction,
  makeItems,
  newSheet,
  pickLosers,
  stationLayout,
} from '../js/minigames/sortingLine/sortingRules.js';
import { lookBlend, phaseAt, pressLift, turnTimes } from '../js/minigames/sortingLine/sortTimeline.js';

const CFG = CONFIG.sortingLine;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);

// ---- 물건: 같은 시드면 같은 목록, 사람마다 다른 목록 ----
const a = makeItems(42, 300);
assert.deepEqual(makeItems(42, 300), a);
assert.notDeepEqual(makeItems(43, 300), a);
const arts = a.filter((it) => it.art).length;
assert.ok(arts > 100 && arts < 200, `예술품 비율이 반쯤이어야 함 (${arts}/300)`);
for (const it of a) assert.ok((it.art ? ART_KINDS : DEVICE_KINDS).includes(it.kind));
assert.equal(correctAction({ art: true }), BURN);
assert.equal(correctAction({ art: false }), PASS);

// ---- 판정: 맞으면 +1, 틀리면 0.5초 걸림, 순서·시간 확인 ----
const items = [{ art: true }, { art: false }, { art: true }, { art: false }];
const s = newSheet();
assert.deepEqual(applyAction(s, items, 0, BURN, 0.5, CFG), { correct: true });
assert.equal(s.score, 1);
assert.equal(s.lastScoreT, 0.5);
assert.equal(applyAction(s, items, 2, BURN, 0.6, CFG), null, '순서를 건너뛸 수 없음');
assert.deepEqual(applyAction(s, items, 1, BURN, 0.8, CFG), { correct: false }, '장치를 버리면 오답');
assert.equal(s.score, 1);
near(s.jamUntil, 0.8 + CFG.wrongJam, '오답 후 걸리는 시각');
assert.equal(canAct(s, 1.0, CFG), false, '걸려 있는 동안은 입력 불가');
assert.equal(applyAction(s, items, 2, BURN, 1.0, CFG), null, '걸려 있는 동안 온 입력은 무시');
assert.equal(canAct(s, 1.3, CFG), true);
assert.deepEqual(applyAction(s, items, 2, BURN, 1.3, CFG), { correct: true });
assert.equal(s.score, 2);
assert.equal(s.lastScoreT, 1.3, '동점 비교용 시각은 마지막으로 맞힌 시각');
assert.equal(applyAction(s, items, 3, PASS, CFG.playTime + 0.5, CFG), null, '작업 시간이 끝난 뒤');
assert.equal(applyAction(s, items, 3, PASS, NaN, CFG), null);
assert.equal(applyAction(s, items, 3, 'x', 2, CFG), null);
assert.equal(canAct(newSheet(), CFG.playTime, CFG), false, '20초가 되는 순간부터 입력 불가');
assert.equal(canAct(newSheet(), -0.01, CFG), false, '시작 전 입력 불가');

// ---- 꼴찌: 가장 낮은 점수, 동점이면 늦게 도달한 사람, 시각까지 같으면 함께 ----
const e = (id, score, lastScoreT = null) => ({ id, score, lastScoreT });
assert.deepEqual(pickLosers([e('A', 10, 15), e('B', 10, 19), e('C', 12, 18)]), ['B']);
assert.deepEqual(pickLosers([e('A', 10, 15), e('B', 10, 15), e('C', 12, 18)]), ['A', 'B']);
assert.deepEqual(pickLosers([e('A', 0), e('B', 0), e('C', 3, 5)]), ['A', 'B'], '0점끼리는 비교할 시각이 없어 함께');
assert.deepEqual(pickLosers([e('A', 0), e('B', 1, 19.9)]), ['A']);
assert.deepEqual(pickLosers([e('A', 7, 3)]), ['A']);
assert.deepEqual(pickLosers([]), []);

// ---- 배치: 소각로를 바라보고, 이웃 작업대끼리 겹치지 않음 ----
const maxPlayers = Math.max(...CONFIG.lobby.maxPlayersOptions);
const footprint = { left: CFG.beltIn + CFG.hatchWidth, right: CFG.beltOut + CFG.hatchWidth, depth: 1.0 };
const corners = (st) =>
  [-footprint.left, footprint.right].flatMap((r) =>
    [-footprint.depth / 2, footprint.depth / 2].map((u) => [
      st.x + st.right[0] * r + st.out[0] * u,
      st.z + st.right[1] * r + st.out[1] * u,
    ]),
  );
const inside = (st, [px, pz], margin) => {
  const dx = px - st.x;
  const dz = pz - st.z;
  const r = dx * st.right[0] + dz * st.right[1];
  const u = dx * st.out[0] + dz * st.out[1];
  return r > -footprint.left - margin && r < footprint.right + margin && Math.abs(u) < footprint.depth / 2 + margin;
};
for (let n = 1; n <= maxPlayers; n++) {
  const L = stationLayout(n, CFG);
  assert.equal(L.stations.length, n);
  assert.ok(L.radius >= CFG.ringRadiusMin && L.radius <= CFG.ringRadiusMax);
  for (const st of L.stations) {
    near(Math.hypot(st.x, st.z), L.radius, '벨트 가운데는 원 위');
    near(Math.hypot(st.standX, st.standZ), L.radius + CFG.standOut, '서는 곳은 벨트 바깥');
    near(Math.sin(st.facing), -st.out[0], '소각로를 바라봄 x');
    near(Math.cos(st.facing), -st.out[1], '소각로를 바라봄 z');
    near(st.right[0] * st.out[0] + st.right[1] * st.out[1], 0, '벨트 방향은 바깥 방향과 수직');
    // 소각로를 바라볼 때 오른쪽: 바라보는 방향 f에 대해 (-f.z, f.x)
    near(st.right[0], -Math.cos(st.facing), '오른쪽 x');
    near(st.right[1], Math.sin(st.facing), '오른쪽 z');
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      for (const c of corners(L.stations[i])) {
        assert.ok(!inside(L.stations[j], c, 0.15), `${n}명: 작업대 ${i}와 ${j}가 겹침`);
      }
    }
  }
}

// ---- 시간표 ----
const T = turnTimes(CFG);
near(T.startAt, CFG.readyTime, '작업 시작');
near(T.stopAt, CFG.readyTime + 20, '20초 작업');
near(T.revealAt, T.stopAt + CFG.revealDelay, '점수 공개');
assert.equal(phaseAt(T.startAt - 0.01, T), 'ready');
assert.equal(phaseAt(T.startAt, T), 'play');
assert.equal(phaseAt(T.stopAt - 0.01, T), 'play');
assert.equal(phaseAt(T.stopAt, T), 'stop');

near(pressLift(0, CFG), 1, '공개 직후 압착기는 위');
near(pressLift(CFG.slamDelay - CFG.pressDropTime, CFG), 1, '떨어지기 직전');
near(pressLift(CFG.slamDelay - CFG.pressDropTime / 2, CFG), 0.75, '가속하며 떨어짐');
near(pressLift(CFG.slamDelay, CFG), 0, '바닥');
near(pressLift(CFG.slamDelay + 5, CFG), 0, '내려온 채로 유지');

near(lookBlend(CFG.lookDelay, CFG), 0, '돌기 전');
near(lookBlend(CFG.lookDelay + CFG.lookTime, CFG), 1, '꼴찌를 봄');
near(lookBlend(CFG.lookBackDelay, CFG), 1, '돌아오기 전');
near(lookBlend(CFG.lookBackDelay + CFG.lookTime, CFG), 0, '내 작업대로 돌아옴');
// 연출 순서: 카메라가 다 돈 뒤 압착기가 떨어지고, 깔리는 것을 본 뒤 돌아오고, 다 돌아온 뒤 다음 턴
assert.ok(CFG.lookDelay + CFG.lookTime <= CFG.slamDelay - CFG.pressDropTime);
assert.ok(CFG.lookBackDelay >= CFG.slamDelay + 1);
assert.ok(CFG.nextTurnDelay >= CFG.lookBackDelay + CFG.lookTime);

console.log('분류 작업 테스트 모두 통과');
