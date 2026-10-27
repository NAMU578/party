import * as THREE from 'three';
import { makeConcreteTexture, makeRustMetalTexture, withRepeat } from '../../render/proceduralTextures.js';

// 바닥 아래 깊은 수직 갱도. 깊이감을 만드는 요소:
//  - 깊어질수록 급격히 어두워지는 벽·턱·배관 (정점 색) + 장면 안개
//  - 일정 간격의 턱과 경고등이 원근에 따라 작아지며 어둠에 묻힘
//  - 모서리 배관이 끝없이 내려감

const FADE = 7; // 이 깊이만큼 내려갈 때마다 밝기가 약 37%로 줄어듦

function shadeAt(worldY) {
  return 0.02 + 0.43 * Math.exp(Math.min(0, worldY) / FADE); // 입구도 판보다 확실히 어둡게
}

/** 기하 정점마다 깊이에 따른 밝기를 정점 색으로 넣는다 (offsetY: 메시가 놓일 높이) */
function applyDepthShade(geo, offsetY) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = shadeAt(pos.getY(i) + offsetY);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function createPit(layout, { depth }) {
  const group = new THREE.Group();
  const disposables = [];
  const W = layout.width;
  const D = layout.depth;

  const concrete = makeConcreteTexture({ seed: 41, base: [66, 64, 58], drips: 40, crackCount: 8, stainCount: 30 });
  disposables.push(concrete);

  const wall = (width, rotY, x, z) => {
    const geo = applyDepthShade(new THREE.PlaneGeometry(width, depth, 1, 40), -depth / 2);
    const map = withRepeat(concrete, width / 7, depth / 7);
    const mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = rotY;
    mesh.position.set(x, -depth / 2, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    disposables.push(geo, map, mat);
  };
  wall(W, 0, 0, -D / 2);
  wall(W, Math.PI, 0, D / 2);
  wall(D, Math.PI / 2, -W / 2, 0);
  wall(D, -Math.PI / 2, W / 2, 0);

  // 바닥 (완전히 어두움)
  const floorGeo = new THREE.PlaneGeometry(W, D);
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x010101 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -depth;
  group.add(floor);
  disposables.push(floorGeo, floorMat);

  // 일정 간격의 턱
  const ledgeT = 0.35;
  const ledgeH = 0.3;
  for (let y = -5; y > -depth; y -= 8) {
    const s = shadeAt(y) * 0.1;
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(s, s * 0.96, s * 0.9), roughness: 0.9 });
    disposables.push(mat);
    const pieces = [
      [W, ledgeT, 0, -D / 2 + ledgeT / 2],
      [W, ledgeT, 0, D / 2 - ledgeT / 2],
      [ledgeT, D, -W / 2 + ledgeT / 2, 0],
      [ledgeT, D, W / 2 - ledgeT / 2, 0],
    ];
    for (const [w, d, x, z] of pieces) {
      const geo = new THREE.BoxGeometry(w, ledgeH, d);
      disposables.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      group.add(m);
    }
  }

  // 경고등: 깊이마다 붙어 있어 내려다보면 점점 작고 흐려진다 (안개에 묻힘)
  const lampGeo = new THREE.BoxGeometry(0.35, 0.22, 0.12);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  disposables.push(lampGeo, lampMat);
  for (let y = -3; y > -depth + 4; y -= 8) {
    for (const [x, dy, z, ry] of [
      [-W / 2 + 0.07, 0, -D / 4, Math.PI / 2],
      [W / 2 - 0.07, -4, D / 4, -Math.PI / 2],
      [-W / 4, -2, -D / 2 + 0.07, 0],
      [W / 3, -6, -D / 2 + 0.07, 0],
    ]) {
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(x, y + dy, z);
      lamp.rotation.y = ry;
      group.add(lamp);
    }
  }
  const glow = new THREE.PointLight(0xff7a20, 12, 18, 2);
  glow.position.set(0, -8, -D / 4);
  group.add(glow);

  // 모서리 배관
  const pipeTex = makeRustMetalTexture({ seed: 71 });
  const pipeMat = new THREE.MeshStandardMaterial({ map: pipeTex, vertexColors: true, roughness: 0.7, metalness: 0.5 });
  const pipeGeo = applyDepthShade(new THREE.CylinderGeometry(0.22, 0.22, depth, 10, 30), -depth / 2);
  disposables.push(pipeTex, pipeMat, pipeGeo);
  for (const [x, z] of [[-W / 2 + 0.5, -D / 2 + 0.5], [W / 2 - 0.5, -D / 2 + 0.5], [-W / 2 + 0.5, D / 2 - 0.5], [W / 2 - 0.5, D / 2 - 0.5]]) {
    const pipe = new THREE.Mesh(pipeGeo, pipeMat);
    pipe.position.set(x, -depth / 2, z);
    group.add(pipe);
  }

  group.userData.dispose = () => {
    group.removeFromParent();
    for (const d of disposables) d.dispose();
  };
  return group;
}
