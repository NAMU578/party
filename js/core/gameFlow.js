import { CONFIG } from '../config.js';
import { MSG, makeMsg } from '../net/protocol.js';
import { describeNetError } from '../net/network.js';
import { ScoreManager, rankGroupsToResults } from './scoreManager.js';
import { buildMatchOrder, getMinigame } from './minigameRegistry.js';
import { sanitizeName } from './session.js';
import { PlayerView } from '../render/playerView.js';
import { PlayerController } from '../player/playerController.js';

/**
 * 파티 전체 흐름: 로비 → (미니게임 제목 → 플레이 → 결과) × 라운드 수 → 최종 순위 → 로비
 *
 * 방장 쪽(_host*)은 진행을 결정해서 메시지를 보내고,
 * 모든 플레이어 쪽(_client*)은 받은 메시지대로 화면을 바꾼다.
 * 방장도 자기 메시지를 똑같이 받아 화면을 바꾸므로, 방장 화면과 참가자 화면이 같은 코드로 움직인다.
 */
export class GameFlow {
  constructor({ stage, room, network, session, input, hud, lobby }) {
    this.stage = stage;
    this.room = room;
    this.network = network;
    this.session = session;
    this.input = input;
    this.hud = hud;
    this.lobby = lobby;

    this.scores = new ScoreManager(); // 방장 전용: 점수 계산
    this.standings = [];              // 화면 표시용 (방장이 보내준 값)
    this.minigame = null;
    this.minigameDef = null;
    this.views = new Map();           // 플레이어 ID → PlayerView
    this.local = null;                // 내 PlayerController
    this.roster = [];                 // 이번 미니게임 참가자
    this.eliminated = new Set();
    this.roundText = '';

    this.host = null;                 // 방장일 때만 쓰는 상태
    this.lastHeard = new Map();       // 방장: 참가자별 마지막 수신 시각
    this.lastHostHeard = 0;           // 참가자: 방장에게서 마지막으로 받은 시각
    this.snapTimer = null;

    network.on('hostMessage', (from, msg) => this._onHostMessage(from, msg));
    network.on('clientMessage', (msg) => this._onClientMessage(msg));
    network.on('peerLeave', (id) => this._hostOnLeave(id));
    network.on('disconnect', () => this._onDisconnected('방장과의 연결이 끊어졌습니다.'));
    setInterval(() => this._tickConnection(), CONFIG.net.pingSeconds * 1000);
    window.addEventListener('beforeunload', () => this.network.close());
  }

  update(dt) {
    if (this.local) this.local.update(dt);
    for (const v of this.views.values()) v.update(dt);
    if (this.minigame) this.minigame.update(dt);
  }

  // ===================== 사용자 조작 =====================

  async createRoom(rawName) {
    const name = sanitizeName(rawName);
    this.lobby.setBusy(true);
    this.lobby.setStatus('방을 만드는 중…');
    try {
      await this.network.createRoom();
    } catch (err) {
      this.lobby.showStart(describeNetError(err), true);
      return;
    }
    this.session.reset();
    this.session.myId = this.network.myId;
    this.session.hostId = this.network.myId;
    this.session.roomCode = this.network.roomCode;
    this.lastHeard.clear();
    this.host = {
      players: new Map(), // id → { id, name, color, colorIndex, left }
      settings: { maxPlayers: CONFIG.lobby.defaultMaxPlayers, matchRounds: CONFIG.lobby.defaultMatchRounds },
      phase: 'lobby',
      matchPlayers: [],
      order: [],
      matchIndex: 0,
      roster: [],
      positions: {},
      knockUntil: {},  // 넘어져 있는 동안 (이 시각까지 밀 수도, 맞을 수도 없음)
      pushReadyAt: {}, // 다시 밀 수 있는 시각
      timer: null,
    };
    this._hostAddPlayer(this.network.myId, name);
    this._hostBroadcastLobby();
  }

  async joinRoom(rawName, code) {
    const name = sanitizeName(rawName);
    this.lobby.setBusy(true);
    this.lobby.setStatus('방에 접속하는 중…');
    try {
      await this.network.joinRoom(code);
    } catch (err) {
      this.lobby.showStart(describeNetError(err), true);
      return;
    }
    this.session.reset();
    this.session.myId = this.network.myId;
    this.session.roomCode = this.network.roomCode;
    this.host = null;
    this.lastHostHeard = performance.now();
    this.network.sendToHost(makeMsg(MSG.HELLO, { name }));
    this.lobby.setStatus('입장 확인 중…');
  }

  leave() {
    this._resetAll();
    this.lobby.showStart();
  }

  hostUpdateSettings({ maxPlayers, matchRounds }) {
    const H = this.host;
    if (!H || H.phase !== 'lobby') return;
    if (CONFIG.lobby.maxPlayersOptions.includes(maxPlayers)) H.settings.maxPlayers = maxPlayers;
    if (CONFIG.lobby.matchRoundsOptions.includes(matchRounds)) H.settings.matchRounds = matchRounds;
    this._hostBroadcastLobby();
  }

  hostStart() {
    const H = this.host;
    if (!H || H.phase !== 'lobby') return;
    H.matchPlayers = [...H.players.keys()];
    this.scores.reset(H.matchPlayers);
    H.order = buildMatchOrder(H.settings.matchRounds);
    H.matchIndex = 0;
    this._startSnapshots();
    this._hostNextMinigame();
  }

  hostBackToLobby() {
    const H = this.host;
    if (!H || H.phase !== 'final') return;
    for (const [id, p] of H.players) if (p.left) H.players.delete(id);
    H.phase = 'lobby';
    clearTimeout(H.timer);
    this._hostBroadcastLobby();
  }

  // ===================== 방장: 진행 =====================

  _hostAddPlayer(id, rawName) {
    const H = this.host;
    const used = new Set([...H.players.values()].map((p) => p.colorIndex));
    let colorIndex = 0;
    while (used.has(colorIndex)) colorIndex += 1;
    const colors = CONFIG.player.colors;
    let name = sanitizeName(rawName);
    const names = new Set([...H.players.values()].map((p) => p.name));
    if (names.has(name)) {
      let n = 2;
      while (names.has(`${name}${n}`)) n += 1;
      name = `${name}${n}`;
    }
    H.players.set(id, { id, name, color: colors[colorIndex % colors.length], colorIndex, left: false });
  }

  _hostPlayerList(includeLeft) {
    return [...this.host.players.values()]
      .filter((p) => includeLeft || !p.left)
      .map(({ id, name, color, left }) => ({ id, name, color, left }));
  }

  _hostBroadcastLobby() {
    const H = this.host;
    this.network.broadcast(
      makeMsg(MSG.LOBBY, {
        players: this._hostPlayerList(false),
        hostId: this.network.myId,
        settings: { ...H.settings },
        code: this.network.roomCode,
      }),
    );
  }

  _hostNextMinigame() {
    const H = this.host;
    if (!H) return;
    clearTimeout(H.timer);
    if (H.matchIndex >= H.order.length) {
      this._hostEndMatch();
      return;
    }
    const gameId = H.order[H.matchIndex];
    H.matchIndex += 1;
    const def = getMinigame(gameId);
    const roster = H.matchPlayers.filter((id) => H.players.get(id) && !H.players.get(id).left);
    H.phase = 'intro';
    H.roster = roster;
    H.positions = {};
    H.knockUntil = {};
    H.pushReadyAt = {};
    const spawns = def.computeSpawns(roster);
    for (const id of roster) H.positions[id] = [spawns[id][0], spawns[id][1], 0, 0];

    this.network.broadcast(
      makeMsg(MSG.INTRO, {
        gameId,
        round: H.matchIndex,
        total: H.order.length,
        roster,
        players: this._hostPlayerList(true),
        spawns,
        standings: this.scores.standings(),
      }),
    );
    H.timer = setTimeout(() => {
      if (this.host !== H || H.phase !== 'intro') return;
      H.phase = 'playing';
      this.network.broadcast(makeMsg(MSG.BEGIN));
    }, CONFIG.flow.introSeconds * 1000);
  }

  /** 방장의 미니게임이 순위 묶음을 넘겨줌 */
  _hostMinigameFinished(groups) {
    const H = this.host;
    if (!H || H.phase !== 'playing') return;
    H.phase = 'result';
    // 실제로 순위에 오른 인원 기준으로 점수를 매긴다 (시작 전에 나간 사람은 제외)
    const ranked = groups.reduce((n, g) => n + g.length, 0);
    const rows = rankGroupsToResults(groups, ranked);
    this.scores.apply(rows);
    const standings = this.scores.standings();
    const totals = new Map(standings.map((s) => [s.id, s.total]));
    this.network.broadcast(
      makeMsg(MSG.RESULT, {
        rows: rows.map((r) => ({ ...r, total: totals.get(r.id) ?? 0 })),
        standings,
        round: H.matchIndex,
        total: H.order.length,
        last: H.matchIndex >= H.order.length,
      }),
    );
    H.timer = setTimeout(() => {
      if (this.host === H && H.phase === 'result') this._hostNextMinigame();
    }, CONFIG.flow.resultsSeconds * 1000);
  }

  _hostEndMatch() {
    const H = this.host;
    H.phase = 'final';
    this._stopSnapshots();
    this.network.broadcast(makeMsg(MSG.FINAL, { standings: this.scores.standings(), players: this._hostPlayerList(true) }));
  }

  // ===================== 방장: 받은 메시지 =====================

  _onHostMessage(from, msg) {
    const H = this.host;
    if (!H || !msg || typeof msg !== 'object') return;
    this.lastHeard.set(from, performance.now());
    switch (msg.t) {
      case MSG.HELLO:
        this._hostOnHello(from, msg);
        break;
      case MSG.POS:
        if (H.roster.includes(from) && Number.isFinite(msg.x) && Number.isFinite(msg.z)) {
          H.positions[from] = [msg.x, msg.z, Number(msg.ry) || 0, msg.mv ? 1 : 0];
        }
        break;
      case MSG.MG:
        if (H.phase === 'playing' && this.minigame && H.roster.includes(from)) this.minigame.onHostEvent(from, msg.d || {});
        break;
      case MSG.PUSH:
        this._hostOnPush(from, msg);
        break;
      default:
        break;
    }
  }

  /** 밀치기 확인: 민 사람 화면 기준 판정을 거리·상태로 한 번 더 확인하고 모두에게 알린다 */
  _hostOnPush(from, msg) {
    const H = this.host;
    if (H.phase !== 'playing' || !H.roster.includes(from)) return;
    const now = performance.now();
    const cfg = CONFIG.push;
    if ((H.knockUntil[from] || 0) > now || (H.pushReadyAt[from] || 0) > now) return;
    H.pushReadyAt[from] = now + cfg.cooldown * 800; // 통신 지연을 감안해 조금 느슨하게

    let dx = Number(msg.dx);
    let dz = Number(msg.dz);
    const len = Math.hypot(dx, dz);
    if (!Number.isFinite(len) || len < 1e-6) {
      dx = 0;
      dz = 1;
    } else {
      dx /= len;
      dz /= len;
    }

    let to = null;
    const a = H.positions[from];
    const b = H.positions[msg.to];
    if (typeof msg.to === 'string' && msg.to !== from && H.roster.includes(msg.to) && a && b) {
      const inRange = Math.hypot(b[0] - a[0], b[1] - a[1]) <= cfg.range + cfg.hostRangeSlack;
      if (inRange && (H.knockUntil[msg.to] || 0) <= now) {
        to = msg.to;
        H.knockUntil[to] = now + (cfg.knockbackTime + cfg.downTime + cfg.getUpTime) * 1000;
      }
    }
    this.network.broadcast(makeMsg(MSG.PUSH, { from, to, dx: Math.round(dx * 100) / 100, dz: Math.round(dz * 100) / 100 }));
  }

  _hostOnHello(from, msg) {
    const H = this.host;
    if (H.players.has(from)) return;
    let reason = null;
    if (H.phase !== 'lobby') reason = '이미 게임이 진행 중입니다. 이번 판이 끝난 뒤 다시 참가하세요.';
    else if (H.players.size >= H.settings.maxPlayers) reason = '방이 가득 찼습니다.';
    if (reason) {
      this.network.sendTo(from, makeMsg(MSG.REJECT, { reason }));
      setTimeout(() => this.network.dropPeer(from), 1500);
      return;
    }
    this._hostAddPlayer(from, msg.name);
    this._hostBroadcastLobby();
  }

  _hostOnLeave(id) {
    const H = this.host;
    if (!H) return;
    this.lastHeard.delete(id);
    const p = H.players.get(id);
    if (!p) return;
    if (H.phase === 'lobby') {
      H.players.delete(id);
      this._hostBroadcastLobby();
      return;
    }
    p.left = true;
    delete H.positions[id];
    this.network.broadcast(makeMsg(MSG.LEFT, { id }));
    if (this.minigame && (H.phase === 'intro' || H.phase === 'playing')) this.minigame.onPlayerLeft(id);
  }

  // ===================== 모두: 받은 메시지 =====================

  _onClientMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    this.lastHostHeard = performance.now();
    switch (msg.t) {
      case MSG.REJECT:
        this._resetAll();
        this.lobby.showStart(msg.reason || '입장할 수 없습니다.', true);
        break;
      case MSG.LOBBY:
        this._clientLobby(msg);
        break;
      case MSG.INTRO:
        this._clientIntro(msg);
        break;
      case MSG.BEGIN:
        this._clientBegin();
        break;
      case MSG.MG:
        if (this.minigame) this.minigame.onEvent(msg.d || {});
        break;
      case MSG.SNAP:
        this._clientSnap(msg);
        break;
      case MSG.PUSH:
        this._clientPush(msg);
        break;
      case MSG.RESULT:
        this._clientResult(msg);
        break;
      case MSG.FINAL:
        this._clientFinal(msg);
        break;
      case MSG.LEFT:
        this._clientLeft(msg);
        break;
      default:
        break;
    }
  }

  _clientLobby(msg) {
    this._teardownMinigame();
    const S = this.session;
    S.phase = 'lobby';
    S.hostId = msg.hostId;
    S.settings = msg.settings;
    S.roomCode = msg.code;
    S.setPlayers(msg.players);
    this.hud.show(false);
    this.hud.hideResult();
    this.lobby.showRoom({ code: msg.code, players: msg.players, hostId: msg.hostId, myId: S.myId, settings: msg.settings });
  }

  _clientIntro(msg) {
    this._teardownMinigame();
    const S = this.session;
    const def = getMinigame(msg.gameId);
    if (!def) {
      console.error('알 수 없는 미니게임:', msg.gameId);
      return;
    }
    S.phase = 'intro';
    S.setPlayers(msg.players);
    this.roster = msg.roster.slice();
    this.eliminated = new Set();
    this.standings = msg.standings || [];
    this.lobby.hide();
    this.hud.hideResult();
    this.hud.show(true);

    for (const id of this.roster) {
      const p = S.players.get(id);
      const view = new PlayerView({ name: p?.name ?? '???', color: p?.color ?? '#cccccc', isLocal: id === S.myId });
      const [x, z] = msg.spawns[id] || [0, 0];
      view.snapTo(x, z, 0);
      this.stage.scene.add(view.root);
      this.views.set(id, view);
    }
    this.local = null;
    if (this.roster.includes(S.myId)) {
      this.local = new PlayerController({
        view: this.views.get(S.myId),
        input: this.input,
        network: this.network,
        others: () => this._otherBodies(),
      });
      const [x, z] = msg.spawns[S.myId] || [0, 0];
      this.local.spawn(x, z);
    }

    this.minigameDef = def;
    this.minigame = def.create(this._minigameContext());
    this.minigame.mount();
    this.roundText = `${msg.round} / ${msg.total}`;
    this.hud.showIntro({ roundText: `${msg.round} / ${msg.total} 라운드`, title: def.title, description: def.description });
    this._refreshHud();
  }

  _clientBegin() {
    this.session.phase = 'playing';
    this.hud.hideIntro();
    if (this.local) this.local.setControllable(true);
    if (this.minigame) this.minigame.begin();
    this._refreshHud();
  }

  _clientSnap(msg) {
    const myId = this.session.myId;
    for (const [id, s] of Object.entries(msg.p || {})) {
      if (id === myId) continue;
      const view = this.views.get(id);
      if (view) view.setTarget(s[0], s[1], s[2], s[3]);
    }
  }

  _clientPush(msg) {
    const myId = this.session.myId;
    if (msg.from !== myId) this.views.get(msg.from)?.playPush(); // 내 동작은 누르는 순간 이미 재생함
    if (!msg.to) return;
    if (msg.to === myId) this.local?.knockback(msg.dx, msg.dz);
    else this.views.get(msg.to)?.knockdown(msg.dx, msg.dz);
  }

  _clientResult(msg) {
    const S = this.session;
    S.phase = 'result';
    if (this.local) this.local.setControllable(false);
    this.standings = msg.standings || [];
    this._refreshHud();
    const rows = msg.rows
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((r) => ({ rank: r.rank, name: S.name(r.id), color: S.color(r.id), points: r.points, total: r.total, me: r.id === S.myId }));
    this.hud.showResult({
      title: `${msg.round} / ${msg.total} 라운드 결과`,
      rows,
      note: msg.last ? '잠시 후 최종 순위가 발표됩니다.' : '잠시 후 다음 게임이 시작됩니다.',
      showLobbyButton: false,
    });
  }

  _clientFinal(msg) {
    this._teardownMinigame();
    const S = this.session;
    S.phase = 'final';
    if (msg.players) S.setPlayers(msg.players);
    this.standings = msg.standings || [];
    this.hud.show(false);
    const rows = this.standings.map((s) => ({
      rank: s.rank,
      name: S.name(s.id),
      color: S.color(s.id),
      points: null,
      total: s.total,
      me: s.id === S.myId,
    }));
    this.hud.showResult({
      title: '최종 순위',
      rows,
      note: S.isHost ? '' : '방장이 로비로 돌아가면 다음 판을 시작할 수 있습니다.',
      showLobbyButton: S.isHost,
    });
  }

  _clientLeft(msg) {
    const S = this.session;
    const p = S.players.get(msg.id);
    if (p) p.left = true;
    this.hud.feed(`${S.name(msg.id)} 님이 나갔습니다`);
    const view = this.views.get(msg.id);
    if (view) {
      view.dispose();
      this.views.delete(msg.id);
    }
    this._refreshHud();
  }

  // ===================== 공용 도구 =====================

  _minigameContext() {
    return {
      stage: this.stage,
      room: this.room,
      network: this.network,
      session: this.session,
      hud: this.hud,
      views: this.views,
      local: this.local,
      roster: this.roster.slice(),
      activeRoster: () => this.roster.filter((id) => !this.session.players.get(id)?.left),
      onMinigameFinish: (groups) => this._hostMinigameFinished(groups),
      markEliminated: (id) => {
        this.eliminated.add(id);
        this._refreshHud();
      },
    };
  }

  /** 내 캐릭터가 부딪히거나 밀 수 있는 다른 플레이어 (탈락·낙하 중인 사람 제외) */
  _otherBodies() {
    const myId = this.session.myId;
    const out = [];
    for (const [id, v] of this.views) {
      if (id === myId || this.eliminated.has(id) || v.falling || !v.root.visible) continue;
      out.push({ id, x: v.root.position.x, z: v.root.position.z, knocked: v.knocked });
    }
    return out;
  }

  _refreshHud() {
    const S = this.session;
    const title = this.minigameDef ? this.minigameDef.title : '';
    const alive = this.roster.filter((id) => !this.eliminated.has(id) && !S.players.get(id)?.left).length;
    this.hud.setRoundInfo(`${this.roundText} · ${title}`, S.phase === 'playing' ? `생존 ${alive}명` : '');
    this.hud.setScores(this.standings, { myId: S.myId, eliminated: this.eliminated, players: S.players });
  }

  _teardownMinigame() {
    if (this.minigame) {
      try {
        this.minigame.dispose();
      } catch (e) {
        console.error(e);
      }
      this.minigame = null;
    }
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    this.local = null;
    this.hud.clearTransient();
    this.room.setLobbyFloorVisible(true);
  }

  _startSnapshots() {
    this._stopSnapshots();
    this.snapTimer = setInterval(() => {
      const H = this.host;
      if (!H || !['intro', 'playing', 'result'].includes(H.phase)) return;
      this.network.broadcast(makeMsg(MSG.SNAP, { p: H.positions }));
    }, 1000 / CONFIG.net.snapshotRate);
  }

  _stopSnapshots() {
    clearInterval(this.snapTimer);
    this.snapTimer = null;
  }

  /** 연결 확인: 서로 1초마다 신호를 보내고, 오래 소식이 없으면 끊긴 것으로 처리 */
  _tickConnection() {
    if (!this.network.active) return;
    const now = performance.now();
    const timeout = CONFIG.net.timeoutSeconds * 1000;
    if (this.network.isHost) {
      this.network.broadcast(makeMsg(MSG.PING));
      for (const id of this.network.peerIds()) {
        if (!this.lastHeard.has(id)) this.lastHeard.set(id, now);
        else if (now - this.lastHeard.get(id) > timeout) this.network.dropPeer(id);
      }
    } else {
      this.network.sendToHost(makeMsg(MSG.PING));
      if (now - this.lastHostHeard > timeout) this._onDisconnected('방장의 응답이 없어 연결을 종료했습니다.');
    }
  }

  _resetAll() {
    if (this.host) clearTimeout(this.host.timer);
    this._stopSnapshots();
    this.host = null;
    this.network.close();
    this._teardownMinigame();
    this.session.reset();
    this.hud.show(false);
    this.hud.hideResult();
    this.standings = [];
    this.roster = [];
    this.eliminated = new Set();
  }

  _onDisconnected(reason) {
    this._resetAll();
    this.lobby.showStart(reason, true);
  }
}
