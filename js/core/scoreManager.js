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
    const list = [...this.totals.entries()].map(([id, total]) => ({ id, total, rank: 0 }));
    list.sort((a, b) => b.total - a.total);
    list.forEach((e, i) => {
      e.rank = i > 0 && list[i - 1].total === e.total ? list[i - 1].rank : i + 1;
    });
    return list;
  }
}
