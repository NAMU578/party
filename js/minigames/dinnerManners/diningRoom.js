import * as THREE from 'three';
import { createRng } from '../../core/random.js';
import { makeConcreteTexture, makeRustMetalTexture, withRepeat } from '../../render/proceduralTextures.js';
import { TABLE_HALF_W, TABLE_Y } from './dinnerRules.js';
import { PEA_R } from './plateView.js';

// 움직이지 않는 배경: 어두운 지하 창고, 긴 금속 식탁, 의자, 통조림이 쌓인 선반, 식탁 위 전등.
// 식탁 위에는 빈 통조림이 서 있거나 쓰러져 콩이 흘러나와 있다.

const ROOM_HALF_X = 4.4;
const ROOM_H = 5.0;
const CAN_R = 0.085;
const CAN_H = 0.21;
const LAMP_Y = 4.3; // 시선(카메라 → 집주인 얼굴)보다 높게 매달아 얼굴을 가리지 않게
const SPOT = 48; // 전등 하나의 세기
const GLOW = 4;

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 콩 통조림 상표: 녹색 띠, 흰 바탕에 콩 그림과 글자. 원기둥 옆면을 한 바퀴 감싼다 */
function makeCanLabel() {
  return canvasTexture(256, 96, (g, w, h) => {
    const rng = createRng(17);
    g.fillStyle = '#d9d3c0';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2d5b33';
    g.fillRect(0, 0, w, 20);
    g.fillRect(0, h - 20, w, 20);
    g.fillStyle = '#b3a47a';
    g.fillRect(0, 20, w, 3);
    g.fillRect(0, h - 23, w, 3);
    for (const x0 of [10, 138]) {
      g.fillStyle = '#2d5b33';
      g.font = 'bold 21px Georgia, serif';
      g.fillText('GREEN PEAS', x0, 52);
      g.font = '11px sans-serif';
      g.fillText('IN BRINE · NET 400g', x0 + 2, 68);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = rng() < 0.5 ? '#4f9a2e' : '#3f7f24';
        g.beginPath();
        g.arc(x0 + 82 + rng() * 26, 28 + rng() * 40, 4 + rng() * 2, 0, Math.PI * 2);
        g.fill();
      }
    }
    // 오래된 얼룩
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(70,55,35,${rng() * 0.18})`;
      g.fillRect(rng() * w, rng() * h, 2 + rng() * 14, 2 + rng() * 8);
    }
  });
}

function makeCardboard() {
  return canvasTexture(128, 128, (g, w, h) => {
    const rng = createRng(23);
    g.fillStyle = '#7d6343';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${rng() < 0.5 ? '40,28,15' : '170,140,100'},${rng() * 0.15})`;
      g.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3);
    }
    g.fillStyle = 'rgba(190,175,140,0.55)';
    g.fillRect(0, h / 2 - 8, w, 16); // 테이프
  });
}

/** 고정 시점: 식탁 아래쪽 끝 너머에서 집주인 쪽을 내려다본다 (인원이 적어도 집주인 머리가 잘리지 않게 거리를 둔다) */
export function diningView(layout, cfg) {
  const h = Math.max(layout.half, 1.9);
  return { fov: cfg.fov, position: [0, 4.4, h + 5.0], lookAt: [0, 1.35, -h * 0.35] };
}

export function createDiningRoom(layout) {
  const group = new THREE.Group();
  const disposables = [];
  const keep = (x) => {
    disposables.push(x);
    return x;
  };
  const rng = createRng(91);
  const { half, seats, hostZ } = layout;
  const zBack = hostZ - 2.0;
  const zFront = half + 6.5;
  const depth = zFront - zBack;
  const zMid = (zBack + zFront) / 2;

  const mesh = (geo, mat, [x, y, z], rot, { cast = false, receive = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rot) m.rotation.set(...rot);
    m.castShadow = cast;
    m.receiveShadow = receive;
    group.add(m);
    return m;
  };

  // 방: 바닥, 벽, 천장 (얼룩진 콘크리트)
  const floorTex = keep(makeConcreteTexture({ seed: 44, base: [62, 60, 55], contrast: 55, stainCount: 50, crackCount: 10 }));
  floorTex.repeat.set(3, depth / 3);
  mesh(keep(new THREE.PlaneGeometry(ROOM_HALF_X * 2, depth)), keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 })), [0, 0, zMid], [-Math.PI / 2, 0, 0]);
  const wallTex = keep(makeConcreteTexture({ seed: 52, base: [84, 90, 84], contrast: 70, stainCount: 45, drips: 40, crackCount: 6 }));
  const wallMat = (rx) => keep(new THREE.MeshStandardMaterial({ map: keep(withRepeat(wallTex, rx, 1.2)), roughness: 0.95 }));
  mesh(keep(new THREE.PlaneGeometry(ROOM_HALF_X * 2, ROOM_H)), wallMat(2.5), [0, ROOM_H / 2, zBack]);
  mesh(keep(new THREE.PlaneGeometry(ROOM_HALF_X * 2, ROOM_H)), wallMat(2.5), [0, ROOM_H / 2, zFront], [0, Math.PI, 0]);
  const sideGeo = keep(new THREE.PlaneGeometry(depth, ROOM_H));
  mesh(sideGeo, wallMat(depth / 3.5), [-ROOM_HALF_X, ROOM_H / 2, zMid], [0, Math.PI / 2, 0]);
  mesh(sideGeo, wallMat(depth / 3.5), [ROOM_HALF_X, ROOM_H / 2, zMid], [0, -Math.PI / 2, 0]);
  mesh(keep(new THREE.PlaneGeometry(ROOM_HALF_X * 2, depth)), keep(new THREE.MeshStandardMaterial({ color: 0x1c1d1b, roughness: 1 })), [0, ROOM_H, zMid], [Math.PI / 2, 0, 0]);

  // 식탁: 금속 상판과 다리
  const tableTex = keep(makeRustMetalTexture({ seed: 33, base: [104, 110, 108] }));
  tableTex.repeat.set(1, half);
  const tableMat = keep(new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.55, metalness: 0.55 }));
  mesh(keep(new THREE.BoxGeometry(TABLE_HALF_W * 2, 0.05, half * 2)), tableMat, [0, TABLE_Y - 0.025, 0], null, { cast: true });
  const darkMetal = keep(new THREE.MeshStandardMaterial({ map: keep(makeRustMetalTexture({ seed: 35, base: [60, 62, 60] })), roughness: 0.6, metalness: 0.5 }));
  const legGeo = keep(new THREE.BoxGeometry(0.06, TABLE_Y - 0.05, 0.06));
  for (const x of [-1, 1]) {
    for (const z of [-1, 0, 1]) mesh(legGeo, darkMetal, [x * (TABLE_HALF_W - 0.08), (TABLE_Y - 0.05) / 2, z * (half - 0.1)], null, { cast: true });
    mesh(keep(new THREE.BoxGeometry(0.03, 0.08, half * 2 - 0.1)), darkMetal, [x * (TABLE_HALF_W - 0.04), TABLE_Y - 0.09, 0]);
  }

  // 의자: 좌판, 다리, 세로살 등받이 (앞쪽이 식탁)
  const chairMat = keep(new THREE.MeshStandardMaterial({ map: keep(makeRustMetalTexture({ seed: 39, base: [86, 94, 90] })), roughness: 0.6, metalness: 0.5 }));
  const chairGeo = {
    seat: keep(new THREE.BoxGeometry(0.46, 0.04, 0.44)),
    leg: keep(new THREE.BoxGeometry(0.03, 0.47, 0.03)),
    post: keep(new THREE.BoxGeometry(0.035, 0.62, 0.035)),
    rail: keep(new THREE.BoxGeometry(0.46, 0.06, 0.03)),
    slat: keep(new THREE.BoxGeometry(0.03, 0.42, 0.015)),
  };
  for (const s of seats) {
    const chair = new THREE.Group();
    chair.position.set(s.x, 0, s.z);
    chair.rotation.y = s.facing;
    const part = (geo, x, y, z) => {
      const m = new THREE.Mesh(geo, chairMat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      chair.add(m);
    };
    part(chairGeo.seat, 0, 0.47, -0.04);
    for (const x of [-0.2, 0.2]) for (const z of [-0.24, 0.16]) part(chairGeo.leg, x, 0.235, z);
    for (const x of [-0.21, 0.21]) part(chairGeo.post, x, 0.78, -0.3);
    part(chairGeo.rail, 0, 1.06, -0.3);
    for (const x of [-0.1, 0, 0.1]) part(chairGeo.slat, x, 0.82, -0.3);
    group.add(chair);
  }

  // 통조림 (상표 / 뚜껑 / 바닥)
  const canGeo = keep(new THREE.CylinderGeometry(CAN_R, CAN_R, CAN_H, 20));
  const lid = keep(new THREE.MeshStandardMaterial({ color: 0x9a9c98, roughness: 0.35, metalness: 0.85 }));
  const canMats = [keep(new THREE.MeshStandardMaterial({ map: keep(makeCanLabel()), roughness: 0.5, metalness: 0.2 })), lid, lid];
  const openCanMats = [canMats[0], keep(new THREE.MeshStandardMaterial({ color: 0x1d2a17, roughness: 0.7 })), lid]; // 열린 통 (안쪽에 콩)

  // 선반: 집주인 뒤 벽과 양옆 벽
  const boxMat = keep(new THREE.MeshStandardMaterial({ map: keep(makeCardboard()), roughness: 0.9 }));
  const canSpots = [];
  const shelf = (cx, cz, rotY, width) => {
    const unit = new THREE.Group();
    unit.position.set(cx, 0, cz);
    unit.rotation.y = rotY;
    const d = 0.45;
    const postGeo = keep(new THREE.BoxGeometry(0.045, 2.6, 0.045));
    for (const x of [-width / 2, width / 2]) for (const z of [-d / 2, d / 2]) {
      const p = new THREE.Mesh(postGeo, darkMetal);
      p.position.set(x, 1.3, z);
      unit.add(p);
    }
    const boardGeo = keep(new THREE.BoxGeometry(width, 0.03, d));
    for (const y of [0.25, 0.9, 1.55, 2.2]) {
      const b = new THREE.Mesh(boardGeo, darkMetal);
      b.position.set(0, y, 0);
      b.receiveShadow = true;
      unit.add(b);
      for (let x = -width / 2 + 0.14; x < width / 2 - 0.1; x += CAN_R * 2.2) {
        if (rng() < 0.18) {
          // 군데군데 상자
          const w = 0.3 + rng() * 0.2;
          const bh = 0.25 + rng() * 0.2;
          const box = new THREE.Mesh(keep(new THREE.BoxGeometry(w, bh, 0.36)), boxMat);
          box.position.set(x + w / 2 - CAN_R, y + 0.015 + bh / 2, 0);
          box.rotation.y = (rng() - 0.5) * 0.15;
          unit.add(box);
          x += w;
          continue;
        }
        if (rng() < 0.15) continue;
        canSpots.push({ unit, x, y: y + 0.015 + CAN_H / 2, z: (rng() - 0.5) * 0.12, spin: rng() * Math.PI * 2 });
        if (rng() < 0.4) canSpots.push({ unit, x, y: y + 0.015 + CAN_H * 1.5, z: (rng() - 0.5) * 0.05, spin: rng() * Math.PI * 2 }); // 2단
      }
    }
    group.add(unit);
    return unit;
  };
  shelf(0, zBack + 0.3, 0, 3.4);
  for (const side of [-1, 1]) {
    shelf(side * (ROOM_HALF_X - 0.3), hostZ + 0.2, -side * (Math.PI / 2), 2.2);
    shelf(side * (ROOM_HALF_X - 0.3), half + 1.4, -side * (Math.PI / 2), 2.2);
  }
  const shelfCans = new THREE.InstancedMesh(canGeo, canMats, canSpots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  group.updateMatrixWorld(true);
  canSpots.forEach((c, i) => {
    c.unit.updateMatrixWorld(true);
    const pos = new THREE.Vector3(c.x, c.y, c.z).applyMatrix4(c.unit.matrixWorld);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.spin);
    shelfCans.setMatrixAt(i, m.compose(pos, q, one));
  });
  shelfCans.castShadow = true;
  group.add(shelfCans);

  // 식탁 위 통조림: 좌석 줄 사이마다, 일부는 쓰러져 콩이 흘러나옴
  const rows = Math.ceil(seats.length / 2);
  const spill = [];
  for (let r = 0; r <= rows; r++) {
    const z = -half + 0.45 + r * ((half * 2 - 0.9) / Math.max(1, rows)) + (rng() - 0.5) * 0.15;
    const x = (rng() - 0.5) * 0.18;
    if (rng() < 0.45) {
      // 쓰러진 통: 식탁 길이 방향으로 누워 있고, 열린 쪽에서 콩이 흘러나온다
      const dir = rng() < 0.5 ? -1 : 1;
      mesh(canGeo, openCanMats, [x, TABLE_Y + CAN_R, z], [(dir * Math.PI) / 2, 0, 0], { cast: true });
      for (let i = 0; i < 14; i++) {
        const t = rng();
        spill.push([x + (rng() - 0.5) * (0.05 + t * 0.12), TABLE_Y + PEA_R, z + dir * (CAN_H / 2 + 0.02 + t * 0.2)]);
      }
    } else {
      mesh(canGeo, canMats, [x, TABLE_Y + CAN_H / 2, z], [0, rng() * Math.PI * 2, 0], { cast: true });
    }
  }
  for (let i = 0; i < 24; i++) spill.push([(rng() - 0.5) * 0.28, TABLE_Y + PEA_R, (rng() - 0.5) * half * 1.8]); // 접시 사이에 떨어진 콩
  const peaMat = keep(new THREE.MeshStandardMaterial({ color: 0x4f9a2e, roughness: 0.42 }));
  const spilled = new THREE.InstancedMesh(keep(new THREE.IcosahedronGeometry(PEA_R, 1)), peaMat, spill.length);
  spill.forEach(([x, y, z], i) => spilled.setMatrixAt(i, m.makeTranslation(x, y, z)));
  group.add(spilled);

  // 전등: 식탁 앞뒤 절반 위에 하나씩 매달린 갓과 전구. 식탁은 위에서 비추고(그림자), 방 전체는 은은하게
  const shadeMat = keep(new THREE.MeshStandardMaterial({ color: 0x2b2c29, roughness: 0.6, metalness: 0.6, side: THREE.DoubleSide }));
  const cordGeo = keep(new THREE.CylinderGeometry(0.012, 0.012, ROOM_H - LAMP_Y, 4));
  const shadeGeo = keep(new THREE.CylinderGeometry(0.1, 0.38, 0.28, 18, 1, true));
  const bulbGeo = keep(new THREE.SphereGeometry(0.075, 12, 8));
  const bulbColor = new THREE.Color(0xffdca8);
  const bulbMat = keep(new THREE.MeshBasicMaterial({ color: bulbColor, toneMapped: false }));
  const lights = [];
  for (const z of [-half * 0.5, half * 0.5]) {
    mesh(cordGeo, shadeMat, [0, (ROOM_H + LAMP_Y) / 2, z]);
    mesh(shadeGeo, shadeMat, [0, LAMP_Y - 0.1, z]);
    mesh(bulbGeo, bulbMat, [0, LAMP_Y - 0.2, z]);
    const spot = new THREE.SpotLight(0xffd9a6, SPOT, 0, 0.95, 0.6, 2);
    spot.position.set(0, LAMP_Y - 0.15, z);
    spot.target.position.set(0, 0, z * 1.2);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    spot.shadow.camera.near = 0.3;
    spot.shadow.camera.far = 10;
    const glow = new THREE.PointLight(0xffc98a, GLOW, 0, 2);
    glow.position.set(0, LAMP_Y - 0.25, z);
    group.add(spot, spot.target, glow);
    lights.push(spot, glow);
  }

  return {
    group,
    update(time) {
      // 전등이 가끔 미세하게 떨린다
      const flicker = 0.94 + 0.04 * Math.sin(time * 9.7) + 0.03 * Math.sin(time * 23.1 + 1.3) - (Math.sin(time * 0.7) > 0.985 ? 0.25 : 0);
      lights.forEach((l, i) => {
        l.intensity = (i % 2 ? GLOW : SPOT) * flicker;
      });
      bulbMat.color.copy(bulbColor).multiplyScalar(0.75 + 0.25 * flicker);
    },
    dispose() {
      group.removeFromParent();
      for (const l of lights) l.shadow?.map?.dispose();
      shelfCans.dispose();
      spilled.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
