import { CONFIG } from '../../config.js';
import { MinigameBase } from '../../core/minigameBase.js';
import { createRng, randomSeed } from '../../core/random.js';
import {
  alcoveIndexAt,
  clampToArea,
  corridorLayout,
  enteredAlcoveAt,
  greenCountForTurn,
  isHitByTrain,
  pickGreens,
  spawnSpots,
} from './trainDodgeRules.js';
import { isAlcoveOpen, isLampGreen, ledPhase, pistonLift, shakeAt, shutterOpenness, trainFrontZ, turnTimes } from './turnTimeline.js';
import { createCorridor } from './corridor.js';
import { Pistons } from './pistons.js';
import { Shutter } from './shutter.js';
import { createTrain, TRAIN_HALF_W } from './train.js';

const CFG = CONFIG.trainDodge;
const R = CONFIG.player.radius;
const BODY_H = 1.3; // 캐릭터 키: 피스톤 밑면이 이보다 낮아지면 그만큼 납작해진다
// 압착 직후에도 잠깐은 들어가 있던 구역에 남겨 둔다. 이동(밀어내기)이 판정보다 먼저 실행되므로
// 바로 막으면 판정 직전에 통로로 밀려나 압사를 피하게 된다.
const CRUSH_GRACE = 0.5;

/**
 * 열차 피하기 미니게임
 * - 방장: 턴마다 초록 구역을 정해서 알리고(turn), 탈락 보고를 모아 순위를 정한다.
 *   구역마다 먼저 들어온 한 명을 주인으로 정해 알린다(own). 각자 화면에서만 충돌을 계산하면
 *   통신 지연 때문에 두 사람이 동시에 들어가 둘 다 살아남을 수 있어서, 방장이 순서를 정한다.
 * - 모두: 받은 턴 정보를 시간표대로 연출하고, 내 캐릭터가 열차에 치이거나 압사하면 스스로 탈락을 보고한다.
 */
class TrainDodgeGame extends MinigameBase {
  constructor(ctx) {
    super(ctx);
    this.layout = corridorLayout(CFG);
    this.T = turnTimes(CFG);
    this.turn = null;        // { n, green: Set, start, crushChecked, slammed, frozenAt }
    this.owners = [];        // 구역별 주인 ID (방장이 알려 준 값, 없으면 null)
    this.myAlcove = -1;      // 내가 들어가 있는 구역 (주인 요청·반납용)
    this.swept = new Map();  // 열차에 쓸려가는 중인 캐릭터 (id → PlayerView)
    this.h = null;           // 방장 전용 상태
    this.finishTimer = null;
  }

  // ===== 화면 구성 =====

  mount() {
    const { stage, room, local } = this.ctx;
    room.group.visible = false; // 기호 타일 방 대신 통로를 쓴다
    stage.setView(CFG.camera);
    this.corridor = createCorridor(this.layout);
    this.pistons = new Pistons(this.layout);
    this.shutter = new Shutter(this.layout);
    this.train = createTrain(this.T.trainLength);
    stage.scene.add(this.corridor, this.pistons.group, this.shutter.group, this.train);
    if (local) local.setConstraint((x, z, x0, z0) => this._constrain(x, z, x0, z0));
    this._render(-1);
  }

  begin() {
    this.ctx.hud.setHint('WASD 이동 · 스페이스바 밀치기 · 열차가 오기 전에 초록불 구역으로, 지나가면 압착기를 피해 바로 나오세요');
    if (this.isHost) this._hostBegin();
  }

  /** 현재 턴 시작 후 지난 시간 (턴 전이면 -1). 결과 화면이 뜨면 그 순간에 멈춘다 (우승자가 결과창 뒤에서 깔리지 않게) */
  _time() {
    if (!this.turn) return -1;
    const now = performance.now();
    if (this.ctx.session.phase !== 'playing' && this.turn.frozenAt == null) this.turn.frozenAt = now;
    return ((this.turn.frozenAt ?? now) - this.turn.start) / 1000;
  }

  update() {
    const t = this._time();
    this._render(t);
    this._checkLocal(t);
  }

  onEvent(d) {
    if (d.k === 'turn') {
      this.turn = { n: d.n, green: new Set(d.g), start: performance.now(), crushChecked: false, slammed: false };
      this.owners = new Array(this.layout.count).fill(null);
      this.myAlcove = -1;
    } else if (d.k === 'own') {
      if (d.a >= 0 && d.a < this.layout.count) this.owners[d.a] = d.id || null;
    } else if (d.k === 'out') {
      this._onOut(d);
    }
  }

  _render(t) {
    const { T, layout: L } = this;
    const green = this.turn ? this.turn.green : null;
    this.shutter.set(shutterOpenness(t, T), ledPhase(t, T, CFG.ledInterval));
    for (let i = 0; i < L.count; i++) {
      const g = !!green && green.has(i);
      this.pistons.set(i, pistonLift(t, T, g), isLampGreen(t, T, g));
    }

    const front = trainFrontZ(t, T, L.zTop);
    this.train.position.z = front;
    // 터널 깊숙이(안개 속)이거나 화면 아래로 다 빠져나가면 숨김
    this.train.visible = t >= 0 && front > L.zTop - 75 && front - T.trainLength < L.zBottom + 14;

    this.ctx.stage.setRumble(t >= 0 && this.turn.frozenAt == null ? shakeAt(t, T, CFG) : 0);
    if (this.turn && !this.turn.slammed && t >= T.crushAt) {
      this.turn.slammed = true;
      this.ctx.stage.shake(CFG.crushShake, 0.4);
    }

    // 쓸려가는 사람은 열차 앞면에 붙어 화면 아래로 밀려간다
    for (const [id, view] of this.swept) {
      const p = view.root.position;
      p.z = Math.max(p.z, front + 0.45);
      p.x = Math.min(TRAIN_HALF_W - 0.4, Math.max(-TRAIN_HALF_W + 0.4, p.x));
      p.y = 0.25;
      if (p.z > L.zBottom + 10) {
        view.root.visible = false;
        this.swept.delete(id);
      }
    }
    // 내려오는 피스톤 밑에 있으면 그만큼 납작해진다
    for (const view of this.ctx.views.values()) {
      const p = view.root.position;
      const i = alcoveIndexAt(L, p.x, p.z);
      view.body.scale.y = i < 0 ? 1 : Math.min(1, Math.max(0.06, this.pistons.bottomY(i) / BODY_H));
    }
  }

  /** 내 캐릭터 이동 범위: 통로 + 열린 구역 + (압착 판정까지) 이미 들어가 있는 구역. 다른 사람이 주인인 구역은 제외 */
  _constrain(x, z, x0, z0) {
    const t = this._time();
    const { T, layout: L } = this;
    const stay = t < T.crushAt + CRUSH_GRACE ? enteredAlcoveAt(L, x0, z0, R) : -1;
    const green = this.turn ? this.turn.green : null;
    const usable = (i) => !this.owners[i] || this.owners[i] === this.myId;
    return clampToArea(L, x, z, (i) => usable(i) && (i === stay || isAlcoveOpen(t, T, !!green && green.has(i))), R);
  }

  /** 내 발 중심 기준으로 열차·압착 판정 */
  _checkLocal(t) {
    const me = this.ctx.local;
    if (!me || !me.alive || !this.turn || this.ctx.session.phase !== 'playing') return;
    const { T, layout: L } = this;
    // 구역에 들어가면 주인 요청, 나오면 반납 (먼저 요청한 사람만 남고 나머지는 밀려난다)
    const a = enteredAlcoveAt(L, me.x, me.z, R);
    if (a !== this.myAlcove) {
      if (this.myAlcove >= 0) this.sendEventToHost({ k: 'release', a: this.myAlcove });
      if (a >= 0) this.sendEventToHost({ k: 'claim', a });
      this.myAlcove = a;
    }
    if (t >= T.arriveAt && isHitByTrain(L, me.x, me.z, trainFrontZ(t, T, L.zTop), T.trainLength, R)) {
      this._die('train');
      return;
    }
    if (t >= T.crushAt && !this.turn.crushChecked) {
      this.turn.crushChecked = true;
      if (alcoveIndexAt(L, me.x, me.z) >= 0) this._die('crush');
    }
  }

  _die(cause) {
    if (!this.ctx.local.eliminate()) return;
    this.ctx.markEliminated(this.myId);
    this.ctx.hud.flash('탈락!');
    this._playDeath(this.myId, cause);
    this.sendEventToHost({ k: 'elim', n: this.turn.n, c: cause });
  }

  _playDeath(id, cause) {
    const view = this.ctx.views.get(id);
    if (!view) return;
    if (cause === 'train') {
      view.fall(0, false);
      this.swept.set(id, view);
    } else if (cause === 'crush') {
      view.root.visible = false; // 피스톤이 구역을 꽉 채우며 내려와 있다
    }
  }

  _onOut(d) {
    this.ctx.markEliminated(d.id);
    if (d.id === this.myId) {
      // 방장이 탈락 처리한 경우 (보고가 늦게 도착하는 등)
      if (this.ctx.local && this.ctx.local.eliminate()) {
        this.ctx.hud.flash('탈락!');
        this._playDeath(d.id, d.c);
      }
      return;
    }
    if (d.c) this.ctx.hud.feed(`${this.ctx.session.name(d.id)} ${d.c === 'crush' ? '압사' : '열차에 치임'}`);
    this._playDeath(d.id, d.c);
  }

  // ===== 방장 전용 =====

  _hostBegin() {
    const roster = this.ctx.activeRoster();
    this.h = {
      rng: createRng(randomSeed()),
      turn: 0,
      alive: new Set(roster),
      startCount: roster.length,
      groups: [], // 탈락 묶음, 먼저 탈락한 순서
      owners: [], // 구역별 주인 ID
      ended: false,
      timers: new Set(),
      endCheckPending: false,
    };
    this._hostNextTurn();
  }

  _hostLater(seconds, fn) {
    const h = this.h;
    const id = setTimeout(() => {
      h.timers.delete(id);
      if (!this.disposed) fn();
    }, seconds * 1000);
    h.timers.add(id);
  }

  _hostNextTurn() {
    const h = this.h;
    if (h.ended) return;
    if (h.alive.size <= (h.startCount > 1 ? 1 : 0)) {
      this._hostFinish();
      return;
    }
    h.turn += 1;
    h.owners = new Array(this.layout.count).fill(null);
    const count = greenCountForTurn(h.startCount, h.turn, this.layout.count);
    this.broadcastEvent({ k: 'turn', n: h.turn, g: pickGreens(h.rng, count, this.layout.count) });
    this._hostLater(this.T.period, () => this._hostNextTurn());
  }

  onHostEvent(fromId, d) {
    if (!this.h) return;
    if (d.k === 'claim' || d.k === 'release') {
      this._hostOwn(fromId, d.a, d.k === 'claim');
      return;
    }
    if (d.k !== 'elim') return;
    const cause = d.c === 'crush' ? 'crush' : 'train';
    const n = Number.isInteger(d.n) ? d.n : this.h.turn;
    this._hostEliminate(fromId, `${cause}-${n}`, cause);
  }

  onPlayerLeft(id) {
    this._hostEliminate(id, null, null);
  }

  /** 구역 주인 정하기: 비어 있을 때 먼저 요청한 사람이 주인, 주인이 나오면 반납 */
  _hostOwn(id, a, claim) {
    const h = this.h;
    if (h.ended || !h.alive.has(id) || !Number.isInteger(a) || a < 0 || a >= this.layout.count) return;
    if (claim ? h.owners[a] : h.owners[a] !== id) return;
    h.owners[a] = claim ? id : null;
    this.broadcastEvent({ k: 'own', a, id: h.owners[a] });
  }

  /** key가 같은 탈락(같은 턴, 같은 원인)은 공동 순위 */
  _hostEliminate(id, key, cause) {
    const h = this.h;
    if (!h || h.ended || !h.alive.has(id)) return;
    h.alive.delete(id);
    h.owners.forEach((o, a) => {
      if (o === id) {
        h.owners[a] = null;
        this.broadcastEvent({ k: 'own', a, id: null });
      }
    });
    let group = key ? h.groups.find((g) => g.key === key) : null;
    if (!group) {
      group = { key, ids: [] };
      h.groups.push(group);
    }
    group.ids.push(id);
    this.broadcastEvent({ k: 'out', id, c: cause });
    if (!h.endCheckPending) {
      // 같은 순간 탈락한 사람들의 보고를 조금 기다렸다가 판단
      h.endCheckPending = true;
      this._hostLater(CFG.endCheckDelay, () => {
        h.endCheckPending = false;
        this._hostCheckEnd();
      });
    }
  }

  _hostCheckEnd() {
    const h = this.h;
    if (h.ended) return;
    const threshold = h.startCount > 1 ? 1 : 0; // 혼자 테스트할 때는 탈락할 때까지 진행
    if (h.alive.size <= threshold) this._hostFinish();
  }

  _hostFinish() {
    const h = this.h;
    h.ended = true;
    for (const id of h.timers) clearTimeout(id);
    h.timers.clear();
    const groups = [];
    if (h.alive.size) groups.push([...h.alive]);
    for (let i = h.groups.length - 1; i >= 0; i--) groups.push(h.groups[i].ids.slice());
    this.finishTimer = setTimeout(() => this.finish(groups), CFG.endHoldSeconds * 1000);
  }

  dispose() {
    super.dispose();
    if (this.h) for (const id of this.h.timers) clearTimeout(id);
    clearTimeout(this.finishTimer);
    this.corridor?.userData.dispose();
    this.pistons?.dispose();
    this.shutter?.dispose();
    this.train?.userData.dispose();
    const { stage, room } = this.ctx;
    stage.setRumble(0);
    stage.setView();
    room.group.visible = true;
  }
}

export const trainDodgeDef = {
  id: 'trainDodge',
  title: '열차 피하기',
  description: '열차가 오기 전에 초록불 구역에 숨으세요. 한 구역에는 한 명만 들어갈 수 있고, 열차가 지나가면 압착기가 내려옵니다!',
  computeSpawns(roster) {
    const spots = spawnSpots(corridorLayout(CFG), roster.length, createRng(randomSeed()));
    const spawns = {};
    roster.forEach((id, i) => {
      const s = spots[i % spots.length];
      spawns[id] = [s.x, s.z];
    });
    return spawns;
  },
  create: (ctx) => new TrainDodgeGame(ctx),
};
