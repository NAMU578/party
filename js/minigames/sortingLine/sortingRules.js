import { createRng, randInt } from '../../core/random.js';

// 분류 작업 규칙 (순수 함수). 방장 판정과 각자 화면이 같은 함수를 써서 점수가 똑같이 나온다.

export const BURN = 'b'; // 스페이스: 버리기 (예술품이 정답)
export const PASS = 'p'; // 엔터: 넘기기 (장치가 정답)
export const DEVICE_KINDS = ['radio', 'tv', 'phone', 'camera', 'typewriter'];
export const ART_KINDS = ['painting', 'bust', 'vase'];
const LOOKS = 4; // 종류마다 색·그림 가짓수 (itemModels.js의 색·그림 목록 길이와 같아야 함)
const TIME_SLACK = 0.02; // 시각 비교 여유 (반올림 오차)

/** 한 사람의 이번 턴 물건 목록. 같은 시드면 같은 목록이라 다른 사람 화면에서도 똑같이 그린다 */
export function makeItems(seed, count) {
  const rng = createRng(seed);
  const items = [];
  for (let i = 0; i < count; i++) {
    const art = rng() < 0.5;
    const kinds = art ? ART_KINDS : DEVICE_KINDS;
    items.push({ art, kind: kinds[randInt(rng, kinds.length)], look: randInt(rng, LOOKS) });
  }
  return items;
}

export const correctAction = (item) => (item.art ? BURN : PASS);

/** 한 턴 동안 한 사람의 작업 기록 */
export function newSheet() {
  return { next: 0, score: 0, lastScoreT: null, lastT: 0, jamUntil: 0 };
}

/** 작업 시작 후 t초에 입력을 받는지: 작업 시간 안이고 벨트가 걸려 있지 않을 때 */
export function canAct(sheet, t, cfg) {
  return t >= 0 && t < cfg.playTime && t >= sheet.jamUntil;
}

/**
 * i번째 물건에 행동 a를 적용한다 (t: 작업 시작 후 초). 순서나 시각이 맞지 않으면 null.
 * 맞으면 점수 +1과 그 시각(동점 비교용)을 기록하고, 틀리면 벨트가 wrongJam초 걸린다.
 */
export function applyAction(sheet, items, i, a, t, cfg) {
  if (i !== sheet.next || i >= items.length || (a !== BURN && a !== PASS)) return null;
  if (!(t >= -TIME_SLACK && t <= cfg.playTime + TIME_SLACK)) return null; // NaN도 여기서 걸러진다
  if (t < sheet.lastT - TIME_SLACK || t < sheet.jamUntil - TIME_SLACK) return null;
  const correct = correctAction(items[i]) === a;
  sheet.next = i + 1;
  sheet.lastT = t;
  if (correct) {
    sheet.score += 1;
    sheet.lastScoreT = t;
  } else {
    sheet.jamUntil = t + cfg.wrongJam;
  }
  return { correct };
}

/**
 * 압사할 사람: 점수가 가장 낮은 사람. 동점이면 그 점수에 늦게 도달한 사람.
 * 도달 시각까지 같으면(둘 다 0점이라 비교할 시각이 없는 경우 등) 함께 압사.
 * @param {{ id: string, score: number, lastScoreT: number|null }[]} entries
 */
export function pickLosers(entries) {
  if (!entries.length) return [];
  const min = Math.min(...entries.map((e) => e.score));
  const low = entries.filter((e) => e.score === min);
  const reachedAt = (e) => e.lastScoreT ?? -Infinity;
  const latest = Math.max(...low.map(reachedAt));
  return low.filter((e) => reachedAt(e) === latest).map((e) => e.id);
}

/** 소각로를 둘러싼 작업대 배치. 인원이 적으면 가깝게, 많으면 이웃 벨트와 겹치지 않게 넓게 */
export function stationLayout(count, cfg) {
  const radius = Math.min(cfg.ringRadiusMax, Math.max(cfg.ringRadiusMin, count * cfg.ringRadiusPerPlayer));
  const stations = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const ox = Math.sin(angle);
    const oz = Math.cos(angle);
    stations.push({
      angle,
      out: [ox, oz], // 소각로에서 바깥쪽
      right: [oz, -ox], // 소각로를 바라볼 때 오른쪽 (벨트가 흐르는 방향)
      x: ox * radius, // 벨트 가운데
      z: oz * radius,
      standX: ox * (radius + cfg.standOut),
      standZ: oz * (radius + cfg.standOut),
      facing: angle + Math.PI, // 캐릭터가 소각로를 보는 방향 (PlayerView의 ry)
    });
  }
  return { radius, stations };
}
