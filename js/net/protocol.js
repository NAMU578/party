// 주고받는 메시지 종류. 짧은 문자열로 전송량을 줄인다.
export const MSG = Object.freeze({
  // 참가자 → 방장
  HELLO: 'hello',   // { name }
  POS: 'pos',       // { x, z, ry, mv }
  // 양방향
  PING: 'ping',
  MG: 'mg',         // { d } 미니게임 전용 데이터
  PUSH: 'push',     // 참가자→방장 { to, dx, dz } / 방장→모두 { from, to, dx, dz } (to가 null이면 헛스윙)
  // 방장 → 참가자
  REJECT: 'reject', // { reason }
  LOBBY: 'lobby',   // { players, hostId, settings, code }
  INTRO: 'intro',   // { gameId, round, total, play, plays, roster, players, spawns, standings }
  BEGIN: 'begin',
  SNAP: 'snap',     // { p: { id: [x, z, ry, mv] } }
  RESULT: 'result', // { rows, standings, round, total, last }
  FINAL: 'final',   // { standings }
  LEFT: 'left',     // { id }
});

export function makeMsg(t, data = {}) {
  return { t, ...data };
}
