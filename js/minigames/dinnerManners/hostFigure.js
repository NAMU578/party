import * as THREE from 'three';
import { createRng } from '../../core/random.js';
import { makeGlowTexture } from '../../render/proceduralTextures.js';

// 집주인: 식탁 머리에 서서 신문을 읽는 덩치 큰 대머리 남자.
// - 신문 높이는 시간표(watchPlan)가 정하고, 쏘는 동안에는 내린 채로 둔다.
// - 걸린 사람이 생기면 오른손으로 총을 들어 겨누고 쏜다 (여러 명이면 차례로).
// 로컬 좌표: 원점 = 발밑, +z = 식탁 쪽(앞).

const SHOULDER = { x: 0.46, y: 1.86, z: 0.02 };
const UPPER = 0.42; // 위팔 길이
const FORE = 0.44; // 아래팔 길이
const PAPER_READ = new THREE.Vector3(0, 2.2, 0.46); // 얼굴을 가린 신문 가운데
const PAPER_DOWN = new THREE.Vector3(0, 1.42, 0.52);
const PAGE_W = 0.48;
const PAGE_H = 0.72;
const HEAD_Y = 2.24;
const FLASH_TIME = 0.07;
const GUN_REACH = 0.8; // 겨눌 때 어깨 ~ 손
const SCALE = 1.3; // 손님들보다 훨씬 큰 덩치
// 평소에는 오른쪽 허리춤에 총을 차고 있다 (늘 보이게 둬서 첫 발사 때 재질 컴파일로 멈칫하지 않게)
const HOLSTER = new THREE.Vector3(0.47, 1.02, 0.16);
const HOLSTER_ROT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); // 총구가 아래

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (x) => x * x * (3 - 2 * x);
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** 신문 1면: 제호, 기사 단, 사진 칸 */
function makeNewspaperTexture() {
  const W = 256;
  const H = 384;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const rng = createRng(61);
  g.fillStyle = '#d8d2bf';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#26231e';
  g.font = 'bold 30px Georgia, serif';
  g.textAlign = 'center';
  g.fillText('EVENING POST', W / 2, 40);
  g.fillRect(12, 50, W - 24, 3);
  g.fillRect(12, 58, W - 24, 1);
  g.font = 'bold 19px Georgia, serif';
  g.fillText('TABLE MANNERS', W / 2, 84);
  // 사진 칸
  g.fillStyle = '#4a463e';
  g.fillRect(16, 98, 132, 92);
  g.fillStyle = '#7d776a';
  for (let i = 0; i < 6; i++) g.fillRect(24 + rng() * 100, 110 + rng() * 60, 6 + rng() * 26, 4 + rng() * 22);
  // 기사 단 (회색 줄)
  const line = (x, y, w) => {
    g.fillStyle = `rgba(40,37,32,${0.45 + rng() * 0.25})`;
    g.fillRect(x, y, w * (0.75 + rng() * 0.25), 3);
  };
  for (let y = 100; y < 190; y += 7) line(158, y, 82);
  for (const x of [16, 96, 176]) {
    g.fillStyle = '#2b2823';
    g.fillRect(x, 202, 62, 5);
    for (let y = 214; y < H - 14; y += 7) line(x, y, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 두 점 사이를 잇는 원기둥 (형상 높이 1, 가운데 원점) */
function placeLimb(mesh, a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, d.divideScalar(len || 1));
  mesh.scale.set(1, len, 1);
}

/** 두 마디 팔: 어깨 s → 손 h, 팔꿈치는 pole 쪽으로 굽는다 */
function solveElbow(s, h, pole, out) {
  const d = new THREE.Vector3().subVectors(h, s);
  const len = Math.min(d.length(), (UPPER + FORE) * 0.999);
  d.normalize();
  const cosA = (UPPER * UPPER + len * len - FORE * FORE) / (2 * UPPER * len);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const bend = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
  return out.copy(s).addScaledVector(d, UPPER * cosA).addScaledVector(bend, UPPER * sinA);
}

export class HostFigure {
  constructor(cfg) {
    this.cfg = cfg;
    this.group = new THREE.Group();
    this.group.scale.setScalar(SCALE);
    this.time = 0;
    this.hold = 0; // 쏘는 동안 신문을 내리는 정도
    this.gun = 0; // 총을 든 정도
    this.recoil = 0;
    this.flashT = FLASH_TIME;
    this.shots = []; // { target, fireAt, onFire, fired }
    this.yaw = 0;
    this.pitch = 0.1;
    this.aimDir = new THREE.Vector3(0, -0.3, 1).normalize();
    this._disposables = [];
    this._build();
  }

  _keep(x) {
    this._disposables.push(x);
    return x;
  }

  _build() {
    const keep = (x) => this._keep(x);
    const std = (color, rough = 0.8, metal = 0) => keep(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
    const suit = std(0x262c29);
    const skin = std(0xc8b39c, 0.55);
    const dark = std(0x0d0d0e, 0.4);
    const add = (parent, geo, mat, [x, y, z], scale) => {
      const m = new THREE.Mesh(keep(geo), mat);
      m.position.set(x, y, z);
      if (scale) m.scale.set(...scale);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const g = this.group;

    // 다리·몸통
    for (const x of [-0.2, 0.2]) {
      add(g, new THREE.BoxGeometry(0.28, 1.0, 0.32), std(0x1b1e1d), [x, 0.5, 0]);
      add(g, new THREE.BoxGeometry(0.3, 0.1, 0.42), dark, [x, 0.05, 0.05]);
    }
    this.torso = add(g, new THREE.BoxGeometry(0.9, 0.96, 0.48), suit, [0, 1.47, 0]);
    add(g, new THREE.BoxGeometry(0.22, 0.44, 0.02), std(0xcfcabd), [0, 1.72, 0.245]); // 셔츠
    add(g, new THREE.BoxGeometry(0.07, 0.4, 0.02), std(0x3b1515), [0, 1.66, 0.258]); // 넥타이
    for (const x of [-1, 1]) add(g, new THREE.SphereGeometry(0.17, 12, 8), suit, [x * SHOULDER.x, SHOULDER.y, 0], [1.1, 0.8, 1.1]); // 어깨
    add(g, new THREE.CylinderGeometry(0.14, 0.16, 0.24, 12), skin, [0, 2.01, 0.02]); // 목

    // 머리 (대머리, 찌푸린 눈썹)
    this.head = new THREE.Group();
    this.head.position.set(0, HEAD_Y, 0.03);
    g.add(this.head);
    const h = this.head;
    add(h, new THREE.SphereGeometry(0.27, 24, 16), skin, [0, 0, 0], [0.95, 1.08, 1]);
    add(h, new THREE.SphereGeometry(0.2, 16, 10), skin, [0, -0.13, 0.07], [1.05, 0.65, 0.9]); // 턱
    for (const x of [-1, 1]) {
      add(h, new THREE.SphereGeometry(0.07, 10, 8), skin, [x * 0.26, -0.01, -0.02], [0.45, 1, 0.8]); // 귀
      add(h, new THREE.SphereGeometry(0.03, 8, 6), dark, [x * 0.088, 0.015, 0.243]); // 눈
      const brow = add(h, new THREE.BoxGeometry(0.15, 0.045, 0.07), std(0xa8937c, 0.6), [x * 0.09, 0.07, 0.235]);
      brow.rotation.z = x * -0.22; // 찌푸림
    }
    add(h, new THREE.BoxGeometry(0.06, 0.11, 0.07), skin, [0, -0.04, 0.27]); // 코
    add(h, new THREE.BoxGeometry(0.13, 0.016, 0.02), std(0x4a2f2a), [0, -0.15, 0.245]); // 입

    // 팔 (두 마디, 매 프레임 손 위치에 맞춰 놓는다)
    const limbGeo = keep(new THREE.CylinderGeometry(0.095, 0.085, 1, 10));
    const handGeo = keep(new THREE.SphereGeometry(0.085, 10, 8));
    this.arms = [-1, 1].map((side) => {
      const upper = new THREE.Mesh(limbGeo, suit);
      const fore = new THREE.Mesh(limbGeo, suit);
      const hand = new THREE.Mesh(handGeo, skin);
      hand.scale.set(1, 0.9, 1.2);
      for (const m of [upper, fore, hand]) m.castShadow = true;
      g.add(upper, fore, hand);
      return { side, upper, fore, hand, shoulder: new THREE.Vector3(side * SHOULDER.x, SHOULDER.y, SHOULDER.z), elbow: new THREE.Vector3() };
    });

    // 신문: 가운데가 접힌 두 면 (바깥쪽이 집주인 쪽으로 살짝 휨)
    const paperMat = keep(new THREE.MeshStandardMaterial({ map: keep(makeNewspaperTexture()), roughness: 0.95, side: THREE.DoubleSide }));
    const pageGeo = keep(new THREE.PlaneGeometry(PAGE_W, PAGE_H));
    this.paper = new THREE.Group();
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.rotation.y = side * 0.2;
      const page = new THREE.Mesh(pageGeo, paperMat);
      page.position.x = (side * PAGE_W) / 2;
      page.castShadow = true;
      hinge.add(page);
      this.paper.add(hinge);
    }
    this.paper.position.copy(PAPER_READ);
    g.add(this.paper);

    // 권총 (+z가 총구 쪽, 어두운 양복 앞에서도 보이게 은색으로 크게), 총구 섬광과 불빛
    const gunMat = std(0xa9adb2, 0.25, 0.9);
    const gripMat = std(0x2a2522, 0.6);
    this.gunGroup = new THREE.Group();
    add(this.gunGroup, new THREE.BoxGeometry(0.075, 0.09, 0.34), gunMat, [0, 0.03, 0.09]);
    add(this.gunGroup, new THREE.CylinderGeometry(0.022, 0.022, 0.06, 10), gunMat, [0, 0.035, 0.28]).rotation.x = Math.PI / 2;
    const grip = add(this.gunGroup, new THREE.BoxGeometry(0.065, 0.17, 0.085), gripMat, [0, -0.08, -0.03]);
    grip.rotation.x = -0.25;
    this.flash = new THREE.Sprite(
      keep(new THREE.SpriteMaterial({ map: keep(makeGlowTexture()), color: 0xffc070, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false })),
    );
    this.flash.position.set(0, 0.035, 0.36);
    this.flash.visible = false;
    this.gunGroup.add(this.flash);
    // 불빛은 총과 따로 늘 켜 둔다 (조명 수가 바뀌면 첫 발사 순간 모든 재질을 다시 컴파일하느라 멈칫함)
    this.flashLight = new THREE.PointLight(0xffb050, 0, 0, 2);
    g.add(this.gunGroup, this.flashLight);
  }

  /** target(월드 좌표)을 쏜다. 쏘는 순간 onFire()를 부른다. 여러 명이면 shotGap 간격으로 차례대로 */
  queueShot(target, onFire) {
    const last = this.shots.length ? this.shots[this.shots.length - 1].fireAt : -Infinity;
    const fireAt = Math.max(this.time + this.cfg.aimTime, last + this.cfg.shotGap);
    this.shots.push({ target: target.clone(), fireAt, onFire, fired: false });
  }

  /** planDown: 시간표의 신문 내려간 정도 (0~1) */
  update(dt, planDown) {
    const cfg = this.cfg;
    this.time += dt;
    const T = this.time;
    const pending = this.shots.filter((s) => !s.fired);
    for (const s of pending) {
      if (T < s.fireAt) continue;
      s.fired = true;
      this.flashT = 0;
      this.recoil = 1;
      s.onFire?.();
    }
    const waiting = this.shots.some((s) => !s.fired);
    const lastFire = this.shots.length ? this.shots[this.shots.length - 1].fireAt : -Infinity;
    const shooting = waiting || T < lastFire + cfg.paperHold;
    if (!shooting && this.shots.length > 1) this.shots = this.shots.slice(-1);

    // 신문: 쏘는 동안은 내린 채. 보이는 신문은 시간표보다 늦게 올라가는 쪽으로만 달라진다 (위험할 때 내려가 있음)
    this.hold = approach(this.hold, shooting ? 1 : 0, dt / (shooting ? cfg.lowerTime : cfg.raiseTime));
    const down = Math.max(planDown, ease(this.hold));
    const gunUp = waiting || T < lastFire + 0.6;
    this.gun = approach(this.gun, gunUp ? 1 : 0, dt / (gunUp ? 0.15 : 0.35));
    const g = ease(this.gun);
    this.recoil = Math.max(0, this.recoil - dt / 0.14);
    this.flashT += dt;

    const p = this.paper;
    p.position.lerpVectors(PAPER_READ, PAPER_DOWN, down);
    p.position.x -= 0.12 * g;
    p.rotation.set(0.35 * down, 0, 0.28 * g);
    p.updateMatrix();

    // 겨눌 곳 (집주인 로컬 좌표)
    const target = (waiting ? this.shots.find((s) => !s.fired) : this.shots[this.shots.length - 1])?.target;
    const R = this.arms[1];
    if (target) {
      this.group.updateWorldMatrix(true, false);
      const local = this.group.worldToLocal(target.clone());
      const want = local.sub(R.shoulder).normalize();
      this.aimDir.lerp(want, 1 - Math.exp(-18 * dt)).normalize();
    }

    // 손 위치: 왼손은 신문 왼쪽 끝, 오른손은 신문 오른쪽 끝 ↔ 겨누는 자세
    const holdL = new THREE.Vector3(-0.45, -0.06, -0.1).applyMatrix4(p.matrix);
    const holdR = new THREE.Vector3(0.45, -0.06, -0.1).applyMatrix4(p.matrix);
    const aimHand = R.shoulder.clone().addScaledVector(this.aimDir, GUN_REACH - 0.05 * this.recoil);
    const handR = holdR.lerp(aimHand, g);
    this._placeArm(this.arms[0], holdL, new THREE.Vector3(-0.7, -1, -0.5));
    this._placeArm(R, handR, new THREE.Vector3(0.7, -1, -0.5));

    // 총: 오른손에 쥐고 겨눈 방향으로, 쏘면 총구가 튀어 오른다
    this.gunGroup.position.lerpVectors(HOLSTER, handR, g);
    this.gunGroup.quaternion.setFromUnitVectors(Z_AXIS, this.aimDir).slerp(HOLSTER_ROT, 1 - g);
    this.gunGroup.rotateX(-0.5 * this.recoil);
    const f = Math.max(0, 1 - this.flashT / FLASH_TIME);
    this.flash.visible = f > 0;
    this.flash.scale.setScalar(0.3 + 0.9 * f);
    this.flashLight.position.copy(handR).addScaledVector(this.aimDir, 0.42);
    this.flashLight.intensity = 30 * f;

    // 고개: 쏠 때는 표적을, 내려다볼 때는 식탁을 천천히 훑는다
    let yaw = 0;
    let pitch = 0.08;
    if (g > 0.05 && target) {
      yaw = Math.atan2(this.aimDir.x, this.aimDir.z);
      pitch = 0.3;
    } else if (down > 0.5) {
      yaw = 0.32 * Math.sin(T * 0.9);
      pitch = 0.22;
    }
    this.yaw = lerp(this.yaw, yaw, 1 - Math.exp(-8 * dt));
    this.pitch = lerp(this.pitch, pitch, 1 - Math.exp(-8 * dt));
    this.head.rotation.set(this.pitch, this.yaw, 0);
    this.torso.scale.y = 1 + 0.012 * Math.sin(T * 1.6);
  }

  _placeArm(arm, hand, pole) {
    solveElbow(arm.shoulder, hand, pole, arm.elbow);
    placeLimb(arm.upper, arm.shoulder, arm.elbow);
    placeLimb(arm.fore, arm.elbow, hand);
    arm.hand.position.copy(hand);
  }

  dispose() {
    this.group.removeFromParent();
    for (const d of this._disposables) d.dispose();
  }
}
