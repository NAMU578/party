import * as THREE from 'three';
import { createRng } from '../../core/random.js';
import { makeConcreteTexture, makeGlowTexture, makeRustMetalTexture } from '../../render/proceduralTextures.js';

// 움직이지 않는 공장 배경과 가운데 소각로.
//  - 바닥에 둥근 구멍이 뚫려 있고 낮은 테두리가 둘러싼다. 안쪽 벽은 아래로 갈수록 뜨겁게 빛난다.
//  - 소각로 불빛(주황 점광원)이 작업대들을 비춘다. 버린 물건이 떨어질 때마다 잠깐 더 밝아진다 (flare).
//  - 둘레: 녹슨 벽과 기둥, 천장 배관, 매달린 전등

export const PIT_R = 1.7; // 소각로 구멍 반지름
const RIM_H = 0.6;
const RIM_W = 0.42;
const PIT_DEPTH = 1.6;
const WALL_R = 17;
const WALL_H = 12;
const FLOOR = WALL_R * 2.4;
const LIGHT = 55; // 소각로 불빛 세기

function canvasTex(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 소각로 안쪽 벽: 위는 그을린 검정, 아래로 갈수록 주황 */
function heatTexture() {
  return canvasTex(8, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#120c0a');
    grad.addColorStop(0.35, '#3a1606');
    grad.addColorStop(0.8, '#c2410c');
    grad.addColorStop(1, '#ffb347');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/** 소각로 바닥의 불: 가운데 흰빛 → 주황 → 붉은 가장자리, 불티 */
function fireTexture() {
  return canvasTex(128, 128, (g, w) => {
    const c = w / 2;
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, '#fff3c4');
    grad.addColorStop(0.35, '#ffb02e');
    grad.addColorStop(0.7, '#e2531a');
    grad.addColorStop(1, '#7a1c08');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
    const rng = createRng(27);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rng() < 0.5 ? 'rgba(90,20,5,0.35)' : 'rgba(255,240,180,0.35)';
      g.fillRect(rng() * w, rng() * w, 1 + rng() * 3, 1 + rng() * 3);
    }
  });
}

export function createFactory() {
  const group = new THREE.Group();
  const disposables = [];
  const keep = (x) => {
    disposables.push(x);
    return x;
  };
  const mesh = (geo, mat, [x, y, z], rot) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.position.set(x, y, z);
    if (rot) m.rotation.set(...rot);
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // 바닥: 가운데에 소각로 구멍. ShapeGeometry의 UV는 좌표 그대로라 반복 수를 크기에 맞춘다
  const floorTex = keep(makeConcreteTexture({ seed: 31, base: [66, 62, 56], contrast: 60, stainCount: 40, crackCount: 8 }));
  floorTex.repeat.set(1 / 5, 1 / 5);
  const shape = new THREE.Shape();
  shape.moveTo(-FLOOR / 2, -FLOOR / 2);
  shape.lineTo(FLOOR / 2, -FLOOR / 2);
  shape.lineTo(FLOOR / 2, FLOOR / 2);
  shape.lineTo(-FLOOR / 2, FLOOR / 2);
  const hole = new THREE.Path();
  hole.absarc(0, 0, PIT_R, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  mesh(new THREE.ShapeGeometry(shape, 28), keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 })), [0, 0, 0], [-Math.PI / 2, 0, 0]);

  // 소각로
  const rimMat = keep(new THREE.MeshStandardMaterial({ map: keep(makeRustMetalTexture({ seed: 77, base: [92, 84, 72] })), roughness: 0.6, metalness: 0.6 }));
  mesh(new THREE.CylinderGeometry(PIT_R + RIM_W, PIT_R + RIM_W + 0.1, RIM_H, 28, 1, true), rimMat, [0, RIM_H / 2, 0]);
  mesh(new THREE.RingGeometry(PIT_R, PIT_R + RIM_W, 28), rimMat, [0, RIM_H, 0], [-Math.PI / 2, 0, 0]);
  const wallMat = keep(new THREE.MeshBasicMaterial({ map: keep(heatTexture()), side: THREE.BackSide, toneMapped: false }));
  mesh(new THREE.CylinderGeometry(PIT_R, PIT_R, PIT_DEPTH + RIM_H, 28, 1, true), wallMat, [0, (RIM_H - PIT_DEPTH) / 2, 0]);
  const fireTex = keep(fireTexture());
  fireTex.center.set(0.5, 0.5);
  const fireMat = keep(new THREE.MeshBasicMaterial({ map: fireTex, toneMapped: false }));
  mesh(new THREE.CircleGeometry(PIT_R, 28), fireMat, [0, -PIT_DEPTH, 0], [-Math.PI / 2, 0, 0]);

  // 소각로 위로 번지는 열기 (가산 혼합 빛)
  const glowTex = keep(makeGlowTexture());
  const haze = new THREE.Sprite(
    keep(new THREE.SpriteMaterial({ map: glowTex, color: 0xff7a2a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })),
  );
  haze.position.y = 1.0;
  haze.scale.setScalar(PIT_R * 3.4);
  group.add(haze);

  const fireLight = new THREE.PointLight(0xff7a2a, LIGHT, 0, 2);
  fireLight.position.y = 1.2;
  group.add(fireLight);

  // 벽과 기둥
  const wallTex = keep(makeRustMetalTexture({ size: 256, seed: 83, base: [70, 64, 56] }));
  wallTex.repeat.set(10, 3);
  mesh(new THREE.CylinderGeometry(WALL_R, WALL_R, WALL_H, 12, 1, true), keep(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0.3, side: THREE.BackSide })), [0, WALL_H / 2, 0]);
  const darkMetal = keep(new THREE.MeshStandardMaterial({ color: 0x3b3833, roughness: 0.7, metalness: 0.5 }));
  const pillarGeo = keep(new THREE.BoxGeometry(0.9, WALL_H, 0.9));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const p = new THREE.Mesh(pillarGeo, darkMetal);
    p.position.set(Math.sin(a) * (WALL_R - 0.4), WALL_H / 2, Math.cos(a) * (WALL_R - 0.4));
    p.rotation.y = a;
    group.add(p);
  }

  // 천장 배관
  const pipeMat = keep(new THREE.MeshStandardMaterial({ color: 0x6a645a, roughness: 0.5, metalness: 0.7 }));
  for (const [x, z, rotY, r] of [[0, -5, 0, 0.35], [0, 6.5, 0, 0.25], [-7.5, 0, Math.PI / 2, 0.3], [8.5, 0, Math.PI / 2, 0.42]]) {
    mesh(new THREE.CylinderGeometry(r, r, WALL_R * 2, 12), pipeMat, [x, 8.5 + r, z], [0, rotY, Math.PI / 2]);
  }

  // 매달린 전등 (빛은 내지 않는 장식)
  const cordGeo = keep(new THREE.CylinderGeometry(0.02, 0.02, 1, 4));
  const shadeGeo = keep(new THREE.CylinderGeometry(0.14, 0.5, 0.36, 12, 1, true));
  const bulbGeo = keep(new THREE.SphereGeometry(0.12, 10, 6));
  const shadeMat = keep(new THREE.MeshStandardMaterial({ color: 0x2c2a26, roughness: 0.6, metalness: 0.6, side: THREE.DoubleSide }));
  const bulbMat = keep(new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }));
  for (let k = 0; k < 6; k++) {
    const a = ((k + 0.5) / 6) * Math.PI * 2;
    const x = Math.sin(a) * 10.5;
    const z = Math.cos(a) * 10.5;
    const cord = new THREE.Mesh(cordGeo, darkMetal);
    cord.scale.y = WALL_H - 7.2;
    cord.position.set(x, (WALL_H + 7.2) / 2, z);
    const shade = new THREE.Mesh(shadeGeo, shadeMat);
    shade.position.set(x, 7.0, z);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(x, 6.85, z);
    group.add(cord, shade, bulb);
  }

  let flareLevel = 0;
  return {
    group,
    /** 버린 물건이 떨어짐: 잠깐 더 밝게 */
    flare() {
      flareLevel = Math.min(1.2, flareLevel + 0.3);
    },
    update(dt, time) {
      flareLevel = Math.max(0, flareLevel - dt * 2.5);
      const flicker = 0.88 + 0.08 * Math.sin(time * 13.1) + 0.05 * Math.sin(time * 7.3 + 1.7);
      fireLight.intensity = LIGHT * flicker * (1 + 0.6 * flareLevel);
      haze.material.opacity = 0.45 * flicker + 0.35 * flareLevel;
      fireMat.color.setScalar(0.85 + 0.15 * flicker + 0.2 * flareLevel);
      fireTex.rotation = time * 0.15;
    },
    dispose() {
      group.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}
