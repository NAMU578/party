import { randInt } from '../../core/random.js';

// 식사 예절 규칙 (순수 함수). 내 화면과 방장 판정이 같은 함수를 써서 콩 개수가 똑같이 나온다.

export const STAB = 's'; // 스페이스: 포크로 콩 찍기
export const EAT = 'e'; // 엔터: 포크에 꽂힌 콩 먹기
const TIME_SLACK = 0.02; // 시각 비교 여유 (반올림 오차)

// 식탁 배치 (타일 한 칸 = 2.0). 집주인은 -z 끝에 서고, 플레이어는 양옆에 마주 보고 앉는다.
export const TABLE_Y = 0.7; // 식탁 윗면 높이
export const TABLE_HALF_W = 0.8; // 식탁 폭의 절반
const SEAT_OUT = 0.33; // 식탁 가장자리 ~ 앉은 사람 엉덩이
const PLATE_IN = 0.67; // 엉덩이 ~ 접시 가운데 (포크가 닿는 거리)
const END_MARGIN = 0.45; // 양 끝 좌석 바깥으로 남는 식탁 길이
const HOST_BACK = 0.55; // 식탁 머리 ~ 집주인

/** 한 사람의 식사 상태. busyUntil: 진행 중인 동작이 끝나는 시각 (시작 후 초) */
export function newDiner(cfg) {
  return { plate: cfg.peasPerPlate, fork: 0, busyUntil: 0 };
}

/** t초에 새 동작을 시작할 수 있는지: 먼저 시작한 동작은 끝날 때까지 멈출 수 없다 */
export function canStart(d, t) {
  return t >= d.busyUntil - TIME_SLACK;
}

/**
 * 찍기 결과(꽂히는 개수)를 정한다. 접시가 비었으면 null (찍을 콩이 없음).
 * why: 'full'(포크가 가득 참) | 'miss'(안 찍힘) | null
 */
export function rollStab(rng, d, cfg) {
  if (d.plate <= 0) return null;
  if (d.fork >= cfg.forkCapacity) return { n: 0, why: 'full' };
  if (rng() < cfg.stabMissChance) return { n: 0, why: 'miss' };
  const want = cfg.stabMin + randInt(rng, cfg.stabMax - cfg.stabMin + 1);
  return { n: Math.min(want, d.plate, cfg.forkCapacity - d.fork), why: null };
}

/**
 * 동작을 적용한다 (t: 시작 시각). 맞지 않는 입력이면 상태를 바꾸지 않고 null.
 * STAB: n = 꽂힌 개수, EAT: n = 포크에 있던 개수 전부
 */
export function applyAct(d, a, n, t, cfg) {
  if (!Number.isFinite(t) || !Number.isInteger(n) || !canStart(d, t)) return null;
  if (a === STAB) {
    if (d.plate <= 0 || n < 0 || n > cfg.stabMax || n > d.plate || d.fork + n > cfg.forkCapacity) return null;
    d.plate -= n;
    d.fork += n;
    d.busyUntil = t + cfg.stabTime;
  } else if (a === EAT) {
    if (d.fork <= 0 || n !== d.fork) return null;
    d.fork = 0;
    d.busyUntil = t + cfg.eatTime;
  } else {
    return null;
  }
  return d;
}

/** 다 먹었는지: 접시와 포크가 비고 마지막 한 입까지 삼킨 뒤 */
export function isFinished(d, t) {
  return d.plate === 0 && d.fork === 0 && t >= d.busyUntil - TIME_SLACK;
}

/**
 * 최종 순위 묶음 (앞쪽이 상위). 다 먹은 사람이 먼저(빨리 먹은 순), 그다음 죽은 사람(늦게 죽을수록 위).
 * 시각이 같으면 공동 순위. 같은 순간 걸린 사람은 걸린 시각이 정확히 같아서 함께 묶인다.
 * @param {{ id: string, t: number }[]} finished
 * @param {{ id: string, t: number }[]} dead
 */
export function rankGroups(finished, dead) {
  const groupBy = (list, sign) => {
    const out = [];
    for (const e of list.slice().sort((a, b) => sign * (a.t - b.t))) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.t - e.t) < 1e-6) last.ids.push(e.id);
      else out.push({ t: e.t, ids: [e.id] });
    }
    return out.map((g) => g.ids);
  };
  return [...groupBy(finished, 1), ...groupBy(dead, -1)];
}

/**
 * 좌석 배치. 왼쪽(-x)·오른쪽(+x)을 번갈아 집주인 쪽부터 채운다. 인원이 적으면 식탁도 짧아진다.
 * facing: 식탁 쪽을 보는 방향 (PlayerView의 ry), plateX: 그 사람 접시의 x
 */
export function seatLayout(count, cfg) {
  const perSide = Math.max(1, Math.ceil(count / 2));
  const half = (perSide * cfg.seatSpacing) / 2 + END_MARGIN;
  const seats = [];
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -half + END_MARGIN + (Math.floor(i / 2) + 0.5) * cfg.seatSpacing;
    seats.push({
      side,
      x: side * (TABLE_HALF_W + SEAT_OUT),
      z,
      facing: side < 0 ? Math.PI / 2 : -Math.PI / 2,
      plateX: side * (TABLE_HALF_W + SEAT_OUT - PLATE_IN),
    });
  }
  return { half, seats, hostZ: -half - HOST_BACK };
}
