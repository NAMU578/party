import * as THREE from 'three';
import {
  makeConcreteTexture,
  makeRustMetalTexture,
  makeScreenTexture,
  makeTilePlateTexture,
  withRepeat,
} from './proceduralTextures.js';

// 낡은 콘크리트 방: 바닥 테두리, 벽, 원형 환풍구, 벽면 패널 3개(오른쪽은 고장).
// 바닥 가운데(타일 자리)는 비워 두고, 미니게임이 없을 때는 로비용 바닥으로 덮는다.

function addBox(parent, mat, [w, h, d], [x, y, z], { cast = false, receive = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  parent.add(m);
  return m;
}

function createVent(metalMat, darkMat) {
  const g = new THREE.Group();
  const R = 3.1;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.45, 12, 48), metalMat);
  const back = new THREE.Mesh(new THREE.CircleGeometry(R, 48), darkMat);
  back.position.z = 0.02;
  g.add(ring, back);
  for (let y = -R + 0.45; y <= R - 0.45; y += 0.55) {
    const len = 2 * Math.sqrt(R * R - y * y) - 0.3;
    const slat = new THREE.Mesh(new THREE.BoxGeometry(len, 0.42, 0.05), metalMat);
    slat.position.set(0, y, 0.25);
    slat.rotation.x = -0.55;
    g.add(slat);
  }
  return g;
}

/**
 * @returns {{ group, panelAnchors, setLobbyFloorVisible(v) }}
 * panelAnchors: [{ group, w, h, broken }] 벽면 기호를 붙일 위치
 */
export function createRoom({ floorWidth, floorDepth, cols, rows }) {
  const group = new THREE.Group();
  const halfW = floorWidth / 2;
  const halfD = floorDepth / 2;
  const innerX = halfW + 2.6;   // 옆벽 안쪽 면
  const backZ = -halfD - 2.6;   // 뒷벽 안쪽 면
  const frontZ = halfD + 2.4;   // 앞쪽 끝
  const wallH = 14;
  const rimTop = 0.25;

  const wallTex = makeConcreteTexture({ seed: 11, base: [122, 117, 104], drips: 28, crackCount: 10, stainCount: 36 });
  const rimTex = makeConcreteTexture({ seed: 23, base: [96, 92, 84], crackCount: 16, stainCount: 26 });
  const metalTex = makeRustMetalTexture({ seed: 31 });

  const backMat = new THREE.MeshStandardMaterial({ map: withRepeat(wallTex, 3, 1.8), roughness: 0.95 });
  const sideMat = new THREE.MeshStandardMaterial({ map: withRepeat(wallTex, 2.4, 1.8), roughness: 0.95 });
  const rimMat = new THREE.MeshStandardMaterial({ map: withRepeat(rimTex, 3, 1), roughness: 0.92 });
  const trimMat = new THREE.MeshStandardMaterial({ map: withRepeat(rimTex, 1, 4), roughness: 0.9, color: 0xb8b2a6 });
  const metalMat = new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.7, metalness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0b0d0c, roughness: 1 });

  // ---- 바닥 테두리 (가운데는 구덩이 자리로 비워 둠) ----
  const rimH = 1.25;
  const rimY = rimTop - rimH / 2;
  addBox(group, rimMat, [innerX * 2, rimH, -halfD - backZ], [0, rimY, (backZ - halfD) / 2]);
  addBox(group, rimMat, [innerX * 2, rimH, frontZ - halfD], [0, rimY, (frontZ + halfD) / 2]);
  addBox(group, rimMat, [innerX - halfW, rimH, floorDepth], [-(innerX + halfW) / 2, rimY, 0]);
  addBox(group, rimMat, [innerX - halfW, rimH, floorDepth], [(innerX + halfW) / 2, rimY, 0]);

  // ---- 벽 아래쪽 경사면 ----
  const cove = 1.3;
  const coveLen = cove * Math.SQRT2;
  const coveT = 0.4;
  const off = (Math.SQRT1_2 * coveT) / 2;
  const coveBack = addBox(group, trimMat, [innerX * 2, coveLen, coveT], [0, rimTop + cove / 2 - off, backZ + cove / 2 - off]);
  coveBack.rotation.x = -Math.PI / 4;
  const sideLen = frontZ - backZ;
  const coveL = addBox(group, trimMat, [coveT, coveLen, sideLen], [-innerX + cove / 2 - off, rimTop + cove / 2 - off, (backZ + frontZ) / 2]);
  coveL.rotation.z = Math.PI / 4;
  const coveR = addBox(group, trimMat, [coveT, coveLen, sideLen], [innerX - cove / 2 + off, rimTop + cove / 2 - off, (backZ + frontZ) / 2]);
  coveR.rotation.z = -Math.PI / 4;

  // ---- 벽 ----
  addBox(group, backMat, [innerX * 2 + 2, wallH, 1], [0, wallH / 2, backZ - 0.5]);
  addBox(group, sideMat, [1, wallH, frontZ - backZ + 1], [-innerX - 0.5, wallH / 2, (backZ + frontZ) / 2 - 0.5]);
  addBox(group, sideMat, [1, wallH, frontZ - backZ + 1], [innerX + 0.5, wallH / 2, (backZ + frontZ) / 2 - 0.5]);
  // 앞쪽 턱
  addBox(group, rimMat, [innerX * 2 + 2, 1.6, 1.4], [0, rimTop - 0.5, frontZ + 0.7]);

  // ---- 뒷벽 기둥, 보, 배관 ----
  for (const x of [-9.3, -3.1, 3.1, 9.3]) addBox(group, trimMat, [0.9, wallH, 0.35], [x, wallH / 2, backZ + 0.17], { cast: true });
  addBox(group, trimMat, [innerX * 2, 0.9, 0.9], [0, 12.6, backZ + 0.45], { cast: true });
  for (const [y, r] of [[11.35, 0.17], [10.9, 0.12]]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, innerX * 2, 10), metalMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, y, backZ + 0.62);
    pipe.castShadow = true;
    group.add(pipe);
  }

  // ---- 원형 환풍구 ----
  const ventL = createVent(metalMat, darkMat);
  ventL.rotation.y = Math.PI / 2;
  ventL.position.set(-innerX + 0.05, 7.2, -1.8);
  const ventR = createVent(metalMat, darkMat);
  ventR.rotation.y = -Math.PI / 2;
  ventR.position.set(innerX - 0.05, 7.2, -1.8);
  group.add(ventL, ventR);

  // ---- 벽면 패널 3개 (오른쪽은 고장난 모습) ----
  const screenTex = makeScreenTexture({ seed: 51 });
  const brokenTex = makeScreenTexture({ seed: 77, broken: true });
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
  const panelAnchors = [];
  [-6.2, 0, 6.2].forEach((x, i) => {
    const broken = i === 2;
    const w = 3.7;
    const h = 3.3;
    const t = 0.3;
    const panel = new THREE.Group();
    panel.position.set(x, 6.6, backZ + 0.3);
    if (broken) {
      panel.rotation.z = -0.07;
      panel.position.x += 0.12;
      panel.position.y -= 0.18;
    }
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.1),
      new THREE.MeshStandardMaterial({ map: broken ? brokenTex : screenTex, roughness: 0.25, metalness: 0.2 }),
    );
    panel.add(screen);
    addBox(panel, metalMat, [w + 2 * t, t, 0.5], [0, h / 2 + t / 2, 0.1], { cast: true });
    addBox(panel, metalMat, [w + 2 * t, t, 0.5], [0, -h / 2 - t / 2, 0.1], { cast: true });
    addBox(panel, metalMat, [t, h, 0.5], [-w / 2 - t / 2, 0, 0.1], { cast: true });
    const rightFrame = addBox(panel, metalMat, [t, h, 0.5], [w / 2 + t / 2, 0, 0.1], { cast: true });
    if (broken) {
      // 틀 한쪽이 빠져 늘어지고, 아래로 전선이 늘어짐
      rightFrame.rotation.z = 0.22;
      rightFrame.position.set(w / 2 + 0.35, -0.35, 0.18);
      for (const [cx, len, rot] of [[-1.0, 1.5, 0.12], [-0.6, 1.0, -0.2], [0.9, 1.25, 0.05]]) {
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), cableMat);
        cable.position.set(cx, -h / 2 - t - len / 2 + 0.1, 0.15);
        cable.rotation.z = rot;
        panel.add(cable);
      }
    }
    group.add(panel);
    panelAnchors.push({ group: panel, w, h, broken });
  });

  // ---- 로비용 바닥 (미니게임이 없을 때 구덩이 자리를 덮음) ----
  const lobbyFloor = addBox(
    group,
    new THREE.MeshStandardMaterial({ map: withRepeat(makeTilePlateTexture({ seed: 5 }), cols, rows), roughness: 0.6, metalness: 0.5 }),
    [floorWidth, 0.4, floorDepth],
    [0, -0.2, 0],
  );

  return {
    group,
    panelAnchors,
    setLobbyFloorVisible(v) {
      lobbyFloor.visible = v;
    },
  };
}
