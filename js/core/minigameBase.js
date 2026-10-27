import { MSG, makeMsg } from '../net/protocol.js';

/**
 * 모든 미니게임의 공통 틀.
 * - 모든 플레이어(방장 포함)의 화면에서 같은 클래스가 실행된다.
 * - 판정은 isHost일 때만 하고, 결과는 broadcastEvent로 모두에게 알린다.
 *
 * ctx (gameFlow가 넘겨줌):
 *   stage, room, network, session, hud, views(Map id→PlayerView), local(내 PlayerController 또는 null),
 *   roster(이번 판 참가자 ID), onMinigameFinish(groups), markEliminated(id)
 */
export class MinigameBase {
  constructor(ctx) {
    this.ctx = ctx;
    this.disposed = false;
  }

  get isHost() {
    return this.ctx.network.isHost;
  }

  get myId() {
    return this.ctx.session.myId;
  }

  /** 제목 카드가 뜰 때: 화면 구성 */
  mount() {}

  /** 실제 시작 */
  begin() {}

  /** 매 프레임 */
  update(_dt) {}

  /** 방장 → 모두: 미니게임 이벤트 */
  onEvent(_data) {}

  /** 참가자 → 방장: 미니게임 메시지 (방장에서만 호출) */
  onHostEvent(_fromId, _data) {}

  /** 참가자가 나감 (방장에서만 호출) */
  onPlayerLeft(_id) {}

  dispose() {
    this.disposed = true;
  }

  sendEventToHost(data) {
    this.ctx.network.sendToHost(makeMsg(MSG.MG, { d: data }));
  }

  broadcastEvent(data) {
    if (this.isHost) this.ctx.network.broadcast(makeMsg(MSG.MG, { d: data }));
  }

  /** 방장 전용: 순위 묶음(앞쪽이 상위)을 넘기면 점수 계산은 gameFlow가 한다. */
  finish(rankGroups) {
    if (this.isHost && !this.disposed) this.ctx.onMinigameFinish(rankGroups);
  }
}
