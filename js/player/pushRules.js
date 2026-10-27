// 밀치기·충돌 계산 (화면·통신과 무관한 순수 함수라 Node에서도 테스트 가능).

/**
 * 밀칠 대상 찾기: 사거리 안, 정면 기준 좌우 halfAngleDeg 안에서 가장 가까운 사람.
 * @param {{x:number, z:number, ry:number}} self  ry: 바라보는 방향 (atan2(x, z) 기준)
 * @param {{id:string, x:number, z:number}[]} others
 * @returns {{id:string, d:number, dx:number, dz:number} | null} dx, dz: 밀려날 방향(단위 벡터)
 */
export function findPushTarget(self, others, { range, halfAngleDeg }) {
  const fx = Math.sin(self.ry);
  const fz = Math.cos(self.ry);
  const minCos = Math.cos((halfAngleDeg * Math.PI) / 180);
  let best = null;
  for (const o of others) {
    const dx = o.x - self.x;
    const dz = o.z - self.z;
    const d = Math.hypot(dx, dz);
    if (d > range) continue;
    if (d > 1e-6 && (dx * fx + dz * fz) / d < minCos) continue;
    if (!best || d < best.d) {
      best = d > 1e-6 ? { id: o.id, d, dx: dx / d, dz: dz / d } : { id: o.id, d, dx: fx, dz: fz };
    }
  }
  return best;
}

/** 밀려난 거리 비율 (0~1): 처음에 빠르고 점점 느려짐 */
export function knockbackProgress(t, duration) {
  const u = Math.min(1, Math.max(0, t / duration));
  return 1 - (1 - u) ** 2;
}

/**
 * 다른 사람과 겹치면 겹친 만큼 밀어낸 위치를 돌려준다.
 * 정확히 같은 자리면 ID 순서로 방향을 정해, 양쪽 화면이 서로 반대로 비켜나게 한다.
 */
export function separate(x, z, others, minDist, selfId) {
  for (const o of others) {
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d >= minDist) continue;
    if (d < 1e-6) {
      x += (selfId < o.id ? 1 : -1) * minDist;
      continue;
    }
    x += (dx / d) * (minDist - d);
    z += (dz / d) * (minDist - d);
  }
  return { x, z };
}
