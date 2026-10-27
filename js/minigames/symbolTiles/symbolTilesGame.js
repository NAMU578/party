import { CONFIG } from '../../config.js';
import { MinigameBase } from '../../core/minigameBase.js';
import { createRng, randInt, randomSeed } from '../../core/random.js';
import {
  SYMBOL_COUNT,
  applyRemoval,
  cellCenter,
  cellIndexAt,
  countAlive,
  gridBounds,
  gridLayout,
  pickSpawnCells,
  planRound,
  tileCountOf,
} from './symbolTilesRules.js';
import { fallingTileY, isTileSolidAt, roundTimes, symbolPhaseAt } from './roundTimeline.js';
import { TileGrid } from './tileGrid.js';
import { WallPanels } from './wallPanels.js';
import { createSymbolSet } from './symbolTextures.js';
import { createPit } from './pit.js';

const CFG = CONFIG.symbolTiles;
const GRAVITY = CONFIG.player.gravity;

/**
 * 기호 타일 미니게임
 * - 방장: 라운드마다 기호와 사라질 타일을 정해서 알리고(round), 탈락 보고를 모아 순위를 정한다.
 * - 모두: 받은 라운드 정보를 시간표대로 연출하고, 내 캐릭터가 서 있는 칸이 꺼지면 스스로 탈락을 보고한다.
 */
class SymbolTilesGame extends MinigameBase {
  constructor(ctx) {
    super(ctx);
    this.layout = gridLayout(CFG);
    this.times = roundTimes(CFG);
    this.count = tileCountOf(this.layout);
    this.gone = new Array(this.count).fill(false); // 이전 라운드까지 영구 제거된 타일
    this.round = null;
    this.visualRng = createRng(randomSeed());
    this.h = null; // 방장 전용 상태
    this.finishTimer = null;
  }

  // ===== 화면 구성 =====

  mount() {
    const { stage, room, local } = this.ctx;
    room.setLobbyFloorVisible(false);
    this.symbolSet = createSymbolSet(2);
    this.grid = new TileGrid(this.layout, CFG, this.symbolSet);
    this.pit = createPit(this.layout, { depth: CFG.pitDepth });
    this.panels = new WallPanels(room.panelAnchors, this.symbolSet);
    stage.scene.add(this.grid.group, this.pit);
    if (local) local.setBounds(gridBounds(this.layout, 0.3));
  }

  begin() {
    this.ctx.hud.setHint('WASD 이동 · 스페이스바 밀치기 · 벽의 기호와 같은 타일만 남습니다');
    if (this.isHost) this._hostBegin();
  }

  update(dt) {
    this.panels.update(dt);
    if (!this.round) return;
    const t = (performance.now() - this.round.start) / 1000;
    this._render(t);
    this._checkLocalFall(t);
  }

  onEvent(d) {
    if (d.k === 'round') this._onRound(d);
    else if (d.k === 'out') this._onOut(d);
  }

  _onRound(d) {
    if (this.round) for (const i of this.round.removed) this.gone[i] = true;
    d.sym.forEach((s, i) => {
      if (s < 0) this.gone[i] = true;
    });
    const falling = new Set();
    d.sym.forEach((s, i) => {
      if (s >= 0 && s !== d.wall) falling.add(i);
    });
    // 깜빡일 때 보여줄 무작위 기호 (연출용이라 각자 따로 뽑아도 된다)
    const flicker = [];
    for (let k = 0; k < CFG.flickerCount; k++) {
      flicker.push({
        wall: randInt(this.visualRng, SYMBOL_COUNT),
        tiles: d.sym.map(() => randInt(this.visualRng, SYMBOL_COUNT)),
      });
    }
    this.round = {
      r: d.r,
      wall: d.wall,
      sym: d.sym,
      falling,
      removed: new Set(d.rm),
      start: performance.now(),
      flicker,
      dropped: false,
    };
  }

  _render(t) {
    const R = this.round;
    const phase = symbolPhaseAt(t, CFG, this.times);
    if (phase.mode === 'flicker') this.panels.setSymbol(phase.on ? R.flicker[phase.blink].wall : null);
    else if (phase.mode === 'final') this.panels.setSymbol(R.wall);
    else this.panels.setSymbol(null);

    for (let i = 0; i < this.count; i++) {
      if (this.gone[i]) {
        this.grid.setTile(i, 0, false);
        continue;
      }
      let y = 0;
      let visible = true;
      let tumble = 0;
      if (R.falling.has(i)) {
        const fy = fallingTileY(t, this.times, CFG, R.removed.has(i), GRAVITY);
        if (fy === null || fy <= -CFG.pitDepth + 1) visible = false;
        else y = fy;
        if (t >= this.times.dropAt && t < this.times.riseAt) tumble = Math.min(1, (t - this.times.dropAt) / 1.5);
      }
      this.grid.setTile(i, y, visible, tumble);

      let sym = null;
      if (phase.mode === 'flicker') sym = phase.on ? R.flicker[phase.blink].tiles[i] : null;
      else if (phase.mode === 'final') sym = R.sym[i];
      this.grid.setSymbol(i, sym);
    }

    if (!R.dropped && t >= this.times.dropAt) {
      R.dropped = true;
      if (R.falling.size) this.ctx.stage.shake(0.28, 0.6);
    }
  }

  _isSolid(idx, t) {
    if (idx < 0 || this.gone[idx]) return false;
    const R = this.round;
    if (!R) return true;
    return isTileSolidAt(t, this.times, R.falling.has(idx), R.removed.has(idx), CFG.solidLead);
  }

  /** 내 발 중심이 있는 칸이 꺼졌으면 떨어지고 방장에게 보고 */
  _checkLocalFall(t) {
    const me = this.ctx.local;
    if (!me || !me.alive || this.ctx.session.phase !== 'playing') return;
    const idx = cellIndexAt(this.layout, me.x, me.z);
    if (this._isSolid(idx, t)) return;
    const R = this.round;
    const atDrop = R.falling.has(idx) && t >= this.times.dropAt && t < this.times.dropAt + CFG.dropGraceSeconds;
    me.fall(atDrop ? t - this.times.dropAt : 0);
    this.ctx.markEliminated(this.myId);
    this.ctx.hud.flash('탈락!');
    this.sendEventToHost({ k: 'elim', r: R.r, drop: atDrop });
  }

  _onOut(d) {
    this.ctx.markEliminated(d.id);
    if (d.id === this.myId) {
      const me = this.ctx.local;
      if (me && me.alive) {
        // 방장이 강제로 탈락 처리한 경우 (마지막 타일까지 사라진 라운드 등)
        me.fall(0);
        this.ctx.hud.flash('탈락!');
      }
      return;
    }
    this.ctx.hud.feed(`${this.ctx.session.name(d.id)} 탈락`);
    const view = this.ctx.views.get(d.id);
    if (!view) return;
    // 내 화면의 낙하 시점에 맞춰, 타일과 같이 떨어지는 것처럼 보이게 시작 시간을 맞춘다
    let elapsed = 0;
    if (d.drop && this.round && this.round.r === d.r) {
      elapsed = Math.max(0, (performance.now() - this.round.start) / 1000 - this.times.dropAt);
    }
    view.fall(elapsed);
  }

  // ===== 방장 전용 =====

  _hostBegin() {
    const roster = this.ctx.activeRoster();
    this.h = {
      rng: createRng(randomSeed()),
      tileAlive: new Array(this.count).fill(true),
      round: 0,
      alive: new Set(roster),
      startCount: roster.length,
      groups: [], // 탈락 묶음, 먼저 탈락한 순서
      ended: false,
      timers: new Set(),
      endCheckPending: false,
    };
    this._hostLater(CFG.firstRoundDelay, () => this._hostNextRound());
  }

  _hostLater(seconds, fn) {
    const h = this.h;
    const id = setTimeout(() => {
      h.timers.delete(id);
      if (!this.disposed) fn();
    }, seconds * 1000);
    h.timers.add(id);
  }

  _hostNextRound() {
    const h = this.h;
    if (h.ended) return;
    // 탈락 직후 종료 확인을 기다리는 중이면 새 라운드를 시작하지 않고 바로 끝낸다
    if (h.alive.size <= (h.startCount > 1 ? 1 : 0)) {
      this._hostFinish();
      return;
    }
    const plan = planRound(h.tileAlive, h.rng, CFG);
    h.round += 1;
    h.tileAlive = applyRemoval(h.tileAlive, plan.removed);
    this.broadcastEvent({ k: 'round', r: h.round, wall: plan.wall, sym: plan.symbols, rm: plan.removed });

    if (countAlive(h.tileAlive) === 0) {
      // 마지막 타일까지 사라지는 라운드: 보고가 늦거나 빠져도 끝나도록 남은 사람을 같은 묶음으로 탈락 처리
      const r = h.round;
      this._hostLater(this.times.dropAt + CFG.endCheckDelay + 0.5, () => {
        for (const id of [...h.alive]) this._hostEliminate(id, `drop-${r}`);
        this._hostCheckEnd();
      });
    } else {
      this._hostLater(this.times.endAt, () => this._hostNextRound());
    }
  }

  onHostEvent(fromId, d) {
    if (d.k === 'elim') this._hostEliminate(fromId, d.drop ? `drop-${d.r}` : null);
  }

  onPlayerLeft(id) {
    this._hostEliminate(id, null);
  }

  /** groupKey가 같은 탈락은 공동 순위. 낙하 순간의 탈락은 `drop-라운드` 키로 묶는다. */
  _hostEliminate(id, groupKey) {
    const h = this.h;
    if (!h || h.ended || !h.alive.has(id)) return;
    h.alive.delete(id);
    let group = groupKey ? h.groups.find((g) => g.key === groupKey) : null;
    if (!group) {
      group = { key: groupKey, ids: [] };
      h.groups.push(group);
    }
    group.ids.push(id);
    const r = groupKey ? Number(groupKey.slice(5)) : h.round;
    this.broadcastEvent({ k: 'out', id, r, drop: !!groupKey });
    if (!h.endCheckPending) {
      // 같은 순간 떨어진 사람들의 보고를 조금 기다렸다가 판단
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
    const threshold = h.startCount > 1 ? 1 : 0; // 혼자 테스트할 때는 떨어질 때까지 진행
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
    this.grid?.dispose();
    this.panels?.dispose();
    this.pit?.userData.dispose();
    this.symbolSet?.dispose();
  }
}

export const symbolTilesDef = {
  id: 'symbolTiles',
  title: '기호 타일',
  description: '벽에 뜬 기호와 같은 타일만 남고 나머지는 떨어집니다. 서둘러 같은 기호 위로 이동하세요!',
  computeSpawns(roster) {
    const layout = gridLayout(CFG);
    const cells = pickSpawnCells(layout, roster.length, createRng(randomSeed()));
    const spawns = {};
    roster.forEach((id, i) => {
      const c = cellCenter(layout, cells[i]);
      spawns[id] = [Math.round(c.x * 100) / 100, Math.round(c.z * 100) / 100];
    });
    return spawns;
  },
  create: (ctx) => new SymbolTilesGame(ctx),
};
