import { sample } from '../../core/random.js';

// 열차 피하기의 순수 규칙 (화면·통신과 무관해서 Node에서도 테스트 가능).
// 좌표: x는 화면 오른쪽 +, z는 화면 아래쪽 +. 셔터가 z = zTop(위), 통로 끝이 z = zBottom(아래).
// 대피 구역 번호: 왼쪽 위에서 아래로 0, 1, …, 그다음 오른쪽 위에서 아래로 (한쪽 4칸이면 0~3, 4~7).

export function corridorLayout({ corridorWidth, corridorLength, alcovesPerSide, alcovePitch, alcoveWidth, alcoveDepth }) {
  const alcoves = [];
  for (const side of [-1, 1]) {
    for (let row = 0; row < alcovesPerSide; row++) {
      alcoves.push({ side, row, z: (row - (alcovesPerSide - 1) / 2) * alcovePitch });
    }
  }
  return {
    halfW: corridorWidth / 2,
    zTop: -corridorLength / 2,
    zBottom: corridorLength / 2,
    alcoveWidth,
    alcoveDepth,
    alcoves,
    count: alcoves.length,
  };
}

/** 발 중심이 통로 위인가 (열차에 치이는 자리) */
export function inCorridor(layout, x) {
  return Math.abs(x) <= layout.halfW;
}

/** 발 중심이 들어가 있는 대피 구역 번호. 구역 밖이면 -1 */
export function alcoveIndexAt(layout, x, z) {
  const ax = Math.abs(x);
  if (ax <= layout.halfW || ax > layout.halfW + layout.alcoveDepth + 1e-6) return -1;
  const half = layout.alcoveWidth / 2;
  const sideBase = x < 0 ? 0 : layout.count / 2;
  for (let i = sideBase; i < sideBase + layout.count / 2; i++) {
    if (Math.abs(z - layout.alcoves[i].z) <= half) return i;
  }
  return -1;
}

/** 몸 중심이 움직일 수 있는 사각형 (반지름 r만큼 벽에서 떨어짐) */
function corridorRect(layout, r) {
  return { minX: -layout.halfW + r, maxX: layout.halfW - r, minZ: layout.zTop + r, maxZ: layout.zBottom - r };
}

/** 구역 i에서 몸 중심이 움직일 수 있는 사각형. 통로 쪽 경계가 통로 사각형과 맞닿아 이어진다 */
export function alcoveRect(layout, i, r) {
  const a = layout.alcoves[i];
  const inner = layout.halfW - r;
  const outer = layout.halfW + layout.alcoveDepth - r;
  const half = layout.alcoveWidth / 2 - r;
  return {
    minX: a.side > 0 ? inner : -outer,
    maxX: a.side > 0 ? outer : -inner,
    minZ: a.z - half,
    maxZ: a.z + half,
  };
}

function insideRect(rc, x, z, eps = 1e-6) {
  return x >= rc.minX - eps && x <= rc.maxX + eps && z >= rc.minZ - eps && z <= rc.maxZ + eps;
}

/**
 * 몸 중심이 통로 사각형을 벗어나 구역 쪽에 들어가 있으면 그 구역 번호, 아니면 -1.
 * 통로 벽에 붙어 선 것(경계 위)은 들어간 것으로 치지 않는다 → 닫힌 구역으로 비집고 들어갈 수 없음.
 */
export function enteredAlcoveAt(layout, x, z, r) {
  if (Math.abs(x) <= layout.halfW - r + 1e-6) return -1;
  for (let i = 0; i < layout.count; i++) if (insideRect(alcoveRect(layout, i, r), x, z)) return i;
  return -1;
}

/**
 * 갈 수 있는 곳(통로 + allowed(i)가 참인 구역) 밖이면 가장 가까운 지점으로 되돌린다.
 * 볼록한 사각형 여러 개의 합집합이므로, 각 사각형에 가장 가까운 점 중 제일 가까운 것이 답이다.
 */
export function clampToArea(layout, x, z, allowed, r) {
  const rects = [corridorRect(layout, r)];
  for (let i = 0; i < layout.count; i++) if (allowed(i)) rects.push(alcoveRect(layout, i, r));
  let best = null;
  let bestD = Infinity;
  for (const rc of rects) {
    const cx = Math.min(rc.maxX, Math.max(rc.minX, x));
    const cz = Math.min(rc.maxZ, Math.max(rc.minZ, z));
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { x: cx, z: cz };
    }
  }
  return best;
}

/** 열차에 치였는가: 발 중심이 통로 위이고, 몸이 열차 앞부분~꼬리 사이에 걸침 */
export function isHitByTrain(layout, x, z, frontZ, trainLength, r) {
  return inCorridor(layout, x) && z - r <= frontZ && z + r >= frontZ - trainLength;
}

/** k번째 턴(1부터)의 초록 구역 수: 시작 인원에서 턴마다 1개씩 줄고, 최소 1개 */
export function greenCountForTurn(startCount, turn, total) {
  return Math.min(total, Math.max(1, startCount - (turn - 1)));
}

/** 초록 구역 무작위 배정 (오름차순) */
export function pickGreens(rng, count, total) {
  return sample(rng, [...Array(total).keys()], count).sort((a, b) => a - b);
}

/** 시작 위치: 통로 가운데 두 줄 × 구역 높이의 자리 중 무작위 */
export function spawnSpots(layout, count, rng) {
  const spots = [];
  for (const x of [-0.9, 0.9]) for (const a of layout.alcoves.slice(0, layout.count / 2)) spots.push({ x, z: a.z });
  return sample(rng, spots, count);
}
