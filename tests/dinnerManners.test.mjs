// 식사 예절 규칙·시간표 테스트: node tests/dinnerManners.test.mjs
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { createRng } from '../js/core/random.js';
import {
  EAT,
  STAB,
  applyAct,
  canStart,
  isFinished,
  newDiner,
  rankGroups,
  rollStab,
  seatLayout,
} from '../js/minigames/dinnerManners/dinnerRules.js';
import { createWatchPlan, firstWatchIn, isWatching, paperDown } from '../js/minigames/dinnerManners/watchPlan.js';

const CFG = CONFIG.dinnerManners;

// ---- 찍기: 1~3개, 약 20% 헛손질, 포크 한계 ----
const rng = createRng(1);
const counts = new Map();
for (let i = 0; i < 4000; i++) {
  const r = rollStab(rng, { plate: 100, fork: 0 }, CFG);
  counts.set(r.n, (counts.get(r.n) ?? 0) + 1);
  if (r.n === 0) assert.equal(r.why, 'miss');
  else assert.ok(r.n >= CFG.stabMin && r.n <= CFG.stabMax);
}
const missRate = counts.get(0) / 4000;
assert.ok(missRate > 0.17 && missRate < 0.23, `헛손질 비율이 20% 근처여야 함 (${missRate})`);
for (let n = CFG.stabMin; n <= CFG.stabMax; n++) assert.ok(counts.get(n) > 800, `${n}개도 고르게 나와야 함`);
assert.deepEqual(rollStab(rng, { plate: 50, fork: CFG.forkCapacity }, CFG), { n: 0, why: 'full' });
assert.equal(rollStab(rng, { plate: 0, fork: 3 }, CFG), null, '접시가 비면 찍을 수 없음');
for (let i = 0; i < 200; i++) {
  const r = rollStab(rng, { plate: 1, fork: CFG.forkCapacity - 1 }, CFG);
  assert.ok(r.n <= 1, '남은 콩·포크 자리보다 많이 꽂히지 않음');
}

// ---- 동작 적용: 순서·개수·동작 시간 확인 ----
const d = newDiner(CFG);
assert.equal(d.plate, CFG.peasPerPlate);
assert.ok(applyAct(d, STAB, 3, 1.0, CFG));
assert.equal(d.plate, CFG.peasPerPlate - 3);
assert.equal(d.fork, 3);
assert.equal(canStart(d, 1.0 + CFG.stabTime / 2), false, '동작 중에는 새 동작 불가');
assert.equal(applyAct(d, STAB, 1, 1.1, CFG), null, '동작 중에 온 입력은 무시');
assert.equal(applyAct(d, EAT, 2, 1.0 + CFG.stabTime, CFG), null, '포크에 있는 개수 전부를 먹어야 함');
assert.ok(applyAct(d, EAT, 3, 1.0 + CFG.stabTime, CFG));
assert.equal(d.fork, 0);
assert.equal(applyAct(d, EAT, 0, 5, CFG), null, '빈 포크는 먹을 수 없음');
assert.ok(applyAct(d, STAB, 0, 5, CFG), '헛손질도 동작으로 친다');
assert.equal(d.busyUntil, 5 + CFG.stabTime);
assert.equal(applyAct(d, STAB, 4, 9, CFG), null, '한 번에 최대 개수 초과');
assert.equal(applyAct(d, 'x', 1, 9, CFG), null);
assert.equal(applyAct(d, STAB, 1, NaN, CFG), null);
const full = { plate: 10, fork: CFG.forkCapacity - 1, busyUntil: 0 };
assert.equal(applyAct(full, STAB, 2, 1, CFG), null, '포크 한계 초과');

// 다 먹기: 마지막 한 입을 다 삼켜야 끝
const last = { plate: 2, fork: 0, busyUntil: 0 };
applyAct(last, STAB, 2, 0, CFG);
applyAct(last, EAT, 2, CFG.stabTime, CFG);
assert.equal(isFinished(last, CFG.stabTime + CFG.eatTime / 2), false);
assert.equal(isFinished(last, CFG.stabTime + CFG.eatTime), true);
assert.equal(isFinished(newDiner(CFG), 100), false);

// 120개를 끝까지 먹을 수 있어야 함
const all = newDiner(CFG);
let t = 0;
const r2 = createRng(9);
for (let step = 0; step < 2000 && !isFinished(all, t); step++) {
  const act = all.fork >= CFG.forkCapacity || all.plate === 0 ? EAT : STAB;
  const n = act === EAT ? all.fork : rollStab(r2, all, CFG).n;
  assert.ok(applyAct(all, act, n, t, CFG));
  t = all.busyUntil;
}
assert.ok(isFinished(all, t), '접시를 다 비울 수 있음');

// ---- 순위: 다 먹은 사람(빠른 순) → 죽은 사람(늦게 죽을수록 위), 같은 시각은 공동 ----
const e = (id, tt) => ({ id, t: tt });
assert.deepEqual(rankGroups([e('A', 50), e('B', 40)], [e('C', 10), e('D', 30)]), [['B'], ['A'], ['D'], ['C']]);
assert.deepEqual(rankGroups([], [e('C', 12.5), e('D', 12.5), e('E', 3)]), [['C', 'D'], ['E']], '같은 순간 걸리면 공동');
assert.deepEqual(rankGroups([e('A', 9)], []), [['A']]);

// ---- 좌석: 양쪽 번갈아, 접시는 식탁 위, 이웃과 겹치지 않음 ----
for (let n = 1; n <= 8; n++) {
  const { half, seats, hostZ } = seatLayout(n, CFG);
  assert.equal(seats.length, n);
  assert.ok(hostZ < -half, '집주인은 식탁 머리 너머');
  for (const s of seats) {
    assert.ok(Math.abs(s.z) < half, '좌석이 식탁 길이 안');
    assert.ok(Math.abs(s.plateX) < 0.8 && Math.sign(s.plateX) === s.side, '접시는 자기 쪽 식탁 위');
    assert.ok(Math.abs(s.x) > 0.8, '의자는 식탁 밖');
  }
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const dist = Math.hypot(seats[i].x - seats[j].x, seats[i].z - seats[j].z);
      assert.ok(dist >= CFG.seatSpacing - 1e-9, `좌석 ${i}, ${j}가 너무 가까움`);
    }
}
assert.deepEqual(seatLayout(4, CFG).seats.map((s) => s.side), [-1, 1, -1, 1]);

// ---- 시간표: 같은 시드면 같고, 신문이 내려가기 시작한 뒤 warnTime이 지나야 '보는 중' ----
const p1 = createWatchPlan(77, CFG);
const p2 = createWatchPlan(77, CFG);
for (let s = 0; s < 300; s += 0.37) {
  assert.equal(paperDown(p1, s), paperDown(p2, s));
  assert.equal(isWatching(p1, s), isWatching(p2, s));
}
const looks = p1.looks;
assert.ok(looks.length > 40, '300초 동안 여러 번 쳐다봄');
assert.ok(looks[0].lower >= CFG.firstDelay[0] && looks[0].lower <= CFG.firstDelay[1]);
const kinds = new Set(looks.map((l) => l.kind));
for (const k of Object.keys(CFG.looks)) assert.ok(kinds.has(k), `${k} 패턴이 나와야 함`);
for (let i = 0; i < looks.length; i++) {
  const lk = looks[i];
  near(lk.from - lk.lower, CFG.warnTime, '예고 시간');
  assert.ok(lk.to > lk.from);
  assert.equal(isWatching(p1, lk.lower + CFG.warnTime * 0.5), false, '예고 시간에는 아직 안 봄');
  assert.equal(isWatching(p1, lk.from + 0.001), true);
  assert.equal(isWatching(p1, lk.to + 0.001), false, '올리기 시작하면 안 봄');
  assert.ok(paperDown(p1, lk.lower + 0.03) > paperDown(p1, lk.lower - 1e-6) || paperDown(p1, lk.lower) > 0.9, '내려가기 시작');
  assert.ok(paperDown(p1, lk.to - 1e-6) > 0.99, '보는 동안 신문은 다 내려가 있음');
  if (i > 0) assert.ok(lk.lower > looks[i - 1].to, 'look은 겹치지 않음');
}
// 다시 보기: 두 번째 look은 덜 올라간 신문에서 시작
const dt = looks.findIndex((l, i) => l.kind === 'doubleTake' && looks[i + 1]?.kind === 'doubleTake');
const second = looks[dt + 1];
const mid = paperDown(p1, second.lower);
assert.ok(mid > 0.05 && mid < 0.99, `다시 보기 직전 신문은 덜 올라가 있음 (${mid})`);
assert.equal(paperDown(p1, looks[0].lower - 0.5), 0, '처음엔 신문으로 얼굴을 가림');

// ---- 걸림 판정: 동작 [시작, 끝]이 보는 시간과 겹치면 처음 겹친 시각 ----
const lk = looks.find((l, i) => i > 2 && l.lower - looks[i - 1].to > 1); // 앞 look과 충분히 떨어진 것
assert.equal(firstWatchIn(p1, lk.lower - 0.5, lk.lower - 0.1), null, '보기 전에 끝난 동작은 안전');
assert.equal(firstWatchIn(p1, lk.lower - 0.2, lk.lower + CFG.warnTime * 0.9), null, '예고 시간 안에 끝나면 안전');
near(firstWatchIn(p1, lk.lower - 0.2, lk.lower + 0.3), lk.from, '동작 중에 보기 시작하면 그 순간 걸림');
near(firstWatchIn(p1, lk.from + 0.05, lk.from + 0.4), lk.from + 0.05, '보고 있을 때 시작하면 바로 걸림');
assert.equal(firstWatchIn(p1, lk.to + 0.01, lk.to + 0.3), null, '신문을 올리기 시작한 뒤는 안전');
const wide = firstWatchIn(p1, looks[1].lower - 0.1, looks[5].to);
near(wide, looks[1].from, '여러 look에 걸치면 가장 이른 시각');

console.log('dinnerManners tests ok');

function near(a, b, msg) {
  assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);
}
