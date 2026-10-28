import { CONFIG } from '../../config.js';
import { MinigameBase } from '../../core/minigameBase.js';
import { createRng, randomSeed } from '../../core/random.js';
import { isTyping } from '../../player/input.js';
import { EAT, STAB, applyAct, isFinished, newDiner, rankGroups, rollStab, seatLayout } from './dinnerRules.js';
import { createWatchPlan, firstWatchIn, paperDown } from './watchPlan.js';
import { createDiningRoom, diningView } from './diningRoom.js';
import { HostFigure } from './hostFigure.js';
import { createTableware } from './plateView.js';
import { Diner, createGoreKit } from './dinerPose.js';

const CFG = CONFIG.dinnerManners;
const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * 식사 예절 미니게임
 * - 방장: 집주인 시간표 시드를 알리고(go), 받은 동작을 확인해 모두에게 알린다(act).
 *   걸렸다(caught)·다 먹었다(done)는 보고를 받아 모두에게 알리고, 남은 사람이 없으면 순위를 정한다.
 * - 모두: 시드로 같은 시간표를 만들어 신문을 움직인다. 시각은 각자 go를 받은 순간이 0초.
 *   걸렸는지는 내 화면 기준으로 판정해서 바로 쓰러지고 방장에게 보고한다 (조작 방지는 하지 않음).
 */
class DinnerMannersGame extends MinigameBase {
  constructor(ctx) {
    super(ctx);
    this.plan = null; // 집주인 시간표 (go를 받은 뒤)
    this.goAt = 0;
    this.me = null; // 내 식사 상태 (살아서 먹는 동안만)
    this.myAct = null; // 진행 중인 내 동작 { start, end }
    this.note = ''; // 방금 찍기 결과 (헛손질 등)
    this.myResult = null; // 'dead' | 'done'
    this.rng = createRng(randomSeed()); // 꽂히는 개수는 내 화면에서 정해 방장에게 알린다
    this.out = new Set(); // 죽었거나 다 먹어서 화면 처리가 끝난 사람
    this.h = null; // 방장 전용 상태
    this.finishTimer = null;
    this._onKey = (e) => this._handleKey(e);
  }

  // ===== 화면 구성 =====

  mount() {
    const { stage, room, roster, views, local } = this.ctx;
    room.group.visible = false; // 기호 타일 방 대신 창고를 쓴다
    stage.setLightLevel(CFG.lightLevel);
    this.layout = seatLayout(roster.length, CFG);
    this.dining = createDiningRoom(this.layout);
    this.tableware = createTableware();
    this.gore = createGoreKit();
    this.host = new HostFigure(CFG);
    this.host.group.position.z = this.layout.hostZ;
    this.myIndex = roster.indexOf(this.myId);
    this.diners = roster.map(
      (id, i) => new Diner({ view: views.get(id), seat: this.layout.seats[i], tableware: this.tableware, gore: this.gore, cfg: CFG, seed: i * 7919 + 1 }),
    );
    stage.scene.add(this.dining.group, this.host.group, ...this.diners.map((d) => d.group));
    if (local) local.ry = this.layout.seats[this.myIndex].facing;
    stage.setView(diningView(this.layout, CFG));
  }

  begin() {
    this.ctx.local?.setControllable(false); // 이 게임에서는 걷기·밀치기 없음
    document.activeElement?.blur?.(); // 버튼에 포커스가 남아 있으면 엔터·스페이스가 버튼을 누르므로
    window.addEventListener('keydown', this._onKey);
    if (this.myIndex >= 0) this.me = newDiner(CFG);
    this._status();
    if (this.isHost) this._hostBegin();
  }

  onEvent(d) {
    if (d.k === 'go') this._onGo(d);
    else if (d.k === 'act') this._onAct(d);
    else if (d.k === 'shot') this._shoot(d.id);
    else if (d.k === 'done') this._finished(d.id);
  }

  _onGo(d) {
    if (this.plan) return;
    this.plan = createWatchPlan(Number(d.s) >>> 0, CFG);
    this.goAt = performance.now();
  }

  _onAct(d) {
    if (d.id === this.myId) return; // 내 동작은 누르는 순간 이미 반영했다
    const i = this.ctx.roster.indexOf(d.id);
    if (i >= 0) this.diners[i].play(d.a, d.p, d.f);
  }

  /** 집주인이 이 사람을 쏜다. 쓰러지는 건 총이 발사되는 순간 */
  _shoot(id) {
    const i = this.ctx.roster.indexOf(id);
    if (i < 0 || this.out.has(id)) return;
    this.out.add(id);
    const diner = this.diners[i];
    this.host.queueShot(diner.headPosition(), () => {
      diner.die();
      this.ctx.stage.shake(0.12, 0.3);
      this.ctx.markEliminated(id);
      if (id === this.myId) this.ctx.hud.flash('들켰다!', 1600);
      else this.ctx.hud.feed(`${this.ctx.session.name(id)} 총살`);
    });
  }

  _finished(id) {
    const i = this.ctx.roster.indexOf(id);
    if (i < 0 || this.out.has(id)) return;
    this.out.add(id);
    this.diners[i].finish();
    if (id === this.myId) this.ctx.hud.flash('다 먹었다!', 1600);
    else this.ctx.hud.feed(`${this.ctx.session.name(id)} 다 먹음`);
  }

  // ===== 매 프레임 =====

  _now() {
    return this.plan ? (performance.now() - this.goAt) / 1000 : 0;
  }

  update(dt) {
    const t = this._now();
    if (this.me && this.plan) this._checkMe(t);
    this.host.update(dt, this.plan ? paperDown(this.plan, t) : 0);
    for (const d of this.diners) d.update(dt);
    this.dining.update(performance.now() / 1000);
  }

  /** 내 동작이 집주인이 보는 시간과 겹쳤는지, 다 먹었는지 */
  _checkMe(t) {
    if (this.myAct && !this._settleAct(t)) return;
    if (this.myAct || !isFinished(this.me, t)) return;
    const doneAt = round3(this.me.busyUntil);
    this.me = null;
    this.myResult = 'done';
    this.sendEventToHost({ k: 'done', t: doneAt });
    this._finished(this.myId);
    this._status();
  }

  /** 진행 중인 동작을 t까지 확인한다. 걸렸으면 false. 끝난 동작은 지운다 */
  _settleAct(t) {
    const act = this.myAct;
    const hit = firstWatchIn(this.plan, act.start, Math.min(t, act.end));
    if (hit != null) {
      this._caught(hit);
      return false;
    }
    if (t >= act.end) this.myAct = null;
    return true;
  }

  _caught(at) {
    this.me = null;
    this.myResult = 'dead';
    this.myAct = null;
    this.ctx.local?.eliminate();
    this.sendEventToHost({ k: 'caught', t: round3(at) });
    this._shoot(this.myId);
    this._status();
  }

  // ===== 입력 =====

  _handleKey(e) {
    if (e.repeat || isTyping(e)) return;
    const a = e.code === 'Space' ? STAB : e.code === 'Enter' || e.code === 'NumpadEnter' ? EAT : null;
    if (!a) return;
    e.preventDefault();
    if (!this.plan || !this.me || this.ctx.session.phase !== 'playing') return;
    const t = round3(this._now());
    if (this.myAct && (!this._settleAct(t) || this.myAct)) return; // 먼저 시작한 동작은 끝날 때까지 멈출 수 없다
    let n;
    let note = '';
    if (a === STAB) {
      const r = rollStab(this.rng, this.me, CFG);
      if (!r) return; // 접시가 비었으면 먹기만 남음
      n = r.n;
      if (r.why === 'full') note = '포크가 꽉 찼다';
      else if (r.why === 'miss') note = '콩이 안 찍혔다';
    } else {
      if (this.me.fork <= 0) return;
      n = this.me.fork;
    }
    if (!applyAct(this.me, a, n, t, CFG)) return;
    this.myAct = { start: t, end: this.me.busyUntil };
    this.diners[this.myIndex].play(a, this.me.plate, this.me.fork);
    this.sendEventToHost({ k: 'act', a, n, t });
    this.note = note;
    this._status();
  }

  _status() {
    const hud = this.ctx.hud;
    if (this.me) {
      const note = this.note ? ` · ${this.note}` : '';
      hud.setHint(`스페이스: 콩 찍기 · 엔터: 먹기 · 포크 ${this.me.fork}/${CFG.forkCapacity} · 접시 ${this.me.plate}${note}`);
    } else if (this.myResult === 'done') {
      hud.setHint('다 먹었습니다 · 다른 사람을 기다리는 중');
    } else {
      hud.setHint(this.myResult === 'dead' ? '들켰습니다 · 관전 중' : '관전 중');
    }
  }

  // ===== 방장 전용 =====

  _hostNow() {
    return (performance.now() - this.h.start) / 1000;
  }

  _hostBegin() {
    const roster = this.ctx.activeRoster();
    this.h = {
      alive: new Set(roster), // 아직 먹고 있는 사람
      diners: new Map(roster.map((id) => [id, newDiner(CFG)])),
      finished: [], // { id, t } 다 먹은 시각
      dead: [], // { id, t } 걸린 시각 (나간 사람은 나간 시각)
      ended: false,
      start: performance.now(),
    };
    this.broadcastEvent({ k: 'go', s: randomSeed() });
    this._hostCheckEnd();
  }

  onHostEvent(fromId, d) {
    const h = this.h;
    if (!h || h.ended || !h.alive.has(fromId)) return;
    const din = h.diners.get(fromId);
    const t = Number(d.t);
    if (d.k === 'act') {
      if (!applyAct(din, d.a, d.n, t, CFG)) return;
      this.broadcastEvent({ k: 'act', id: fromId, a: d.a, p: din.plate, f: din.fork });
    } else if (d.k === 'caught') {
      h.alive.delete(fromId);
      h.dead.push({ id: fromId, t: Number.isFinite(t) ? t : this._hostNow() });
      this.broadcastEvent({ k: 'shot', id: fromId });
      this._hostCheckEnd();
    } else if (d.k === 'done') {
      if (!Number.isFinite(t) || !isFinished(din, t)) return;
      h.alive.delete(fromId);
      h.finished.push({ id: fromId, t });
      this.broadcastEvent({ k: 'done', id: fromId });
      this._hostCheckEnd();
    }
  }

  onPlayerLeft(id) {
    const h = this.h;
    if (!h || h.ended || !h.alive.has(id)) return;
    h.alive.delete(id);
    h.dead.push({ id, t: this._hostNow() });
    this._hostCheckEnd();
  }

  /** 먹고 있는 사람이 없으면 끝 (시간 제한 없음) */
  _hostCheckEnd() {
    const h = this.h;
    if (h.ended || h.alive.size > 0) return;
    h.ended = true;
    const groups = rankGroups(h.finished, h.dead);
    this.finishTimer = setTimeout(() => this.finish(groups), CFG.endHoldSeconds * 1000);
  }

  dispose() {
    super.dispose();
    window.removeEventListener('keydown', this._onKey);
    clearTimeout(this.finishTimer);
    for (const d of this.diners ?? []) d.dispose();
    this.host?.dispose();
    this.dining?.dispose();
    this.tableware?.dispose();
    this.gore?.dispose();
    const { stage, room } = this.ctx;
    stage.setLightLevel(1);
    stage.setView();
    room.group.visible = true;
  }
}

export const dinnerMannersDef = {
  id: 'dinnerManners',
  title: '식사 예절',
  description: '좋은 손님이 되세요. 집주인 눈앞에서 먹지 마세요. 남김없이 드세요.',
  computeSpawns(roster) {
    const { seats } = seatLayout(roster.length, CFG);
    const spawns = {};
    roster.forEach((id, i) => {
      spawns[id] = [seats[i].x, seats[i].z];
    });
    return spawns;
  },
  create: (ctx) => new DinnerMannersGame(ctx),
};
