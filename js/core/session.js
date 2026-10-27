import { CONFIG } from '../config.js';

// 현재 방의 상태: 내 ID, 방장 ID, 참가자 목록, 방 설정.
export class Session {
  constructor() {
    this.reset();
  }

  reset() {
    this.myId = null;
    this.hostId = null;
    this.roomCode = null;
    this.phase = 'menu'; // menu | lobby | intro | playing | result | final
    this.players = new Map(); // id → { id, name, color, left }
    this.settings = {
      maxPlayers: CONFIG.lobby.defaultMaxPlayers,
      matchRounds: CONFIG.lobby.defaultMatchRounds,
    };
  }

  get isHost() {
    return !!this.myId && this.myId === this.hostId;
  }

  setPlayers(list) {
    this.players = new Map(list.map((p) => [p.id, { ...p }]));
  }

  activePlayers() {
    return [...this.players.values()].filter((p) => !p.left);
  }

  name(id) {
    return this.players.get(id)?.name ?? '???';
  }

  color(id) {
    return this.players.get(id)?.color ?? '#cccccc';
  }
}

export function sanitizeName(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, CONFIG.lobby.nameMaxLength);
  return name || `플레이어${Math.floor(Math.random() * 90 + 10)}`;
}
