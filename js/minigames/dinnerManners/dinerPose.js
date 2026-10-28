import * as THREE from 'three';
import { createRng } from '../../core/random.js';
import { EAT, STAB, TABLE_Y } from './dinnerRules.js';
import { Fork, Plate } from './plateView.js';

// 식탁에 앉은 플레이어 한 명: 앉은 자세, 찍기·먹기 동작, 총 맞고 접시에 얼굴 박기, 다 먹고 포크 내려놓기.
// 캐릭터(PlayerView)가 매 프레임 서 있는 자세로 돌아가므로, 그 뒤에 이 클래스가 자세를 덮어쓴다.
// 포크를 쥔 팔은 PlayerView의 armR (몸 기준 +x 쪽 팔). 팔 각도는 음수일수록 앞으로 든다.

const HIP = 0.55; // 의자에 앉은 엉덩이 높이
const LEAN = 0.2; // 식탁 쪽으로 숙인 정도
const LEGS = -1.35; // 무릎이 없는 인형이라 다리를 식탁 밑으로 뻗는다
const ARM = { rest: -1.6, up: -1.95, down: -1.42, mouth: -2.1, dead: -1.5, done: -0.55 };
const GRIP = { rest: 1.05, mouth: 3.84 }; // 손에 쥔 포크 기울기 (rest면 내려찍는 순간 포크가 수직)
const LEFT = { rest: -1.15, done: -0.55, dead: -1.45 };
const ARM_IN = -0.25; // 포크 쥔 팔을 몸 가운데 쪽으로 (어깨가 옆에 있어서 그대로 내리면 접시 밖을 찍음)
const MOUTH_IN = -0.85; // 먹을 때는 입 쪽으로 더
const PLATE_SHIFT = 0.14; // 접시를 포크 쥔 팔 쪽으로 옮겨 놓는 거리
const SLUMP = 1.1; // 엎어졌을 때 숙인 각도 (얼굴이 접시에 닿음)
const HAND_Y = -0.55; // 팔 축 기준 손 위치
const TAG_Y = 1.75; // 앉은 키에 맞춘 이름표 높이
const TAG_SCALE = 0.6; // 가까운 시점이라 이름표를 줄인다
const SPRAY = 18; // 총 맞을 때 튀는 피 방울 수
const GRAVITY = 9;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => x * x * (3 - 2 * x);

/** 찍기: 들어 올림 → 내려찍기(이때 콩이 꽂힘) → 잠깐 멈춤 → 제자리 */
function stabArm(p) {
  if (p < 0.3) return lerp(ARM.rest, ARM.up, ease(p / 0.3));
  if (p < 0.5) return lerp(ARM.up, ARM.down, ((p - 0.3) / 0.2) ** 2);
  if (p < 0.68) return ARM.down;
  return lerp(ARM.down, ARM.rest, ease((p - 0.68) / 0.32));
}

/** 먹기: 포크를 입으로 (0 → 1) → 씹기 → 제자리 */
function eatAmount(p) {
  if (p < 0.38) return ease(p / 0.38);
  if (p < 0.62) return 1;
  return 1 - ease((p - 0.62) / 0.38);
}

/** 피 웅덩이·튄 자국 텍스처: 불규칙한 덩어리와 둘레의 방울 */
function makeBloodTexture(seed) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const rng = createRng(seed);
  const c = size / 2;
  g.fillStyle = 'rgba(92,6,8,0.92)';
  g.beginPath();
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = size * (0.2 + rng() * 0.13);
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.fill();
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = size * (0.22 + rng() * 0.25);
    g.fillStyle = `rgba(${90 + rng() * 40},${6 + rng() * 8},10,${0.7 + rng() * 0.3})`;
    g.beginPath();
    g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 1 + rng() * 4.5, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 여러 사람이 함께 쓰는 피 표현 재료 */
export function createGoreKit() {
  const disposables = [];
  const keep = (x) => {
    disposables.push(x);
    return x;
  };
  const decal = (seed) =>
    keep(
      new THREE.MeshStandardMaterial({
        map: keep(makeBloodTexture(seed)),
        transparent: true,
        depthWrite: false,
        roughness: 0.2,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
  return {
    pool: decal(5),
    splat: decal(11),
    decalGeo: keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    dropGeo: keep(new THREE.IcosahedronGeometry(0.014, 0)),
    dropMat: keep(new THREE.MeshStandardMaterial({ color: 0x7a0a0c, roughness: 0.3 })),
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

export class Diner {
  /** seat: seatLayout의 좌석, tableware: createTableware(), gore: createGoreKit() */
  constructor({ view, seat, tableware, gore, cfg, seed }) {
    this.view = view;
    this.seat = seat;
    this.cfg = cfg;
    this.gore = gore;
    this.state = 'eating'; // eating | dead | done
    this.anim = null; // { kind, t, dur, plate, fork, applied }
    this.time = createRng(seed)() * 10; // 숨쉬기 박자를 사람마다 다르게
    this.deadT = 0;
    this.lean = LEAN;
    this.arm = ARM.rest;

    this.fork = new Fork(tableware, seed);
    this.fork.group.position.y = HAND_Y;
    view.armR.add(this.fork.group);

    this.plate = new Plate(tableware, cfg.peasPerPlate, seed);
    // 몸 기준 +x(포크 쥔 팔 쪽)의 월드 방향: z 성분만 있다 (좌석이 ±x를 바라봄)
    this.plate.group.position.set(seat.plateX, TABLE_Y, seat.z - Math.sin(seat.facing) * PLATE_SHIFT);
    this.group = new THREE.Group(); // 접시·피처럼 식탁 위에 남는 것들
    this.group.add(this.plate.group);

    // 피 표현은 미리 만들어 안 보이게 둔다 (처음 쓰러질 때 재질 컴파일로 멈칫하지 않게)
    const f = this.forward;
    this.pool = new THREE.Mesh(gore.decalGeo, gore.pool);
    this.pool.position.set(seat.x + f * 0.86, TABLE_Y + 0.012, seat.z);
    this.splat = new THREE.Mesh(gore.decalGeo, gore.splat);
    this.splat.position.set(seat.x + f * 1.0, TABLE_Y + 0.002, seat.z + 0.05);
    this.splat.rotation.y = seat.z;
    this.drops = new THREE.InstancedMesh(gore.dropGeo, gore.dropMat, SPRAY);
    this.drops.count = 0;
    this.drops.frustumCulled = false;
    this.dropState = [];
    this.pool.scale.setScalar(1e-4);
    this.splat.scale.setScalar(1e-4);
    this.group.add(this.pool, this.splat, this.drops);

    view.tag.position.y = TAG_Y;
    view.tag.scale.multiplyScalar(TAG_SCALE);
    view.root.position.set(seat.x, 0, seat.z);
  }

  /** 앉은 사람 기준 앞쪽(식탁 가운데 쪽) 방향 */
  get forward() {
    return -this.seat.side;
  }

  /** 머리 위치 (집주인이 겨누는 곳) */
  headPosition(out = new THREE.Vector3()) {
    return out.set(this.seat.x + this.forward * 0.2, HIP + 0.98, this.seat.z);
  }

  /** 동작 시작. plate·fork: 동작 뒤 콩 개수 (찍기는 내려찍는 순간, 먹기는 입에 넣는 순간 반영) */
  play(kind, plate, fork) {
    if (this.state !== 'eating') return;
    if (this.anim && !this.anim.applied) this._applyCounts(this.anim);
    const dur = kind === STAB ? this.cfg.stabTime : this.cfg.eatTime;
    this.anim = { kind, t: 0, dur, plate, fork, applied: false };
  }

  _applyCounts(a) {
    a.applied = true;
    this.plate.setCount(a.plate);
    this.fork.setCount(a.fork);
  }

  /** 총에 맞음 */
  die() {
    if (this.state === 'dead') return;
    if (this.anim && !this.anim.applied) this._applyCounts(this.anim);
    this.state = 'dead';
    this.deadT = 0;
    this.anim = null;
    this.view.tag.visible = false;
    this._spray();
  }

  /** 다 먹음: 포크를 접시에 내려놓고 손을 무릎에 */
  finish() {
    if (this.state !== 'eating') return;
    if (this.anim && !this.anim.applied) this._applyCounts(this.anim);
    this.state = 'done';
    this.anim = null;
    this.plate.setCount(0);
    this.fork.setCount(0);
    this.plate.group.add(this.fork.group);
    this.fork.group.position.set(0.04, 0.016, -0.05);
    this.fork.group.rotation.set(-Math.PI / 2, 0, 0.5);
  }

  _spray() {
    const rng = createRng((this.seat.z * 1000) | 0);
    const head = this.headPosition();
    this.drops.count = SPRAY;
    for (let i = 0; i < SPRAY; i++) {
      // 집주인(-z) 반대쪽과 위로 튄다
      const a = rng() * Math.PI * 2;
      const s = 0.6 + rng() * 1.6;
      this.dropState.push({
        p: head.clone(),
        v: new THREE.Vector3(Math.cos(a) * s * 0.6, 0.6 + rng() * 1.6, 0.8 + rng() * 1.4),
        stuck: false,
      });
    }
  }

  _updateDrops(dt) {
    if (!this.dropState.length || this.dropState.every((d) => d.done)) return;
    const m = new THREE.Matrix4();
    this.dropState.forEach((d, i) => {
      if (d.stuck) d.done = true; // 자리 잡은 방울은 한 번 더 그린 뒤 멈춘다
      if (!d.stuck) {
        d.v.y -= GRAVITY * dt;
        d.p.addScaledVector(d.v, dt);
        const floor = Math.abs(d.p.x) < 0.8 ? TABLE_Y + 0.004 : 0.004; // 식탁 위 또는 바닥
        if (d.p.y <= floor) {
          d.p.y = floor;
          d.stuck = true;
        }
      }
      m.makeScale(1, d.stuck ? 0.25 : 1, 1).setPosition(d.p);
      this.drops.setMatrixAt(i, m);
    });
    this.drops.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    const v = this.view;
    this.time += dt;
    this._updateDrops(dt);
    if (!v.root.parent) return; // 나간 사람 (캐릭터가 치워짐)

    // 자리에 고정 (위치 신호가 늦게 와도 움직이지 않게)
    const { x, z, facing } = this.seat;
    v.root.position.set(x, 0, z);
    v.body.rotation.set(0, facing, 0);
    v.body.position.y = 0;
    if (!v.isLocal) v.setTarget(x, z, facing, false);

    let lean = LEAN + Math.sin(this.time * 1.7) * 0.015;
    let arm = ARM.rest;
    let armIn = ARM_IN;
    let grip = GRIP.rest;
    let left = LEFT.rest;

    if (this.state === 'dead') {
      this.deadT += dt;
      const s = this.deadT;
      if (s < 0.08) {
        lean = lerp(this.lean, -0.15, s / 0.08); // 맞는 순간 뒤로 젖혀짐
        arm = this.arm;
      } else if (s < 0.38) {
        const u = ((s - 0.08) / 0.3) ** 2; // 점점 빨라지며 앞으로 엎어짐
        lean = lerp(-0.15, SLUMP, u);
        arm = lerp(this.arm, ARM.dead, u);
        left = lerp(LEFT.rest, LEFT.dead, u);
      } else {
        // 얼굴이 닿은 접시 안의 피 웅덩이와 식탁에 번진 자국
        lean = SLUMP - 0.07 * Math.sin(Math.PI * clamp01((s - 0.38) / 0.16)); // 접시에 부딪혀 살짝 튐
        arm = ARM.dead;
        left = LEFT.dead;
        const grow = 1 - (1 - clamp01((s - 0.38) / 2.2)) ** 2;
        this.pool.scale.setScalar(0.44 * grow + 0.01);
        this.splat.scale.setScalar(0.62 * clamp01((s - 0.38) / 0.25) + 0.01);
      }
      this._pose(lean, arm, ARM_IN, GRIP.rest, left);
      return;
    }

    if (this.state === 'done') {
      this._pose(0.05 + Math.sin(this.time * 1.7) * 0.015, ARM.done, 0, GRIP.rest, LEFT.done);
      return;
    }

    const a = this.anim;
    if (a) {
      a.t += dt;
      const p = clamp01(a.t / a.dur);
      if (a.kind === STAB) {
        arm = stabArm(p);
        lean += 0.08 * Math.sin(Math.PI * clamp01((p - 0.3) / 0.4));
        if (!a.applied && p >= 0.5) this._applyCounts(a);
      } else if (a.kind === EAT) {
        const u = eatAmount(p);
        arm = lerp(ARM.rest, ARM.mouth, u);
        armIn = lerp(ARM_IN, MOUTH_IN, u);
        grip = lerp(GRIP.rest, GRIP.mouth, u);
        lean += 0.35 * u + (u === 1 ? 0.03 * Math.sin(a.t * 40) : 0); // 고개를 숙여 포크를 입에 넣고 씹기
        if (!a.applied && p >= 0.45) this._applyCounts(a);
      }
      if (p >= 1) {
        if (!a.applied) this._applyCounts(a);
        this.anim = null;
      }
    }
    this.lean = lean;
    this.arm = arm;
    this._pose(lean, arm, armIn, grip, left);
  }

  _pose(lean, arm, armIn, grip, left) {
    const v = this.view;
    v.pelvis.position.y = HIP;
    v.pelvis.rotation.x = lean;
    v.legL.rotation.x = v.legR.rotation.x = LEGS;
    v.armR.rotation.set(arm, 0, armIn);
    v.armL.rotation.set(left, 0, 0);
    if (this.fork.group.parent === v.armR) this.fork.group.rotation.x = grip;
  }

  dispose() {
    this.fork.dispose();
    this.plate.dispose();
    this.drops.dispose();
    this.group.removeFromParent();
  }
}

