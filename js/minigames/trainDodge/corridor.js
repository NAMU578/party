import * as THREE from 'three';
import {
  makeConcreteTexture,
  makeHazardTexture,
  makeRustMetalTexture,
  makeTilePlateTexture,
  withRepeat,
} from '../../render/proceduralTextures.js';

// 움직이지 않는 통로 배경.
//  - 바닥: 가운데 판, 레일 홈 두 줄, 바닥등이 놓이는 가장자리 줄
//  - 양쪽: 대피 구역 바닥판과 낮은 칸막이(위에 경고 띠), 그 뒤로 높은 녹슨 벽(기둥, 배관, 늘어진 케이블, 스프링)
//  - 위쪽 끝: 터널 입구가 뚫린 벽, 그 너머 어두운 터널
// 피스톤·셔터·열차처럼 움직이는 것은 각자 모듈에 있다.

const WALL_TOP = 20;
const FIN_H = 1.2;     // 칸막이 높이: 이보다 높으면 먼 구역 안 사람이 칸막이에 가려진다
export const PORTAL_H = 3.6;  // 터널 입구 높이 (열차 높이보다 높게)
const TUNNEL_LEN = 100;
const EXTEND = 9;             // 통로 아래 끝 너머로 이어지는 길이 (화면 밖이라 끊긴 곳이 안 보이게)
const GROOVE_IN = 1.25;       // 레일 홈 안쪽 x
const GROOVE_OUT = 1.55;      // 레일 홈 바깥쪽 x

/** 캔버스 텍스처 위에 덧그린다 (기존 녹슨 금속 무늬를 바탕으로 씀) */
function paintOver(tex, draw) {
  const ctx = tex.image.getContext('2d');
  draw(ctx, tex.image.width);
  tex.needsUpdate = true;
  return tex;
}

/** 바닥판: 열차 방향으로 길게 긁힌 자국 + 판 이음매 */
function makeFloorTexture(seed, base) {
  return paintOver(makeRustMetalTexture({ seed, base }), (ctx, s) => {
    let r = seed * 7919;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 140; i++) {
      ctx.strokeStyle = rnd() < 0.55 ? 'rgba(175,165,145,0.13)' : 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 0.6 + rnd() * 1.4;
      const x = rnd() * s;
      const y = rnd() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 3, y + 20 + rnd() * 120);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(8,7,6,0.85)';
    ctx.fillRect(0, 0, s, 3);
    ctx.fillStyle = 'rgba(160,150,130,0.22)';
    ctx.fillRect(0, 3, s, 1);
    for (let x = s / 8; x < s; x += s / 4) {
      ctx.fillStyle = '#1c1a17';
      ctx.beginPath();
      ctx.arc(x, 9, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(150,140,120,0.5)';
      ctx.beginPath();
      ctx.arc(x - 0.6, 8.4, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** 벽 판: 세로 이음매와 리벳 줄 */
function makeWallTexture(seed) {
  return paintOver(makeRustMetalTexture({ size: 256, seed, base: [82, 74, 64] }), (ctx, s) => {
    ctx.fillStyle = 'rgba(10,9,8,0.75)';
    ctx.fillRect(0, 0, 4, s);
    ctx.fillRect(0, 0, s, 3);
    ctx.fillStyle = 'rgba(170,160,140,0.18)';
    ctx.fillRect(4, 0, 1, s);
    for (let y = 10; y < s; y += 18) {
      for (const x of [12, s - 10]) {
        ctx.fillStyle = 'rgba(20,18,16,0.9)';
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(160,150,130,0.35)';
        ctx.fillRect(x - 1.5, y - 1.5, 1.4, 1.4);
      }
    }
    // 아래로 흘러내린 녹
    let r = seed * 48271;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const x = rnd() * s;
      const y0 = rnd() * s * 0.6;
      const len = 30 + rnd() * 120;
      const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
      g.addColorStop(0, `rgba(120,58,22,${0.15 + rnd() * 0.3})`);
      g.addColorStop(1, 'rgba(120,58,22,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y0, 2 + rnd() * 6, len);
    }
  });
}

export function createCorridor(layout) {
  const group = new THREE.Group();
  const disposables = [];
  const keep = (...items) => {
    disposables.push(...items);
    return items[0];
  };
  const { halfW, zTop, zBottom, alcoveDepth, alcoveWidth } = layout;
  const wallX = halfW + alcoveDepth;
  const zFar = zTop - TUNNEL_LEN;
  const zNear = zBottom + EXTEND;

  const box = (mat, [w, h, d], [x, y, z], { cast = false, receive = true } = {}) => {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = receive;
    group.add(m);
    return m;
  };
  const std = (opts) => keep(new THREE.MeshStandardMaterial(opts));
  const rep = (tex, rx, ry) => keep(withRepeat(tex, rx, ry));

  // ---- 텍스처와 재질 ----
  const floorTex = keep(makeFloorTexture(3, [74, 63, 52]));
  const sideTex = keep(makeFloorTexture(8, [64, 64, 60]));
  const wallTex = keep(makeWallTexture(21));
  const darkMetalTex = keep(makeRustMetalTexture({ seed: 44, base: [48, 45, 41] }));
  const plateTex = keep(makeTilePlateTexture({ seed: 9 }));
  const hazardTex = keep(makeHazardTexture({ seed: 5 }));
  const tunnelTex = keep(makeConcreteTexture({ seed: 61, base: [52, 50, 46], stainCount: 40, crackCount: 10 }));

  const len = zNear - zFar;
  const midZ = (zNear + zFar) / 2;
  const floorMat = std({ map: rep(floorTex, 1, len / 2), roughness: 0.8, metalness: 0.45 });
  const sideMat = std({ map: rep(sideTex, 1, len / 2), roughness: 0.75, metalness: 0.5 });
  const grooveMat = std({ color: 0x0c0b0a, roughness: 1 });
  const railMat = std({ map: rep(darkMetalTex, 1, len / 3), roughness: 0.45, metalness: 0.8, color: 0x9a948a });
  const wallMat = std({ map: rep(wallTex, (zNear - zTop) / 2, WALL_TOP / 4), roughness: 0.85, metalness: 0.35 });
  const endWallMat = std({ map: rep(wallTex, 3, WALL_TOP / 4), roughness: 0.85, metalness: 0.35 });
  const ribMat = std({ map: rep(darkMetalTex, 1, 6), roughness: 0.7, metalness: 0.55 });
  const finMat = std({ map: rep(darkMetalTex, 1, 1), roughness: 0.75, metalness: 0.5, color: 0xb0a898 });
  const plateMat = std({ map: plateTex, roughness: 0.6, metalness: 0.55 });
  const tunnelMat = std({ map: rep(tunnelTex, TUNNEL_LEN / 6, 1), roughness: 0.95, color: 0x8a8680 });
  const pipeMat = std({ map: rep(darkMetalTex, 4, 1), roughness: 0.55, metalness: 0.7, color: 0xa69a88 });
  const cableMat = std({ color: 0x111213, roughness: 0.6 });
  const boxMat = std({ map: rep(darkMetalTex, 1, 1), roughness: 0.6, metalness: 0.5, color: 0x8c8f84 });

  // ---- 바닥 (터널 안쪽부터 화면 아래 너머까지 한 판) ----
  box(floorMat, [GROOVE_IN * 2, 0.4, len], [0, -0.2, midZ]);
  for (const s of [-1, 1]) {
    const gx = s * (GROOVE_IN + GROOVE_OUT) / 2;
    box(grooveMat, [GROOVE_OUT - GROOVE_IN, 0.4, len], [gx, -0.42, midZ]);
    box(railMat, [0.09, 0.16, len], [gx, -0.14, midZ]); // 홈 안의 레일
    box(sideMat, [halfW - GROOVE_OUT, 0.4, len], [s * (GROOVE_OUT + halfW) / 2, -0.2, midZ]);
  }

  // ---- 대피 구역 바닥판, 입구 경고선, 칸막이 ----
  const hw = alcoveWidth / 2;
  const threshMat = std({ map: rep(hazardTex, alcoveWidth * 2, 0.25), roughness: 0.7 });
  for (const a of layout.alcoves) {
    const cx = a.side * (halfW + alcoveDepth / 2);
    box(plateMat, [alcoveDepth, 0.2, alcoveWidth], [cx, -0.1, a.z]);
    const th = new THREE.Mesh(keep(new THREE.PlaneGeometry(alcoveWidth, 0.12)), threshMat);
    th.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    th.position.set(a.side * (halfW + 0.07), 0.004, a.z);
    group.add(th);
  }
  // 칸막이: 구역 사이, 그리고 양 끝 (아래 끝은 화면 밖까지)
  const rows = layout.alcoves.filter((a) => a.side > 0).map((a) => a.z);
  const spans = [[zTop, rows[0] - hw]];
  for (let k = 0; k < rows.length - 1; k++) spans.push([rows[k] + hw, rows[k + 1] - hw]);
  spans.push([rows[rows.length - 1] + hw, zNear]);
  const edgeMats = new Map(); // 길이마다 경고 띠 반복 횟수가 달라서 따로 만든다
  const edgeMat = (l) => {
    const key = l.toFixed(2);
    if (!edgeMats.has(key)) edgeMats.set(key, std({ map: rep(hazardTex, 0.35, l * 2.5), roughness: 0.7 }));
    return edgeMats.get(key);
  };
  for (const s of [-1, 1]) {
    for (const [z0, z1] of spans) {
      const cx = s * (halfW + alcoveDepth / 2);
      box(finMat, [alcoveDepth, FIN_H, z1 - z0], [cx, FIN_H / 2, (z0 + z1) / 2], { cast: true });
      // 통로 쪽 윗모서리에 경고 띠
      const edge = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.16, z1 - z0)), edgeMat(z1 - z0));
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(s * (halfW + 0.08), FIN_H + 0.003, (z0 + z1) / 2);
      edge.receiveShadow = true;
      group.add(edge);
    }
  }

  // ---- 양쪽 높은 벽 ----
  // 구역 위쪽은 피스톤이 오르내리는 길이라 비워 두고, 장식은 구역 사이(gaps)에만 붙인다.
  const wallLen = zNear - zTop;
  const gaps = spans.slice(1, -1);
  const unitGeo = new Map();
  const column = (mat, r, x, z, y0, y1) => {
    if (!unitGeo.has(r)) unitGeo.set(r, keep(new THREE.CylinderGeometry(r, r, 1, 10)));
    const m = new THREE.Mesh(unitGeo.get(r), mat);
    m.scale.y = y1 - y0;
    m.position.set(x, (y0 + y1) / 2, z);
    m.castShadow = true;
    group.add(m);
  };
  for (const s of [-1, 1]) {
    box(wallMat, [0.5, WALL_TOP, wallLen], [s * (wallX + 0.25), WALL_TOP / 2, (zTop + zNear) / 2]);
    // 칸막이 위로 솟은 기둥
    for (const [z0, z1] of spans.slice(0, -1)) {
      const zc = (z0 + z1) / 2;
      box(ribMat, [0.34, WALL_TOP - FIN_H, 0.42], [s * (wallX - 0.17), FIN_H + (WALL_TOP - FIN_H) / 2, zc]);
      box(ribMat, [0.12, WALL_TOP - FIN_H, 0.7], [s * (wallX - 0.06), FIN_H + (WALL_TOP - FIN_H) / 2, zc]);
    }
    // 기둥 양옆 세로 배관, 기둥 앞에 늘어뜨린 검은 케이블 다발
    gaps.forEach(([z0, z1], k) => {
      const zc = (z0 + z1) / 2;
      column(pipeMat, 0.13, s * (wallX - 0.2), zc + 0.72, FIN_H, WALL_TOP);
      column(pipeMat, 0.08, s * (wallX - 0.14), zc - 0.66, FIN_H, WALL_TOP);
      if ((k + (s > 0 ? 1 : 0)) % 2 === 0) {
        for (const [dz, y0] of [[-0.09, 1.6], [0, 2.3], [0.08, 1.9]]) column(cableMat, 0.035, s * (wallX - 0.38), zc + dz, y0, WALL_TOP);
      }
    });
  }

  // 전기함 몇 개 (구역 사이 기둥에 붙음)
  for (const [s, k, y] of [[-1, 0, 3.4], [1, 1, 4.2], [-1, 2, 2.6], [1, 2, 3.0]]) {
    const [z0, z1] = gaps[k % gaps.length];
    box(boxMat, [0.28, 0.62, 0.5], [s * (wallX - 0.48), y, (z0 + z1) / 2], { cast: true });
  }

  // 벽 작업등: 빛 웅덩이가 생겨 녹슨 벽이 드러난다
  const warm = 0xffdcb4;
  const bulbMat = keep(new THREE.MeshBasicMaterial({ color: warm, toneMapped: false }));
  const lampCageMat = std({ color: 0x1a1918, roughness: 0.6, metalness: 0.6 });
  group.add(new THREE.HemisphereLight(0xd9d3c8, 0x35302a, 1.4));
  gaps.forEach(([z0, z1], k) => {
    const s = k % 2 ? 1 : -1;
    const z = (z0 + z1) / 2;
    box(lampCageMat, [0.22, 0.5, 0.42], [s * (wallX - 0.47), 8.0, z], { receive: false });
    const bulb = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, 0.34, 0.28)), bulbMat);
    bulb.position.set(s * (wallX - 0.6), 8.0, z);
    group.add(bulb);
    const light = new THREE.PointLight(warm, 26, 18, 1.5);
    light.position.set(s * (wallX - 0.9), 7.8, z);
    group.add(light);
  });

  // 왼쪽 벽 아래쪽 구역 사이의 큰 스프링 (스크린샷의 코일)
  const [sz0, sz1] = gaps[gaps.length - 1];
  const springX = -(wallX - 0.2);
  const springZ = (sz0 + sz1) / 2 + 0.72; // 굵은 세로 배관을 감쌈
  const helixPts = [];
  for (let i = 0; i <= 220; i++) {
    const a = (i / 220) * Math.PI * 2 * 14;
    helixPts.push(new THREE.Vector3(springX + Math.cos(a) * 0.34, 2.0 + (i / 220) * 4.2, springZ + Math.sin(a) * 0.34));
  }
  const spring = new THREE.Mesh(
    keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helixPts), 600, 0.06, 6, false)),
    pipeMat,
  );
  spring.castShadow = true;
  group.add(spring);

  // ---- 위쪽 끝벽 (터널 입구 둘레) ----
  const endZ = zTop - 0.25;
  box(endWallMat, [wallX - halfW + 0.5, WALL_TOP, 0.5], [-(halfW + wallX + 0.5) / 2, WALL_TOP / 2, endZ]);
  box(endWallMat, [wallX - halfW + 0.5, WALL_TOP, 0.5], [(halfW + wallX + 0.5) / 2, WALL_TOP / 2, endZ]);
  box(endWallMat, [halfW * 2, WALL_TOP - PORTAL_H, 0.5], [0, PORTAL_H + (WALL_TOP - PORTAL_H) / 2, endZ]);

  // ---- 터널: 깊어질수록 안개에 묻힌다 ----
  const tz = (zFar + zTop - 0.5) / 2;
  const tl = zTop - 0.5 - zFar;
  for (const s of [-1, 1]) box(tunnelMat, [0.5, PORTAL_H, tl], [s * (halfW + 0.25), PORTAL_H / 2, tz]);
  box(tunnelMat, [halfW * 2 + 1, 0.5, tl], [0, PORTAL_H + 0.25, tz]);
  // 일정 간격의 틀과 주황 등: 원근에 따라 작아지며 어둠에 묻혀 깊이감을 만든다
  const lampMat = keep(new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
  const frameMat = std({ color: 0x1d1c1a, roughness: 0.8, metalness: 0.4 });
  for (let z = zTop - 4; z > zFar + 4; z -= 5) {
    // 열차 폭(통로보다 조금 좁음)과 겹치지 않게 벽에 바짝 붙인다
    for (const s of [-1, 1]) box(frameMat, [0.06, PORTAL_H, 0.3], [s * (halfW - 0.03), PORTAL_H / 2, z], { receive: false });
    box(frameMat, [halfW * 2, 0.22, 0.3], [0, PORTAL_H - 0.11, z], { receive: false });
    const lamp = new THREE.Mesh(keep(new THREE.BoxGeometry(0.05, 0.16, 0.3)), lampMat);
    lamp.position.set((Math.round(z) % 2 ? -1 : 1) * (halfW - 0.025), 2.6, z + 1.6);
    group.add(lamp);
  }

  group.userData.dispose = () => {
    group.removeFromParent();
    for (const d of disposables) d.dispose();
  };
  return group;
}
