import * as THREE from 'three';
import { CONFIG } from '../../config.js';
import { MinigameBase } from '../../core/minigameBase.js';
import { createRng, randomSeed } from '../../core/random.js';
import { isTyping } from '../../player/input.js';
import { BURN, PASS, applyAction, canAct, makeItems, newSheet, pickLosers, stationLayout } from './sortingRules.js';
import { lookBlend, phaseAt, pressLift, turnTimes } from './sortTimeline.js';
import { createFactory } from './factory.js';
import { createStationKit, Station } from './station.js';
import { ItemModels } from './itemModels.js';
import { Lane } from './lane.js';
import { TINT, TINT_DOOM } from './scoreDisplay.js';
import { loserView, stationView } from './cameraRig.js';

const CFG = CONFIG.sortingLine;
const BODY_H = 2.0; // 캐릭터 키: 압착기 밑면이 이보다 낮아지면 그만큼 납작해진다

/**
 * 분류 작업 미니게임
 * - 방장: 턴마다 사람별 물건 시드를 정해 알리고(turn), 받은 행동을 판정해 모두에게 다시 알린다(act).
 *   작업 시간이 끝나면 점수를 공개하며 꼴찌를 정하고(reveal), 압착기가 바닥에 닿을 때 탈락 처리한다.
 * - 모두: 시드로 모든 사람의 물건 목록을 똑같이 만들어 벨트를 그린다.
 *   내 입력은 바로 화면에 반영하고 방장에게 보낸다 (판정 함수가 같아서 점수도 같게 나온다).
 */
class SortingLineGame extends MinigameBase {
  constructor(ctx) {
    super(ctx);
    this.T = turnTimes(CFG);
    this.turn = null; // { n, start, phase, reveal: { at, sc, out } | null, slammed }
    this.mySheet = null; // 이번 턴 내 작업 기록 (살아 있을 때만)
    this.myItems = null;
    this.dead = new Set(); // 압사한 사람
    this.gone = new Set(); // 나간 사람 (작업대 정리 완료)
    this.lookView = null; // 이번 턴 꼴찌를 보는 시점
    this.h = null; // 방장 전용 상태
    this.finishTimer = null;
    this._onKey = (e) => this._handleKey(e);
    this._camPos = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
  }

  // ===== 화면 구성 =====

  mount() {
    const { stage, room, roster, views, local } = this.ctx;
    room.group.visible = false; // 기호 타일 방 대신 공장을 쓴다
    stage.setLightLevel(CFG.lightLevel);
    this.layout = stationLayout(roster.length, CFG);
    this.factory = createFactory();
    this.kit = createStationKit();
    this.models = new ItemModels();
    this.flyers = new THREE.Group();
    this.stations = this.layout.stations.map((st) => new Station(this.kit, st, CFG));
    this.lanes = this.stations.map(
      (station) => new Lane({ station, models: this.models, cfg: CFG, flyers: this.flyers, onLand: () => this.factory.flare() }),
    );
    stage.scene.add(this.factory.group, this.flyers, ...this.stations.map((s) => s.group));

    // 모두 자기 작업대에 서서 소각로를 바라본다
    this.myIndex = roster.indexOf(this.myId);
    roster.forEach((id, i) => {
      const st = this.layout.stations[i];
      views.get(id)?.snapTo(st.standX, st.standZ, st.facing);
    });
    if (local) local.ry = this.layout.stations[this.myIndex].facing;
    const me = views.get(this.myId);
    if (me) me.tag.visible = false; // 내 이름표는 카메라 바로 앞이라 숨긴다

    this.homeView = stationView(this.layout.stations[Math.max(0, this.myIndex)], CFG);
    stage.setView({ fov: CFG.fov, position: this.homeView.position.toArray(), lookAt: this.homeView.target.toArray() });
  }

  begin() {
    this.ctx.local?.setControllable(false); // 이 게임에서는 걷기·밀치기 없음
    document.activeElement?.blur?.(); // 버튼에 포커스가 남아 있으면 엔터·스페이스가 버튼을 누르므로
    window.addEventListener('keydown', this._onKey);
    this.ctx.hud.setHint('스페이스: 예술품 버리기 · 엔터: 장치 넘기기 · 틀리면 벨트가 잠깐 걸립니다');
    if (this.isHost) this._hostBegin();
  }

  onEvent(d) {
    if (d.k === 'turn') this._onTurn(d);
    else if (d.k === 'act') this._onAct(d);
    else if (d.k === 'reveal') this._onReveal(d);
  }

  _onTurn(d) {
    const seeds = d.s || {};
    this.turn = { n: d.n, start: performance.now(), phase: null, reveal: null, slammed: false };
    this.lookView = null;
    this.ctx.roster.forEach((id, i) => {
      this.stations[i].display.set(null, null);
      if (Number.isInteger(seeds[id])) {
        this.lanes[i].start(makeItems(seeds[id], CFG.itemsPerTurn));
        this.stations[i].setLamp('ready');
      } else {
        this.lanes[i].clear();
        this.stations[i].setLamp('off');
      }
    });
    const mine = this.myIndex >= 0 && Number.isInteger(seeds[this.myId]);
    this.mySheet = mine ? newSheet() : null;
    this.myItems = mine ? this.lanes[this.myIndex].items : null;
  }

  _onAct(d) {
    if (d.id === this.myId) return; // 내 행동은 누르는 순간 이미 반영했다
    const i = this.ctx.roster.indexOf(d.id);
    if (i >= 0 && this.lanes[i].act(d.i, d.a) != null) this.ctx.views.get(d.id)?.playPush();
  }

  _onReveal(d) {
    const tr = this.turn;
    if (!tr || d.n !== tr.n) return;
    const roster = this.ctx.roster;
    const out = (d.out || []).filter((id) => roster.includes(id));
    tr.reveal = { at: performance.now(), sc: d.sc || {}, out };
    if (out.length) {
      const losers = out.map((id) => this.layout.stations[roster.indexOf(id)]);
      this.lookView = loserView(this.layout.stations[Math.max(0, this.myIndex)], losers, CFG, out.includes(this.myId));
    }
  }

  // ===== 매 프레임 =====

  update(dt) {
    const now = performance.now();
    const time = now / 1000;
    const tr = this.turn;
    const t = tr ? (now - tr.start) / 1000 : -1;
    if (tr) this._onPhase(phaseAt(t, this.T));
    const fill = tr ? Math.min(1, t / this.T.startAt) : 1;
    for (const lane of this.lanes) lane.update(dt, fill);
    this._checkGone();
    this._updateDisplays(time);
    this._updateCrush();
    for (const s of this.stations) s.update(dt, time);
    this._holdPoses();
    this.factory.update(dt, time);
    this._aim();
  }

  _onPhase(phase) {
    const tr = this.turn;
    if (tr.phase === phase) return;
    tr.phase = phase;
    if (phase === 'play') {
      this._setWorkingLamps('run');
      if (this.mySheet) this.ctx.hud.flash('작업 시작', 900);
    } else if (phase === 'stop') {
      for (const lane of this.lanes) lane.stop();
      this._setWorkingLamps('stop');
      if (this.mySheet) this.ctx.hud.flash('작업 끝', 900);
    }
  }

  _setWorkingLamps(state) {
    this.lanes.forEach((lane, i) => {
      if (lane.items) this.stations[i].setLamp(state);
    });
  }

  /** 나간 사람의 작업대는 비우고 불을 끈다 */
  _checkGone() {
    const players = this.ctx.session.players;
    this.ctx.roster.forEach((id, i) => {
      if (this.gone.has(id) || !players.get(id)?.left) return;
      this.gone.add(id);
      this.lanes[i].clear();
      this.stations[i].setLamp('off');
    });
  }

  /** 점수판: 진행 중에는 내 작업자 쪽 면에만 내 점수, 공개 뒤에는 모든 면에 방장이 정한 점수 */
  _updateDisplays(time) {
    const tr = this.turn;
    if (!tr) return;
    const r = tr.reveal;
    this.ctx.roster.forEach((id, i) => {
      const display = this.stations[i].display;
      if (r && id in r.sc) {
        const doomed = r.out.includes(id);
        const hidden = doomed && !tr.slammed && Math.floor(time * 6) % 2 === 1; // 압착기가 내려올 때까지 깜빡임
        const v = hidden ? null : r.sc[id];
        display.set(v, v, doomed ? TINT_DOOM : TINT);
      } else if (i === this.myIndex && this.mySheet) {
        display.set(null, this.mySheet.score);
      }
    });
  }

  /** 꼴찌 머리 위 압착기가 떨어지고, 바닥에 닿는 순간 탈락 */
  _updateCrush() {
    const tr = this.turn;
    const r = tr?.reveal;
    if (!r) return;
    const te = (performance.now() - r.at) / 1000;
    const lift = pressLift(te, CFG);
    for (const id of r.out) {
      if (this.dead.has(id)) continue;
      const station = this.stations[this.ctx.roster.indexOf(id)];
      station.setPress(lift);
      station.setLamp('doom');
      const view = this.ctx.views.get(id);
      if (view) view.body.scale.y = Math.min(1, Math.max(0.06, station.pressBottom / BODY_H));
    }
    if (!tr.slammed && te >= CFG.slamDelay) {
      tr.slammed = true;
      if (r.out.length) this.ctx.stage.shake(CFG.slamShake, 0.45);
      for (const id of r.out) this._crushed(id);
    }
  }

  _crushed(id) {
    if (this.dead.has(id)) return;
    this.dead.add(id);
    this.ctx.markEliminated(id);
    const station = this.stations[this.ctx.roster.indexOf(id)];
    station.setPress(0);
    station.setLamp('off');
    const view = this.ctx.views.get(id);
    if (view) {
      view.body.scale.y = 0.06;
      view.tag.visible = false;
    }
    if (id === this.myId) {
      this.ctx.local?.eliminate();
      this.mySheet = null;
      this.ctx.hud.flash('압사!', 1600);
    } else {
      this.ctx.hud.feed(`${this.ctx.session.name(id)} 압사`);
    }
  }

  /** 다른 사람 캐릭터는 자기 작업대에 고정 (위치 신호가 늦게 와도 돌아가지 않게) */
  _holdPoses() {
    this.ctx.roster.forEach((id, i) => {
      if (id === this.myId) return;
      const view = this.ctx.views.get(id);
      if (!view) return;
      const st = this.layout.stations[i];
      view.root.position.set(st.standX, 0, st.standZ);
      view.body.rotation.y = st.facing;
      view.setTarget(st.standX, st.standZ, st.facing, false);
    });
  }

  _aim() {
    let { position, target } = this.homeView;
    const r = this.turn?.reveal;
    if (r && this.lookView) {
      const b = lookBlend((performance.now() - r.at) / 1000, CFG);
      if (b > 0) {
        position = this._camPos.lerpVectors(position, this.lookView.position, b);
        target = this._camTarget.lerpVectors(target, this.lookView.target, b);
      }
    }
    this.ctx.stage.aim(position, target);
  }

  // ===== 입력 =====

  _handleKey(e) {
    if (e.repeat || isTyping(e)) return;
    const action = e.code === 'Space' ? BURN : e.code === 'Enter' || e.code === 'NumpadEnter' ? PASS : null;
    if (!action) return;
    e.preventDefault();
    const tr = this.turn;
    if (!tr || !this.mySheet || this.ctx.session.phase !== 'playing') return;
    // 작업 시작 후 시각 (ms 단위로 맞춰 보낸다: 방장도 같은 값으로 판정하도록)
    const t = Math.round(((performance.now() - tr.start) / 1000 - this.T.startAt) * 1000) / 1000;
    if (!canAct(this.mySheet, t, CFG)) return;
    const i = this.mySheet.next;
    if (!applyAction(this.mySheet, this.myItems, i, action, t, CFG)) return;
    this.lanes[this.myIndex].act(i, action);
    this.ctx.views.get(this.myId)?.playPush();
    this.sendEventToHost({ k: 'act', n: tr.n, i, a: action, t });
  }

  // ===== 방장 전용 =====

  _threshold() {
    return this.h.startCount > 1 ? 1 : 0; // 혼자 테스트할 때는 한 턴 하고 압사
  }

  _hostBegin() {
    const roster = this.ctx.activeRoster();
    this.h = {
      rng: createRng(randomSeed()),
      n: 0,
      alive: new Set(roster),
      startCount: roster.length,
      items: new Map(),
      sheets: new Map(),
      groups: [], // 압사·나감 묶음, 먼저 탈락한 순서
      revealed: true,
      ended: false,
      timers: new Set(),
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
    if (h.alive.size <= this._threshold()) {
      this._hostFinish();
      return;
    }
    h.n += 1;
    h.revealed = false;
    h.items.clear();
    h.sheets.clear();
    const seeds = {};
    for (const id of h.alive) {
      const seed = Math.floor(h.rng() * 2 ** 32); // 사람마다 다른 무작위 순서
      seeds[id] = seed;
      h.items.set(id, makeItems(seed, CFG.itemsPerTurn));
      h.sheets.set(id, newSheet());
    }
    this.broadcastEvent({ k: 'turn', n: h.n, s: seeds });
    this._hostLater(this.T.revealAt, () => this._hostReveal());
  }

  onHostEvent(fromId, d) {
    const h = this.h;
    if (!h || h.ended || h.revealed || d.k !== 'act' || d.n !== h.n || !h.alive.has(fromId)) return;
    const sheet = h.sheets.get(fromId);
    if (!sheet || !applyAction(sheet, h.items.get(fromId), d.i, d.a, Number(d.t), CFG)) return;
    this.broadcastEvent({ k: 'act', id: fromId, i: d.i, a: d.a });
  }

  _hostReveal() {
    const h = this.h;
    if (h.ended) return;
    h.revealed = true;
    const sc = {};
    const entries = [];
    for (const id of h.alive) {
      const s = h.sheets.get(id);
      sc[id] = s.score;
      entries.push({ id, score: s.score, lastScoreT: s.lastScoreT });
    }
    const out = pickLosers(entries);
    this.broadcastEvent({ k: 'reveal', n: h.n, sc, out });
    this._hostLater(CFG.slamDelay, () => {
      const crushed = out.filter((id) => h.alive.has(id)); // 그사이 나간 사람은 이미 처리됨
      for (const id of crushed) h.alive.delete(id);
      if (crushed.length) h.groups.push(crushed);
      if (h.alive.size <= this._threshold()) this._hostFinish();
      else this._hostLater(CFG.nextTurnDelay - CFG.slamDelay, () => this._hostNextTurn());
    });
  }

  onPlayerLeft(id) {
    const h = this.h;
    if (!h || h.ended || !h.alive.has(id)) return;
    h.alive.delete(id);
    h.groups.push([id]);
    if (h.alive.size <= this._threshold()) this._hostFinish();
  }

  _hostFinish() {
    const h = this.h;
    if (h.ended) return;
    h.ended = true;
    for (const id of h.timers) clearTimeout(id);
    h.timers.clear();
    const groups = [];
    if (h.alive.size) groups.push([...h.alive]);
    for (let i = h.groups.length - 1; i >= 0; i--) groups.push(h.groups[i]);
    this.finishTimer = setTimeout(() => this.finish(groups), CFG.endHoldSeconds * 1000);
  }

  dispose() {
    super.dispose();
    window.removeEventListener('keydown', this._onKey);
    if (this.h) for (const id of this.h.timers) clearTimeout(id);
    clearTimeout(this.finishTimer);
    for (const lane of this.lanes ?? []) lane.dispose();
    for (const s of this.stations ?? []) s.dispose();
    this.kit?.dispose();
    this.models?.dispose();
    this.factory?.dispose();
    this.flyers?.removeFromParent();
    const { stage, room } = this.ctx;
    stage.setLightLevel(1);
    stage.setView();
    room.group.visible = true;
  }
}

export const sortingLineDef = {
  id: 'sortingLine',
  title: '분류 작업',
  description: '공장에서 일하세요. 장치를 재활용하세요. 예술을 불태우세요.',
  computeSpawns(roster) {
    const { stations } = stationLayout(roster.length, CFG);
    const spawns = {};
    roster.forEach((id, i) => {
      spawns[id] = [stations[i].standX, stations[i].standZ];
    });
    return spawns;
  },
  create: (ctx) => new SortingLineGame(ctx),
};
