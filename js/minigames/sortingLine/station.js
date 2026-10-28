import * as THREE from 'three';
import { createRng } from '../../core/random.js';
import { makeGlowTexture, makeHazardTexture, makeRustMetalTexture, withRepeat } from '../../render/proceduralTextures.js';
import { BURN, PASS } from './sortingRules.js';
import { ScoreDisplay } from './scoreDisplay.js';

// 작업대 하나: 컨베이어 벨트(받침 상자, 흐르는 벨트, 양쪽 구멍), 판정 칸과 그 밑의 피스톤,
// 레버 두 개(빨강=버리기, 초록=넘기기)와 램프가 달린 조작대, 양면 점수판, 머리 위 압착기.
// 로컬 좌표: +x = 벨트가 흐르는 방향(작업자 기준 오른쪽), +z = 바깥쪽(작업자 쪽), 원점 = 벨트 가운데 바닥.

export const BELT_Y = 0.9;       // 벨트 윗면 높이 (물건이 놓이는 높이)
export const PRESS_UP = 5.4;     // 압착기가 올라가 있을 때 밑면 높이 (내 시점에서는 화면 위로 벗어남)
const PRESS_H = 1.0;
const ROD_LEN = 1.6;             // 압착기 위 로드: 천장까지 이으면 내려왔을 때 카메라 앞을 막아서 짧게 둔다
const HATCH_H = 1.7;
const DESK_Z = 0.8;              // 조작대 위치 (벨트 가장자리와 작업자 사이)
const KICK_TIME = 0.22;          // 피스톤이 튀어 올랐다 내려가는 시간
const KICK_REST = BELT_Y - 0.07; // 피스톤 머리가 벨트 안에 숨어 있는 높이
const LEVER_TIME = 0.2;
const LEVER_REST = 0.35;         // 레버가 작업자 쪽으로 기울어 있는 각도
const LEVER_SWING = 0.75;
const AMBER = 0xffae1a;
const GREEN = 0x36ff62;
const RED = 0xff3020;

/** 벨트 고무 무늬: 흐르는 방향에 수직인 홈이 가로로 반복된다 */
function makeBeltTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const rng = createRng(19);
  g.fillStyle = '#1c1c1b';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#383834';
  g.fillRect(0, 0, 14, size);
  g.fillStyle = 'rgba(200,200,190,0.2)';
  g.fillRect(14, 0, 2, size);
  for (let i = 0; i < 140; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.35)' : 'rgba(130,130,120,0.15)';
    g.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** 모든 작업대가 함께 쓰는 형상·재질·텍스처 (작업대 수만큼 만들지 않게) */
export function createStationKit() {
  const disposables = [];
  const keep = (x) => {
    disposables.push(x);
    return x;
  };
  const geometries = new Map();
  const geo = (key, make) => {
    if (!geometries.has(key)) geometries.set(key, keep(make()));
    return geometries.get(key);
  };
  const rust = keep(makeRustMetalTexture({ seed: 71, base: [86, 80, 70] }));
  const steel = keep(makeRustMetalTexture({ seed: 57, base: [104, 98, 88] }));
  const hazard = keep(makeHazardTexture({ seed: 21 }));
  const glowTex = keep(makeGlowTexture());
  const std = (o) => keep(new THREE.MeshStandardMaterial(o));
  const basic = (color) => keep(new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const glow = (color) =>
    keep(
      new THREE.SpriteMaterial({
        map: glowTex,
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
  return {
    belt: keep(makeBeltTexture()),
    box: (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
    cyl: (r, h, seg = 12) => geo(`c${r},${h},${seg}`, () => new THREE.CylinderGeometry(r, r, h, seg)),
    sphere: (r) => geo(`s${r}`, () => new THREE.SphereGeometry(r, 12, 8)),
    plane: (w, h) => geo(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h)),
    mats: {
      cabinet: std({ map: rust, roughness: 0.75, metalness: 0.45 }),
      frame: std({ color: 0x3a3631, roughness: 0.6, metalness: 0.6 }),
      belt: std({ roughness: 0.95 }), // 흐르는 위치가 작업대마다 달라서 텍스처는 작업대마다 따로 붙인다
      roller: std({ color: 0x8c8a84, roughness: 0.3, metalness: 0.9 }),
      hole: basic(0x030303),
      hazard: std({ map: keep(withRepeat(hazard, 4, 0.5)), roughness: 0.7 }),
      slot: std({ color: 0xc9a227, roughness: 0.6 }),
      console: std({ color: 0x4a4f4a, roughness: 0.55, metalness: 0.5 }),
      rod: std({ color: 0xb8b8b0, roughness: 0.25, metalness: 0.95 }),
      knob: { [BURN]: std({ color: 0xc8402a, roughness: 0.4 }), [PASS]: std({ color: 0x3a9a4a, roughness: 0.4 }) },
      piston: std({ color: 0x9a968c, roughness: 0.3, metalness: 0.9 }),
      press: std({ map: steel, roughness: 0.55, metalness: 0.65 }),
      pressBand: std({ map: keep(withRepeat(hazard, 3, 0.5)), roughness: 0.7 }),
      flap: std({ color: 0x1b1b1b, roughness: 0.9, side: THREE.DoubleSide }),
      displayBody: std({ color: 0x2c2b28, roughness: 0.5, metalness: 0.6 }),
      lampOff: std({ color: 0x1a1a18, roughness: 0.3 }),
      lamp: { amber: basic(AMBER), green: basic(GREEN), red: basic(RED) },
      glow: { amber: glow(AMBER), green: glow(GREEN), red: glow(RED) },
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

export class Station {
  /** st: stationLayout의 작업대 하나 */
  constructor(kit, st, cfg) {
    const { mats } = kit;
    this.group = new THREE.Group();
    this.group.position.set(st.x, 0, st.z);
    this.group.rotation.y = st.angle; // 로컬 +z가 바깥쪽(st.out), +x가 오른쪽(st.right)이 된다
    const add = (geo, mat, [x, y, z], parent = this.group, cast = false) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = cast;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const bi = cfg.beltIn;
    const bo = cfg.beltOut;
    const hw = cfg.hatchWidth;
    const len = bi + bo;
    const cx = (bo - bi) / 2;

    // 벨트와 받침 상자. 벨트 무늬는 흐른 거리만큼 밀린다 (setBelt)
    add(kit.box(len, BELT_Y - 0.06, 0.86), mats.cabinet, [cx, (BELT_Y - 0.06) / 2, 0], this.group, true);
    this.beltTex = kit.belt.clone();
    this.beltTex.repeat.set(len / (cfg.slotSpacing / 2), 1); // 한 칸에 홈 두 줄
    this.beltTex.needsUpdate = true;
    this.beltMat = mats.belt.clone();
    this.beltMat.map = this.beltTex;
    add(kit.box(len, 0.06, 0.74), this.beltMat, [cx, BELT_Y - 0.03, 0]);
    for (const z of [-0.41, 0.41]) add(kit.box(len, 0.1, 0.06), mats.frame, [cx, BELT_Y + 0.02, z]);
    for (const x of [-bi, bo]) add(kit.cyl(0.07, 0.8, 10), mats.roller, [x, BELT_Y - 0.05, 0]).rotation.x = Math.PI / 2;

    // 판정 칸: 이 노란 틀 안의 물건을 처리한다. 밑에 숨은 피스톤이 튀어 올라 물건을 소각로로 던진다
    const s = 0.33;
    for (const [w, d, x, z] of [[0.7, 0.035, 0, -s], [0.7, 0.035, 0, s], [0.035, 0.7, -s, 0], [0.035, 0.7, s, 0]]) {
      add(kit.box(w, 0.008, d), mats.slot, [x, BELT_Y + 0.004, z]);
    }
    this.kicker = add(kit.box(0.5, 0.1, 0.5), mats.piston, [0, KICK_REST, 0]);
    this.kickT = null;

    // 양쪽 끝 구멍 상자: 왼쪽에서 물건이 나오고, 오른쪽(재활용)으로 들어간다
    for (const side of [-1, 1]) {
      const x = side < 0 ? -bi - hw / 2 : bo + hw / 2;
      const face = x - side * (hw / 2); // 벨트 쪽 면
      add(kit.box(hw, HATCH_H, 1.0), mats.cabinet, [x, HATCH_H / 2, 0], this.group, true);
      add(kit.plane(0.82, 0.62), mats.hole, [face - side * 0.003, BELT_Y + 0.31, 0]).rotation.y = (-side * Math.PI) / 2;
      add(kit.box(0.02, 0.12, 0.9), mats.hazard, [face - side * 0.012, BELT_Y + 0.72, 0]);
    }
    for (let k = 0; k < 4; k++) add(kit.box(0.015, 0.56, 0.19), mats.flap, [bo - 0.02, BELT_Y + 0.33, -0.29 + k * 0.195]);

    // 조작대: 레버 두 개와 램프
    const desk = new THREE.Group();
    desk.position.z = DESK_Z;
    this.group.add(desk);
    add(kit.box(1.3, 0.95, 0.34), mats.console, [0, 0.475, 0], desk, true);
    add(kit.box(1.34, 0.06, 0.4), mats.frame, [0, 0.97, 0], desk).rotation.x = 0.25;
    this.levers = {};
    for (const [a, x] of [[BURN, -0.32], [PASS, 0.32]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.0, 0.02);
      pivot.rotation.x = LEVER_REST;
      desk.add(pivot);
      add(kit.cyl(0.022, 0.42, 8), mats.rod, [0, 0.21, 0], pivot);
      add(kit.sphere(0.06), mats.knob[a], [0, 0.43, 0], pivot);
      this.levers[a] = { pivot, t: 1 };
    }
    this.lampMats = mats;
    this.lamp = add(kit.sphere(0.075), mats.lampOff, [0, 1.07, -0.02], desk);
    this.glow = new THREE.Sprite(mats.glow.green);
    this.glow.scale.setScalar(0.7);
    this.glow.position.set(0, 1.07, -0.02);
    this.glow.visible = false;
    desk.add(this.glow);
    this.lampState = 'off';
    this.jammed = false;

    // 작업자 발판
    add(kit.box(1.5, 0.05, 1.2), mats.frame, [0, 0.025, cfg.standOut]);

    // 점수판: 재활용 구멍 상자 위
    add(kit.box(0.14, 0.12, 0.14), mats.frame, [bo + hw / 2, HATCH_H + 0.06, 0]);
    this.display = new ScoreDisplay({ box: kit.box(1.04, 0.6, 0.3), bodyMaterial: mats.displayBody, plane: kit.plane(0.92, 0.46) });
    this.display.group.position.set(bo + hw / 2, HATCH_H + 0.42, 0);
    this.group.add(this.display.group);

    // 머리 위 압착기
    this.press = new THREE.Group();
    this.press.position.z = cfg.standOut;
    add(kit.box(1.25, PRESS_H, 1.25), mats.press, [0, PRESS_H / 2, 0], this.press, true);
    add(kit.box(1.27, 0.18, 1.27), mats.pressBand, [0, 0.09, 0], this.press);
    add(kit.cyl(0.13, ROD_LEN, 10), mats.rod, [0, PRESS_H + ROD_LEN / 2, 0], this.press);
    this.group.add(this.press);
    this.setPress(1);

    // 벨트 위 물건이 붙는 곳 (Lane이 채운다)
    this.items = new THREE.Group();
    this.items.position.y = BELT_Y;
    this.group.add(this.items);
  }

  /** pos: 벨트가 흐른 거리 (칸 단위) */
  setBelt(pos) {
    this.beltTex.offset.x = -pos * 2; // 한 칸에 홈 두 줄
  }

  kick() {
    this.kickT = 0;
  }

  pull(action) {
    if (this.levers[action]) this.levers[action].t = 0;
  }

  /** 'off' | 'ready'(노랑 깜빡) | 'run'(초록) | 'stop'(빨강) | 'doom'(빨강 깜빡) */
  setLamp(state) {
    this.lampState = state;
  }

  /** 오답으로 벨트가 걸린 동안 빨간불 */
  setJam(on) {
    this.jammed = on;
  }

  /** lift: 1(다 올라감) ~ 0(바닥) */
  setPress(lift) {
    this.press.position.y = lift * PRESS_UP;
  }

  get pressBottom() {
    return this.press.position.y;
  }

  update(dt, time) {
    if (this.kickT != null) {
      this.kickT += dt;
      const p = this.kickT / KICK_TIME;
      if (p >= 1) this.kickT = null;
      this.kicker.position.y = KICK_REST + (p >= 1 ? 0 : Math.sin(Math.PI * p) * 0.42);
    }
    for (const lever of Object.values(this.levers)) {
      if (lever.t >= 1) continue;
      lever.t = Math.min(1, lever.t + dt / LEVER_TIME);
      lever.pivot.rotation.x = LEVER_REST - Math.sin(Math.PI * lever.t) * LEVER_SWING;
    }

    const state = this.jammed && this.lampState === 'run' ? 'jam' : this.lampState;
    const blink = (hz) => Math.floor(time * hz) % 2 === 0;
    let color = null;
    if (state === 'run') color = 'green';
    else if (state === 'ready' && blink(4)) color = 'amber';
    else if (state === 'stop' || (state === 'jam' && blink(12)) || (state === 'doom' && blink(6))) color = 'red';
    this.lamp.material = color ? this.lampMats.lamp[color] : this.lampMats.lampOff;
    this.glow.visible = !!color;
    if (color) this.glow.material = this.lampMats.glow[color];
  }

  dispose() {
    this.group.removeFromParent();
    this.beltTex.dispose();
    this.beltMat.dispose();
    this.display.dispose();
  }
}
