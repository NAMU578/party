// 순위 → 점수 변환과 누적 합산.

/**
 * 순위 묶음을 점수로 바꾼다. 같은 묶음은 공동 순위.
 * 예) 4명, [[A], [B, C], [D]] → A 1등 4점, B·C 공동 2등 3점, D 4등 1점
 * @param {string[][]} groups 앞쪽이 상위 순위
 * @param {number} playerCount 이번 미니게임 참가 인원
 */
export function rankGroupsToResults(groups, playerCount) {
  const rows = [];
  let placed = 0;
  for (const group of groups) {
    if (!group.length) continue;
    const rank = placed + 1;
    const points = Math.max(0, playerCount - rank + 1);
    for (const id of group) rows.push({ id, rank, points });
    placed += group.length;
  }
  return rows;
}

/** key 내림차순으로 정렬하고 rank를 매긴다. 같은 값은 공동 순위 */
function rankDescending(list, key) {
  list.sort((a, b) => b[key] - a[key]);
  list.forEach((e, i) => {
    e.rank = i > 0 && list[i - 1][key] === e[key] ? list[i - 1].rank : i + 1;
  });
  return list;
}

/**
 * 한 라운드(같은 미니게임 여러 판)의 판별 결과를 합친다. 획득 점수는 합, 순위는 합계 기준.
 * @param {{ id: string, points: number }[][]} plays 판마다 rankGroupsToResults 결과
 */
export function combineRoundRows(plays) {
  const sum = new Map();
  for (const rows of plays) for (const r of rows) sum.set(r.id, (sum.get(r.id) ?? 0) + r.points);
  return rankDescending([...sum].map(([id, points]) => ({ id, rank: 0, points })), 'points');
}

export class ScoreManager {
  constructor() {
    this.totals = new Map();
  }

  reset(ids) {
    this.totals = new Map(ids.map((id) => [id, 0]));
  }

  apply(rows) {
    for (const r of rows) this.totals.set(r.id, (this.totals.get(r.id) ?? 0) + r.points);
  }

  /** 총점 내림차순, 동점은 공동 순위 */
  standings() {
    return rankDescending([...this.totals.entries()].map(([id, total]) => ({ id, total, rank: 0 })), 'total');
  }
}
