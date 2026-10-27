import { CONFIG } from '../config.js';
import { MSG, makeMsg } from '../net/protocol.js';

const round2 = (v) => Math.round(v * 100) / 100;

function dampAngle(current, target, speed, dt) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * (1 - Math.exp(-speed * dt));
}

/**
 * 내 캐릭터 조작. 이동은 내 화면에서 바로 반영하고(반응 속도), 위치를 방장에게 주기적으로 보낸다.
 * 탈락 여부는 미니게임이 판단해서 fall()을 호출한다.
 */
export class PlayerController {
  constructor({ view, input, network }) {
    this.view = view;
    this.input = input;
    this.network = network;
    this.x = 0;
    this.z = 0;
    this.ry = 0;
    this.moving = false;
    this.alive = true;
    this.controllable = false;
    this.bounds = null; // { minX, maxX, minZ, maxZ }
    this._sendTimer = 0;
  }

  spawn(x, z) {
    this.x = x;
    this.z = z;
    this.ry = 0;
    this.alive = true;
    this.view.snapTo(x, z, 0);
  }

  setBounds(bounds) {
    this.bounds = bounds;
  }

  setControllable(on) {
    this.controllable = on && this.alive;
  }

  /** 떨어져 탈락. elapsed: 이미 떨어지기 시작한 지 지난 시간(초) */
  fall(elapsed = 0) {
    if (!this.alive) return;
    this.alive = false;
    this.controllable = false;
    this.view.fall(elapsed);
  }

  update(dt) {
    let moving = false;
    if (this.controllable && this.alive) {
      const a = this.input.axis();
      if (a.x || a.z) {
        const len = Math.hypot(a.x, a.z);
        const speed = CONFIG.player.moveSpeed;
        const vx = (a.x / len) * speed;
        const vz = (a.z / len) * speed;
        this.x += vx * dt;
        this.z += vz * dt;
        if (this.bounds) {
          this.x = Math.min(this.bounds.maxX, Math.max(this.bounds.minX, this.x));
          this.z = Math.min(this.bounds.maxZ, Math.max(this.bounds.minZ, this.z));
        }
        this.ry = dampAngle(this.ry, Math.atan2(vx, vz), CONFIG.player.turnSpeed, dt);
        moving = true;
      }
    }
    this.moving = moving;
    if (this.alive) this.view.setPose(this.x, this.z, this.ry, moving);

    this._sendTimer += dt;
    if (this._sendTimer >= 1 / CONFIG.net.sendRate) {
      this._sendTimer = 0;
      this.network.sendToHost(
        makeMsg(MSG.POS, { x: round2(this.x), z: round2(this.z), ry: round2(this.ry), mv: moving ? 1 : 0 }),
      );
    }
  }
}
