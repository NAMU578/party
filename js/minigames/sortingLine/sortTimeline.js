// 분류 작업 시간표 (순수 함수). t: 턴 시작 후 초, te: 점수 공개 후 초

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => x * x * (3 - 2 * x);

export function turnTimes(cfg) {
  const startAt = cfg.readyTime;
  const stopAt = startAt + cfg.playTime;
  return { startAt, stopAt, revealAt: stopAt + cfg.revealDelay };
}

/** 'ready'(물건이 채워지는 중) → 'play'(작업) → 'stop'(멈춤, 빈 벨트만 돎) */
export function phaseAt(t, T) {
  if (t < T.startAt) return 'ready';
  return t < T.stopAt ? 'play' : 'stop';
}

/** 압착기 높이 비율: 1(다 올라감) → 0(바닥). 바닥에 닿기 pressDropTime초 전부터 가속하며 떨어진다 */
export function pressLift(te, cfg) {
  const u = (te - (cfg.slamDelay - cfg.pressDropTime)) / cfg.pressDropTime;
  if (u <= 0) return 1;
  return u >= 1 ? 0 : 1 - u * u;
}

/** 카메라가 꼴찌 쪽을 보는 정도: 0(내 작업대) → 1(꼴찌) → 0 */
export function lookBlend(te, cfg) {
  const toLoser = ease(clamp01((te - cfg.lookDelay) / cfg.lookTime));
  const back = ease(clamp01((te - cfg.lookBackDelay) / cfg.lookTime));
  return toLoser * (1 - back);
}
