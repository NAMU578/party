import * as THREE from 'three';
import { createRng } from '../../core/random.js';
import { makeHazardTexture, makeRustMetalTexture, withRepeat } from '../../render/proceduralTextures.js';

// 열차: 맨 앞 우리 칸(창살 너머 구리 배관) + 지붕 없는 화물칸 다섯 량(총 부품이 가득).
// 앞면이 z = 0이고 뒤로 -length까지 이어진다. +z(화면 아래) 방향으로 달린다.
// 같은 모양이 많은 부품(창살, 배관, 총열 등)은 InstancedMesh 하나로 한꺼번에 그린다.

export const TRAIN_HALF_W = 1.92; // 통로 폭(2.0)보다 살짝 좁게: 벽에 붙은 장식과 닿지 않게
const FRONT_LEN = 5.0;
const FRONT_H = 3.25;
const CARS = 5;
const GAP = 0.26;
const BED_Y = 0.6;  // 화물칸 바닥 높이
const WALL_H = 1.05; // 화물칸 옆벽 높이

/** 같은 지오메트리를 여러 위치에 그리는 InstancedMesh를 만든다. placements: [{p, r, s}] */
function instanced(geo, mat, placements) {
  const mesh = new THREE.InstancedMesh(geo, mat, placements.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  placements.forEach((pl, i) => {
    e.set(pl.r[0], pl.r[1], pl.r[2], 'YXZ'); // 눕히거나 기울인 뒤 마지막에 수평으로 돌린다
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(...pl.p), q, new THREE.Vector3(...(pl.s || [1, 1, 1])));
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** U자로 꺾인 배관 경로 */
function uPipeCurve(len, r) {
  const path = new THREE.CurvePath();
  path.add(new THREE.LineCurve3(new THREE.Vector3(-r, 0, len), new THREE.Vector3(-r, 0, 0)));
  const arc = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI - (i / 12) * Math.PI;
    arc.push(new THREE.Vector3(Math.cos(a) * r, 0, -Math.sin(a) * r));
  }
  path.add(new THREE.CatmullRomCurve3(arc));
  path.add(new THREE.LineCurve3(new THREE.Vector3(r, 0, 0), new THREE.Vector3(r, 0, len)));
  return path;
}

export function createTrain(length) {
  const group = new THREE.Group();
  const disposables = [];
  const keep = (...items) => {
    disposables.push(...items);
    return items[0];
  };
  const rng = createRng(4242);
  const W = TRAIN_HALF_W * 2;
  const box = (mat, [w, h, d], [x, y, z]) => {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  const rustTex = keep(makeRustMetalTexture({ seed: 91, base: [64, 58, 50] }));
  const hazardTex = keep(makeHazardTexture({ seed: 8 }));
  const bodyMat = keep(new THREE.MeshStandardMaterial({ map: keep(withRepeat(rustTex, 3, 1)), roughness: 0.65, metalness: 0.6 }));
  const darkMat = keep(new THREE.MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.55, metalness: 0.7 }));
  const bumperMat = keep(new THREE.MeshStandardMaterial({ map: keep(withRepeat(hazardTex, 8, 1)), roughness: 0.6, metalness: 0.3 }));
  const copperMat = keep(new THREE.MeshStandardMaterial({ color: 0xc0703c, roughness: 0.32, metalness: 0.9 }));
  const barMat = keep(new THREE.MeshStandardMaterial({ color: 0x2c2d2e, roughness: 0.4, metalness: 0.8 }));
  const gunMetal = keep(new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.38, metalness: 0.8 }));
  const polymer = keep(new THREE.MeshStandardMaterial({ color: 0x18191a, roughness: 0.75, metalness: 0.1 }));
  const wood = keep(new THREE.MeshStandardMaterial({ color: 0x6e4428, roughness: 0.7, metalness: 0.05 }));
  const crateMat = keep(new THREE.MeshStandardMaterial({ color: 0x4a5124, roughness: 0.85, metalness: 0.1 }));
  const redLamp = keep(new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }));

  // ===== 맨 앞 우리 칸 =====
  const fz = -FRONT_LEN / 2;
  box(darkMat, [W, 0.5, FRONT_LEN], [0, 0.33, fz]);
  box(bumperMat, [W, 0.42, 0.26], [0, 0.31, -0.13]);
  for (const s of [-1, 1]) {
    const lamp = new THREE.Mesh(keep(new THREE.BoxGeometry(0.28, 0.16, 0.04)), redLamp);
    lamp.position.set(s * (TRAIN_HALF_W - 0.35), 0.36, 0.01);
    group.add(lamp);
  }
  // 모서리 기둥과 윗테두리
  const postH = FRONT_H - 0.58;
  for (const x of [-1, 1]) for (const z of [-0.28, -FRONT_LEN + 0.1]) box(bodyMat, [0.18, postH, 0.18], [x * (TRAIN_HALF_W - 0.09), 0.58 + postH / 2, z]);
  for (const x of [-1, 1]) box(bodyMat, [0.14, 0.14, FRONT_LEN - 0.2], [x * (TRAIN_HALF_W - 0.07), FRONT_H - 0.07, fz - 0.1]);
  for (const z of [-0.28, -FRONT_LEN + 0.1]) box(bodyMat, [W, 0.16, 0.16], [0, FRONT_H - 0.08, z]);
  for (const y of [1.45, 2.35]) box(bodyMat, [W, 0.09, 0.09], [0, y, -0.25]);
  // 창살: 앞면 세로, 옆면 세로, 지붕 가로
  const barGeo = keep(new THREE.CylinderGeometry(0.035, 0.035, 1, 6));
  const bars = [];
  for (let x = -TRAIN_HALF_W + 0.25; x < TRAIN_HALF_W - 0.15; x += 0.2) bars.push({ p: [x, 0.58 + postH / 2, -0.26], r: [0, 0, 0], s: [1, postH, 1] });
  for (const s of [-1, 1]) {
    for (let z = -0.6; z > -FRONT_LEN + 0.3; z -= 0.3) bars.push({ p: [s * (TRAIN_HALF_W - 0.06), 0.58 + postH / 2, z], r: [0, 0, 0], s: [1, postH, 1] });
  }
  for (let x = -TRAIN_HALF_W + 0.3; x < TRAIN_HALF_W - 0.2; x += 0.32) bars.push({ p: [x, FRONT_H - 0.07, fz - 0.1], r: [Math.PI / 2, 0, 0], s: [1, FRONT_LEN - 0.4, 1] });
  group.add(keep(instanced(barGeo, barMat, bars)));
  // 우리 안: 구리 U자 배관 더미와 검은 받침틀
  const uGeo = keep(new THREE.TubeGeometry(uPipeCurve(1.3, 0.32), 40, 0.085, 8, false));
  const pipes = [];
  for (let layer = 0; layer < 4; layer++) {
    const flip = layer % 2 === 1; // 층마다 U자 방향을 바꿔 쌓음 (다리가 창살 밖으로 나오지 않게 위치를 맞춤)
    for (let k = 0; k < 4; k++) {
      pipes.push({
        p: [-1.3 + k * 0.86 + (rng() - 0.5) * 0.1, 0.8 + layer * 0.55, flip ? -0.68 - rng() * 0.25 : -1.85 - rng() * 0.3],
        r: [(rng() - 0.5) * 0.12, (flip ? Math.PI : 0) + (rng() - 0.5) * 0.2, (rng() - 0.5) * 0.12],
      });
    }
  }
  group.add(keep(instanced(uGeo, copperMat, pipes)));
  for (let k = 0; k < 3; k++) box(darkMat, [W - 0.5, 0.12, 0.12], [0, 0.7 + k * 0.8, -2.6 - k * 0.5]);
  box(darkMat, [0.5, 1.6, 1.0], [-1.2, 1.38, -3.9]);
  box(darkMat, [0.7, 1.1, 0.8], [0.9, 1.13, -4.1]);

  // ===== 화물칸 =====
  const carLen = (length - FRONT_LEN - GAP * CARS) / CARS;
  const parts = { barrel: [], receiver: [], mag: [], stock: [], crate: [] };
  for (let c = 0; c < CARS; c++) {
    const z1 = -FRONT_LEN - GAP - c * (carLen + GAP); // 칸 앞쪽 끝
    const zc = z1 - carLen / 2;
    box(darkMat, [W, 0.5, carLen], [0, 0.33, zc]);
    for (const s of [-1, 1]) box(bodyMat, [0.1, WALL_H, carLen], [s * (TRAIN_HALF_W - 0.05), BED_Y + WALL_H / 2, zc]);
    for (const z of [z1 - 0.05, z1 - carLen + 0.05]) box(bodyMat, [W, WALL_H, 0.1], [0, BED_Y + WALL_H / 2, z]);
    // 옆벽 보강대
    for (let z = z1 - 0.6; z > z1 - carLen + 0.3; z -= 1.2) {
      for (const s of [-1, 1]) box(darkMat, [0.06, WALL_H + 0.1, 0.12], [s * (TRAIN_HALF_W - 0.01), BED_Y + WALL_H / 2, z]);
    }
    box(darkMat, [0.5, 0.22, GAP + 0.3], [0, 0.42, z1 + GAP / 2]); // 연결부

    // 총 부품 더미: 가운데가 볼록하게 쌓임
    const heap = (lx, lz) => 0.15 + 0.75 * (1 - (lx / TRAIN_HALF_W) ** 2) * (1 - (lz / (carLen / 2)) ** 2);
    // reach: 부품 길이의 절반. 어느 방향으로 돌아가도 옆벽 밖으로 삐져나오지 않게 그만큼 안쪽에 놓는다
    const spot = (reach) => {
      const lx = (rng() * 2 - 1) * (TRAIN_HALF_W - 0.12 - reach);
      const lz = (rng() * 2 - 1) * (carLen / 2 - 0.12 - reach);
      return { lx, lz, y: BED_Y + heap(lx, lz) * (0.6 + rng() * 0.4) };
    };
    const lying = () => [(rng() - 0.5) * 0.35, rng() * Math.PI * 2, (rng() - 0.5) * 0.35];
    const crates = c === 1 || c === 3;
    for (let i = 0; i < 46; i++) {
      const s = spot(0.53);
      const r = lying();
      parts.barrel.push({ p: [s.lx, s.y, zc + s.lz], r: [Math.PI / 2 + r[0], r[1], r[2]] }); // 원통을 눕힘
    }
    for (let i = 0; i < 30; i++) {
      const s = spot(0.32);
      parts.receiver.push({ p: [s.lx, s.y + 0.05, zc + s.lz], r: lying() });
    }
    for (let i = 0; i < 30; i++) {
      const s = spot(0.17);
      parts.mag.push({ p: [s.lx, s.y + 0.04, zc + s.lz], r: [Math.PI / 2 + (rng() - 0.5) * 0.4, rng() * Math.PI * 2, 0] });
    }
    for (let i = 0; i < 16; i++) {
      const s = spot(0.27);
      parts.stock.push({ p: [s.lx, s.y + 0.05, zc + s.lz], r: lying() });
    }
    if (crates) {
      for (let i = 0; i < 6; i++) {
        const lx = (i % 2 ? 1 : -1) * (0.65 + rng() * 0.3);
        const lz = (Math.floor(i / 2) - 1) * (carLen / 3.4);
        parts.crate.push({ p: [lx, BED_Y + 0.3 + (i === 2 ? 0.55 : 0), zc + lz], r: [0, (rng() - 0.5) * 0.3, 0] });
      }
    }
  }
  group.add(keep(instanced(keep(new THREE.CylinderGeometry(0.045, 0.05, 1.05, 7)), gunMetal, parts.barrel)));
  group.add(keep(instanced(keep(new THREE.BoxGeometry(0.15, 0.17, 0.62)), gunMetal, parts.receiver)));
  group.add(keep(instanced(keep(new THREE.BoxGeometry(0.07, 0.32, 0.13)), polymer, parts.mag)));
  group.add(keep(instanced(keep(new THREE.BoxGeometry(0.12, 0.2, 0.52)), wood, parts.stock)));
  group.add(keep(instanced(keep(new THREE.BoxGeometry(0.8, 0.6, 1.1)), crateMat, parts.crate)));

  group.userData.dispose = () => {
    group.removeFromParent();
    for (const d of disposables) d.dispose();
  };
  return group;
}
