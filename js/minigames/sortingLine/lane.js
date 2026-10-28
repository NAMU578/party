import * as THREE from 'three';
import { BURN, correctAction } from './sortingRules.js';
import { PIT_R } from './factory.js';

// 작업대 하나의 물건 흐름: 벨트 위 물건 배치, 한 칸씩 착 넘어가는 움직임, 버린 물건이 소각로로 날아가는 포물선.
// 판정 칸(가운데)에 index번 물건이 오고, 왼쪽에 다음 물건들, 오른쪽에 넘긴 물건이 있다.
// 물건 k의 위치 x = (pos - k) × 칸 간격. pos는 index를 빠르게 따라가므로 연타해도 막히지 않는다.

const FILL_SLOTS = 3; // 턴 시작 때 왼쪽 구멍에서 물건이 굴러 나오는 칸 수
const smooth = (x) => x * x * (3 - 2 * x);

export class Lane {
  /** flyers: 날아가는 물건을 붙일 장면 그룹(월드 좌표), onLand: 물건이 소각로에 떨어질 때 */
  constructor({ station, models, cfg, flyers, onLand }) {
    this.station = station;
    this.models = models;
    this.cfg = cfg;
    this.flyers = flyers;
    this.onLand = onLand;
    this.items = null;
    this.burned = new Set();
    this.meshes = new Map(); // 물건 번호 → 모형
    this.flights = [];
    this.index = 0; // 판정 칸에 있는 물건 = 다음에 처리할 물건
    this.pos = 0;
    this.target = 0;
    this.lastShown = Infinity; // 작업이 끝나면 더 이상 새 물건이 나오지 않게
    this.running = false; // 작업이 끝나 빈 벨트가 계속 도는 중
    this.jam = 0;
  }

  /** 새 턴: 물건 목록을 받아 왼쪽 구멍에서 채운다 */
  start(items) {
    this._removeMeshes();
    this.items = items;
    this.burned.clear();
    this.index = 0;
    this.pos = this.target = -FILL_SLOTS;
    this.lastShown = Infinity;
    this.running = false;
    this.jam = 0;
  }

  /** 이번 턴에 물건이 없음 (압사·나감) */
  clear() {
    this._removeMeshes();
    this.items = null;
    this.running = false;
    this.jam = 0;
  }

  /** i번 물건에 행동 적용 (화면만). 맞았는지 돌려주고, 이미 지나간 번호면 null */
  act(i, action) {
    if (!this.items || i < this.index || i >= this.items.length) return null;
    this.index = i + 1;
    const correct = correctAction(this.items[i]) === action;
    if (!correct) this.jam = this.cfg.wrongJam;
    this.station.pull(action);
    if (action === BURN) {
      this.burned.add(i);
      this.station.kick();
      this._launch(i);
    }
    return correct;
  }

  /** 작업 끝: 남은 물건은 오른쪽으로 흘러 나가고 빈 벨트만 계속 돈다 */
  stop() {
    this.running = true;
    this.target = Math.max(this.target, this.index);
    this.lastShown = Math.floor(this.pos + (this.cfg.beltIn + 0.25) / this.cfg.slotSpacing); // _placeItems의 hi와 같은 경계
  }

  /** fill: 턴 시작 후 물건이 채워진 정도 (0~1, 다 채워지면 1) */
  update(dt, fill) {
    const cfg = this.cfg;
    if (fill < 1 && this.items) {
      this.pos = this.target = -FILL_SLOTS * (1 - smooth(fill));
    } else {
      if (this.running) this.target += cfg.beltRunSpeed * dt;
      else this.target = Math.max(this.target, this.index);
      const d = this.target - this.pos;
      this.pos = Math.abs(d) < 1e-3 ? this.target : this.pos + d * (1 - Math.exp(-cfg.beltSnap * dt));
    }
    this.jam = Math.max(0, this.jam - dt);
    this.station.setJam(this.jam > 0);
    this.station.setBelt(this.pos);
    this._placeItems();
    this._fly(dt);
  }

  _placeItems() {
    const { slotSpacing: sp, beltIn, beltOut } = this.cfg;
    const shake = this.jam > 0 ? Math.sin(performance.now() * 0.08) * 0.03 : 0; // 걸린 동안 덜덜
    const shown = new Set();
    if (this.items) {
      const lo = Math.max(0, Math.ceil(this.pos - (beltOut + 0.1) / sp));
      const hi = Math.min(this.items.length - 1, this.lastShown, Math.floor(this.pos + (beltIn + 0.25) / sp));
      for (let k = lo; k <= hi; k++) {
        if (this.burned.has(k)) continue;
        let mesh = this.meshes.get(k);
        if (!mesh) {
          mesh = this.models.create(this.items[k]);
          this.station.items.add(mesh);
          this.meshes.set(k, mesh);
        }
        mesh.position.set((this.pos - k) * sp + shake, 0, 0);
        shown.add(k);
      }
    }
    for (const [k, mesh] of this.meshes) {
      if (shown.has(k)) continue;
      mesh.removeFromParent();
      this.meshes.delete(k);
    }
  }

  /** i번 물건을 벨트에서 떼어 소각로 안 아무 곳으로 던진다 */
  _launch(i) {
    let mesh = this.meshes.get(i);
    if (mesh) {
      this.meshes.delete(i);
    } else {
      mesh = this.models.create(this.items[i]); // 아직 화면에 없던 물건 (다른 사람 벨트가 밀려 있을 때)
      this.station.items.add(mesh);
      mesh.position.set((this.pos - i) * this.cfg.slotSpacing, 0, 0);
    }
    const from = mesh.getWorldPosition(new THREE.Vector3());
    const quat = mesh.getWorldQuaternion(new THREE.Quaternion());
    this.flyers.add(mesh);
    mesh.position.copy(from);
    mesh.quaternion.copy(quat);
    const ang = Math.random() * Math.PI * 2;
    const r = Math.random() * PIT_R * 0.5;
    this.flights.push({
      mesh,
      from,
      to: new THREE.Vector3(Math.cos(ang) * r, -1.2, Math.sin(ang) * r),
      t: 0,
      height: 2.1 + Math.random() * 0.6,
      spin: [(Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9],
    });
  }

  _fly(dt) {
    if (!this.flights.length) return;
    for (const f of this.flights) {
      f.t = Math.min(1, f.t + dt / this.cfg.flightTime);
      f.mesh.position.lerpVectors(f.from, f.to, f.t);
      f.mesh.position.y += 4 * f.height * f.t * (1 - f.t);
      f.mesh.rotation.x += f.spin[0] * dt;
      f.mesh.rotation.y += f.spin[1] * dt;
      f.mesh.rotation.z += f.spin[2] * dt;
      if (f.t >= 1) {
        f.mesh.removeFromParent();
        this.onLand();
      }
    }
    this.flights = this.flights.filter((f) => f.t < 1);
  }

  _removeMeshes() {
    for (const mesh of this.meshes.values()) mesh.removeFromParent();
    this.meshes.clear();
  }

  dispose() {
    this._removeMeshes();
    for (const f of this.flights) f.mesh.removeFromParent();
    this.flights = [];
  }
}
