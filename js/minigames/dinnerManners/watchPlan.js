import { createRng } from '../../core/random.js';

// 집주인 시간표 (순수 함수). 방장이 시드만 보내면 모두가 같은 시간표를 만든다.
// 시각 t는 각자 'go'를 받은 순간부터 잰 초라서, 판정은 각자 자기 화면에 보이는 신문 기준이 된다.
//
// looks: [{ kind, lower, from, to }]  lower: 신문이 내려가기 시작, [from, to): 보는 중, to: 다시 올리기 시작
// '다시 보기'는 look 두 개로 들어간다 (두 번째는 덜 올라간 신문에서 다시 내려온다).

const KINDS = ['normal', 'glance', 'doubleTake', 'longStare'];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => x * x * (3 - 2 * x);
const between = (rng, [a, b]) => a + (b - a) * rng();

export function createWatchPlan(seed, cfg) {
  const rng = createRng(seed);
  return { cfg, rng, looks: [], next: between(rng, cfg.firstDelay) };
}

function pickKind(rng, looks) {
  const total = KINDS.reduce((s, k) => s + looks[k].weight, 0);
  let r = rng() * total;
  for (const k of KINDS) {
    r -= looks[k].weight;
    if (r < 0) return k;
  }
  return KINDS[0];
}

/** t초까지 신문을 내리기 시작하는 look을 모두 만들어 둔다 */
function extend(plan, t) {
  const { cfg, rng, looks } = plan;
  while (plan.next <= t) {
    const kind = pickKind(rng, cfg.looks);
    const L = cfg.looks[kind];
    const lower = plan.next;
    let to = lower + cfg.warnTime + between(rng, L.watch);
    looks.push({ kind, lower, from: lower + cfg.warnTime, to });
    if (kind === 'doubleTake') {
      const lower2 = to + between(rng, L.halfRaise);
      to = lower2 + cfg.warnTime + between(rng, L.again);
      looks.push({ kind, lower: lower2, from: lower2 + cfg.warnTime, to });
    }
    plan.next = to + cfg.raiseTime + between(rng, cfg.readTime);
  }
}

/** t초 이전에 내리기 시작한 마지막 look의 번호 (없으면 -1) */
function lastLookAt(plan, t) {
  extend(plan, t);
  let i = plan.looks.length - 1;
  while (i >= 0 && plan.looks[i].lower > t) i--;
  return i;
}

/** i번째 look 기준 t초의 신문 내려간 정도 (0: 얼굴을 가림, 1: 다 내려감) */
function downOf(plan, i, t) {
  const { cfg, looks } = plan;
  const lk = looks[i];
  const prev = looks[i - 1];
  // 앞 look에서 신문이 다 올라가기 전에 다시 내렸다면 그 높이에서 시작
  const start = prev && lk.lower - prev.to < cfg.raiseTime ? downOf(plan, i - 1, lk.lower) : 0;
  const lowered = (u) => start + (1 - start) * ease(clamp01((u - lk.lower) / cfg.lowerTime));
  if (t < lk.to) return lowered(t);
  return lowered(lk.to) * (1 - ease(clamp01((t - lk.to) / cfg.raiseTime)));
}

export function paperDown(plan, t) {
  const i = lastLookAt(plan, t);
  return i < 0 ? 0 : downOf(plan, i, t);
}

export function isWatching(plan, t) {
  const i = lastLookAt(plan, t);
  return i >= 0 && t >= plan.looks[i].from && t < plan.looks[i].to;
}

/** [a, b] 동안 집주인이 처음 보고 있던 시각. 안 봤으면 null (동작 시작~지금 구간으로 걸렸는지 확인) */
export function firstWatchIn(plan, a, b) {
  extend(plan, b);
  let hit = null;
  for (let i = plan.looks.length - 1; i >= 0; i--) {
    const lk = plan.looks[i];
    if (lk.to <= a) break; // 앞쪽 look은 모두 a 전에 끝났다
    if (lk.from <= b && lk.to > a) hit = Math.max(a, lk.from);
  }
  return hit;
}
