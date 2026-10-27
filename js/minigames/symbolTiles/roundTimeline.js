// 한 라운드의 시간표. 모든 연출을 '라운드 시작 후 경과 시간 t'의 함수로 계산해서
// 프레임이 끊겨도 화면이 시간표와 어긋나지 않게 한다.
//
//   0 ~ 3초   깜빡이며 무작위로 바뀜 (1초 간격 3회)
//   3초       기호 확정
//   6초       벽 기호와 다른 타일이 떨어짐
//   6 ~ 10초  떨어진 상태 유지
//   10 ~ 13초 타일이 다시 올라옴 (영구 제거 타일 제외), 13초부터 밟을 수 있음
//   14초      다음 라운드

export function roundTimes(cfg) {
  const decideAt = cfg.flickerCount * cfg.flickerInterval;
  const dropAt = decideAt + cfg.dropDelay;
  const riseAt = dropAt + cfg.downDuration;
  const endAt = riseAt + cfg.riseDuration;
  return { decideAt, dropAt, riseAt, endAt };
}

/**
 * 기호 표시 상태
 * - flicker: blink번째 무작위 기호, on이면 켜짐
 * - final: 확정 기호 켜짐
 * - off: 꺼짐
 */
export function symbolPhaseAt(t, cfg, times) {
  if (t < 0) return { mode: 'off' };
  if (t < times.decideAt) {
    const blink = Math.min(cfg.flickerCount - 1, Math.floor(t / cfg.flickerInterval));
    const local = t - blink * cfg.flickerInterval;
    return { mode: 'flicker', blink, on: local < cfg.flickerInterval * cfg.flickerOnRatio };
  }
  if (t < times.riseAt) return { mode: 'final' };
  return { mode: 'off' };
}

/** 떨어지는 타일의 높이. null이면 보이지 않음(영구 제거) */
export function fallingTileY(t, times, cfg, removed, gravity) {
  if (t < times.dropAt) return 0;
  if (t < times.riseAt) {
    const s = t - times.dropAt;
    return Math.max(-cfg.pitDepth, -0.5 * gravity * s * s);
  }
  if (removed) return null;
  // 마지막에 느려지는 정도를 줄이려고 3제곱 대신 2제곱 감속, 다 올라온 시점 = 밟을 수 있는 시점
  const u = Math.min(1, (t - times.riseAt) / (cfg.riseDuration - cfg.solidLead));
  const ease = 1 - (1 - u) ** 2;
  return -cfg.riseStartDepth * (1 - ease);
}

/** 그 칸을 밟고 서 있을 수 있는가 */
export function isTileSolidAt(t, times, falling, removed, solidLead = 0) {
  if (!falling) return true;
  if (t < times.dropAt) return true;
  if (removed) return false;
  return t >= times.endAt - solidLead;
}
