import { CONFIG } from '../config.js';
import { MSG, makeMsg } from '../net/protocol.js';
import { findPushTarget, knockbackProgress, separate } from './pushRules.js';

const P = CONFIG.push;
const round2 = (v) => Math.round(v * 100) / 100;

function dampAngle(current, target, speed, dt) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * (1 - Math.exp(-speed * dt));
}

/**
 * 내 캐릭터 조작. 이동은 내 화면에서 바로 반영하고(반응 속도), 위치를 방장에게 주기적으로 보낸다.
 * - 스페이스바: 밀치기. 맞았는지는 내 화면 기준으로 찾아서 방장에게 보낸다.
 * - 밀려서 넘어지면: 밀려나며 넘어짐 → 누운 채 경직 → 일어나는 동작부터 이동 가능.
 * 탈락 여부는 미니게임이 판단해서 fall()을 호출한다.
 */
export class PlayerController {
  /** others(): 나를 뺀, 부딪힐 수 있는 플레이어 [{ id, x, z, knocked }] */
  constructor({ view, input, network, others }) {
    this.view = view;
    this.input = input;
    this.network = network;
    this.others = others;
    this.x = 0;
    this.z = 0;
    this.ry = 0;
    this.moving = false;
    this.alive = true;
    this.controllable = false;
    this.bounds = null; // { minX, maxX, minZ, maxZ }
    this.knock = null;  // 넘어진 동안: { t, dx, dz, done }
    this.pushLock = 0;
    this.pushCooldown = 0;
    this._sendTimer = 0;
  }

  spawn(x, z) {
    this.x = x;
    this.z = z;
    this.ry = 0;
    this.alive = true;
    this.knock = null;
    this.pushLock = 0;
    this.pushCooldown = 0;
    this.view.snapTo(x, z, 0);
  }

  setBounds(bounds) {
    this.bounds = bounds;
  }

  setControllable(on) {
    this.controllable = on && this.alive;
  }

  /** 넘어져서 아직 움직일 수 없는 동안 (일어나는 동작 전까지) */
  get stunned() {
    return !!this.knock && this.knock.t < P.knockbackTime + P.downTime;
  }

  /** 떨어져 탈락. elapsed: 이미 떨어지기 시작한 지 지난 시간(초) */
  fall(elapsed = 0) {
    if (!this.alive) return;
    this.alive = false;
    this.controllable = false;
    this.view.fall(elapsed);
  }

  /** 밀려서 넘어짐. (dx, dz): 밀려나는 방향 */
  knockback(dx, dz) {
    if (!this.alive) return;
    this.knock = { t: 0, dx, dz, done: 0 };
    this.ry = Math.atan2(-dx, -dz); // 민 사람 쪽을 본 채 뒤로 넘어짐
    this.pushLock = 0;
    this.view.knockdown(dx, dz);
  }

  _tryPush() {
    if (!this.input.consumePush()) return;
    if (!this.controllable || !this.alive || this.knock || this.pushCooldown > 0) return;
    const candidates = this.others().filter((o) => !o.knocked); // 넘어진 사람은 다시 맞지 않음
    const target = findPushTarget({ x: this.x, z: this.z, ry: this.ry }, candidates, P);
    this.pushLock = P.lockTime;
    this.pushCooldown = P.cooldown;
    this.view.playPush();
    this.network.sendToHost(
      makeMsg(MSG.PUSH, {
        to: target ? target.id : null,
        dx: round2(target ? target.dx : Math.sin(this.ry)),
        dz: round2(target ? target.dz : Math.cos(this.ry)),
      }),
    );
  }

  update(dt) {
    this.pushLock = Math.max(0, this.pushLock - dt);
    this.pushCooldown = Math.max(0, this.pushCooldown - dt);
    this._tryPush();

    let moving = false;
    if (this.alive) {
      if (this.knock) {
        const k = this.knock;
        k.t += dt;
        const done = knockbackProgress(k.t, P.knockbackTime) * P.knockbackDistance;
        this.x += k.dx * (done - k.done);
        this.z += k.dz * (done - k.done);
        k.done = done;
        if (k.t >= P.knockbackTime + P.downTime + P.getUpTime) this.knock = null;
      }

      if (this.controllable && !this.stunned && this.pushLock <= 0) {
        const a = this.input.axis();
        if (a.x || a.z) {
          const len = Math.hypot(a.x, a.z);
          const speed = CONFIG.player.moveSpeed;
          const vx = (a.x / len) * speed;
          const vz = (a.z / len) * speed;
          this.x += vx * dt;
          this.z += vz * dt;
          this.ry = dampAngle(this.ry, Math.atan2(vx, vz), CONFIG.player.turnSpeed, dt);
          moving = true;
        }
      }

      // 다른 사람과 겹치지 않게 밀어내고, 바닥 밖으로 나가지 않게 막는다
      const sep = separate(this.x, this.z, this.others(), CONFIG.player.radius * 2, this.network.myId);
      this.x = sep.x;
      this.z = sep.z;
      if (this.bounds) {
        this.x = Math.min(this.bounds.maxX, Math.max(this.bounds.minX, this.x));
        this.z = Math.min(this.bounds.maxZ, Math.max(this.bounds.minZ, this.z));
      }
      this.view.setPose(this.x, this.z, this.ry, moving);
    }
    this.moving = moving;

    this._sendTimer += dt;
    if (this._sendTimer >= 1 / CONFIG.net.sendRate) {
      this._sendTimer = 0;
      this.network.sendToHost(
        makeMsg(MSG.POS, { x: round2(this.x), z: round2(this.z), ry: round2(this.ry), mv: moving ? 1 : 0 }),
      );
    }
  }
}
