// 한 턴의 시간표. 모든 연출을 '턴 시작 후 경과 시간 t'의 함수로 계산해서
// 프레임이 끊겨도 화면이 시간표와 어긋나지 않게 한다. (기본 설정값 기준 시각)
//
//   0      턴 시작, 모든 구역 닫힘
//   2.0    셔터가 열리기 시작 (1초), 진동 시작·점점 강해짐, 셔터 위 LED 교대 점등
//   3.0    셔터 완전 개방, 초록 구역 공개, 피스톤 상승 (0.3초)
//   3.3    초록 구역에 들어갈 수 있음
//   7.0    열차 앞부분이 셔터에 닿음
//   8.0    열차 앞부분이 통로 아래 끝에 닿음
//   10.8   열차 꼬리가 빠져나감
//   12.1   진동 멈춤
//   12.6   셔터가 닫히기 시작 (1초)
//   13.3   피스톤 하강 시작, 새로 들어갈 수 없음
//   13.6   피스톤이 바닥에 닿음 (압사 판정), 셔터 완전히 닫힘
//   14.6   다음 턴 시작

// 소수 덧셈 오차(10.8 + 2.8 = 13.600000000000001)로 경계 시각이 어긋나지 않게 밀리초 단위로 맞춘다
const ms = (v) => Math.round(v * 1000) / 1000;

export function turnTimes(cfg) {
  const t = turnTimesRaw(cfg);
  for (const k of Object.keys(t)) t[k] = ms(t[k]);
  return t;
}

function turnTimesRaw(cfg) {
  const openAt = cfg.shutterOpenAt;
  const revealAt = openAt + cfg.shutterMoveTime;
  const enterAt = revealAt + cfg.pistonMoveTime;
  const arriveAt = cfg.trainArriveAt;
  const bottomAt = arriveAt + cfg.trainCrossTime;
  const tailOutAt = bottomAt + cfg.trainPassTime;
  const shakeEndAt = tailOutAt + cfg.shakeFadeTime;
  const crushAt = tailOutAt + cfg.crushDelay;
  const closeAt = crushAt - cfg.pistonMoveTime;
  const shutterCloseAt = crushAt - cfg.shutterMoveTime;
  const period = crushAt + cfg.nextTurnDelay;
  const speed = cfg.corridorLength / cfg.trainCrossTime;
  const trainLength = speed * cfg.trainPassTime;
  return { openAt, revealAt, enterAt, arriveAt, bottomAt, tailOutAt, shakeEndAt, shutterCloseAt, closeAt, crushAt, period, speed, trainLength };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** 셔터가 열린 정도 0~1 */
export function shutterOpenness(t, T) {
  if (t < T.shutterCloseAt) return clamp01((t - T.openAt) / (T.revealAt - T.openAt));
  return clamp01((T.crushAt - t) / (T.crushAt - T.shutterCloseAt));
}

/** 피스톤이 올라간 정도 0~1 (0이면 바닥까지 내려와 구역을 막고 있음) */
export function pistonLift(t, T, green) {
  if (!green) return 0;
  if (t < T.closeAt) return clamp01((t - T.revealAt) / (T.enterAt - T.revealAt));
  return clamp01((T.crushAt - t) / (T.crushAt - T.closeAt));
}

/** 이 구역에 새로 들어갈 수 있는가 (초록 구역, 피스톤이 다 올라간 뒤 ~ 내려오기 시작 전) */
export function isAlcoveOpen(t, T, green) {
  return green && t >= T.enterAt && t < T.closeAt;
}

/** 바닥등이 초록인가 (셔터가 다 열린 순간부터 피스톤이 내려오기 시작할 때까지) */
export function isLampGreen(t, T, green) {
  return green && t >= T.revealAt && t < T.closeAt;
}

/** 셔터 위 LED: -1 꺼짐, 0 왼쪽, 1 오른쪽 */
export function ledPhase(t, T, interval) {
  if (t < T.openAt || t >= T.crushAt) return -1;
  return Math.floor((t - T.openAt) / interval) % 2;
}

/** 화면 진동 세기: 셔터가 열릴 때부터 열차가 올 때까지 점점 강해지고, 꼬리가 빠진 뒤 잦아든다 */
export function shakeAt(t, T, { shakeStart, shakeMax }) {
  if (t < T.openAt || t >= T.shakeEndAt) return 0;
  if (t < T.arriveAt) {
    const u = (t - T.openAt) / (T.arriveAt - T.openAt);
    return shakeStart + (shakeMax - shakeStart) * u * u;
  }
  if (t < T.tailOutAt) return shakeMax;
  return shakeMax * (1 - (t - T.tailOutAt) / (T.shakeEndAt - T.tailOutAt));
}

/** 열차 앞부분의 z (zTop: 셔터 위치). 열차는 +z(화면 아래) 방향으로 달린다 */
export function trainFrontZ(t, T, zTop) {
  return zTop + T.speed * (t - T.arriveAt);
}
