import * as THREE from 'three';
import { createRng } from '../../core/random.js';

// 식기: 접시(파란 무늬 도자기)와 그 위의 콩 더미, 포크와 포크에 꽂힌 콩.
// 콩 더미는 아래층부터 순서대로 놓아서, 보이는 개수(count)를 줄이면 꼭대기부터 사라진다.

export const PEA_R = 0.018;
export const PLATE_R = 0.31;
const PEA_COLORS = [0x4f9a2e, 0x5aa834, 0x468c29, 0x62b03d, 0x3f7f24];

// 포크 (손에 쥔 곳이 원점, 날이 -y 방향). 콩은 날 끝부터 위로 쌓인다.
const FORK_TIP = -0.235;
const FORK_SLOTS = [];
for (let row = 0; row < 5; row++) {
  const y = FORK_TIP + 0.02 + row * 0.028;
  const ring = row % 2 ? [[-0.017, 0.012], [0.017, 0.012], [0, -0.016]] : [[-0.033, -0.004], [0, 0.004], [0.033, -0.004]];
  for (const [x, z] of ring) FORK_SLOTS.push([x, y, z]);
}
export const FORK_SLOT_COUNT = FORK_SLOTS.length;

/** 흰 도자기에 파란 무늬. 회전체(Lathe)의 v = 단면을 따라간 비율 (0: 가운데, 위쪽 면 → 가장자리 → 바닥) */
function makePlateTexture() {
  const W = 512;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const y = (v) => (1 - v) * H; // 캔버스 위쪽이 v = 1
  g.fillStyle = '#e8e4d8';
  g.fillRect(0, 0, W, H);
  const blue = '#2c4d97';
  g.strokeStyle = blue;
  g.lineWidth = 2;
  for (const v of [0.2, 0.33, 0.55]) {
    g.beginPath();
    g.moveTo(0, y(v));
    g.lineTo(W, y(v));
    g.stroke();
  }
  // 가장자리 띠: 꽃과 잎을 반복 (이음매가 맞도록 16번)
  const rng = createRng(41);
  for (let i = 0; i < 16; i++) {
    const cx = (i + 0.5) * (W / 16);
    const cy = y(0.44);
    g.fillStyle = blue;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 4.5, 2.6, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#e8e4d8';
    g.beginPath();
    g.arc(cx, cy, 2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = blue;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx + 9, cy);
    g.quadraticCurveTo(cx + 16, cy - 6 + rng() * 4, cx + W / 32, cy + 2);
    g.stroke();
  }
  // 가운데 쪽 잔무늬
  g.fillStyle = 'rgba(44,77,151,0.55)';
  for (let i = 0; i < 40; i++) g.fillRect(rng() * W, y(0.22 + rng() * 0.09), 2, 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/**
 * 콩 더미 위치 (접시 기준). 아래층부터 순서대로, 같은 층 안에서는 무작위 순서.
 * 개수가 많으면 더미 크기를 키워서 모두 들어가게 한다.
 */
function moundPositions(count, seed) {
  const rng = createRng(seed);
  const r = PEA_R;
  const step = r * 2 * 0.97;
  const dy = r * 1.6;
  for (let s = 0.6; ; s *= 1.05) {
    const baseR = 0.2 * s;
    const height = 0.12 * s;
    const pts = [];
    for (let k = 0; ; k++) {
      const R = baseR * Math.sqrt(Math.max(0, 1 - (k * dy) / height));
      if (R < r * 0.8) break;
      const ox = rng() * step;
      const oz = rng() * step;
      for (let row = -14; row <= 14; row++) {
        for (let col = -14; col <= 14; col++) {
          const x = col * step + (row & 1) * (step / 2) + ox - step / 2;
          const z = row * step * 0.866 + oz - step / 2;
          if (Math.hypot(x, z) > R - r * 0.5) continue;
          const j = r * 0.18; // 살짝 흐트러지게
          pts.push({ x: x + (rng() - 0.5) * j, y: 0.006 + r + k * dy + (rng() - 0.5) * j, z: z + (rng() - 0.5) * j, order: k + rng() });
        }
      }
    }
    if (pts.length >= count || s > 4) return pts.sort((a, b) => a.order - b.order).slice(0, count);
  }
}

/** 모든 접시·포크가 함께 쓰는 형상·재질 */
export function createTableware() {
  const disposables = [];
  const keep = (x) => {
    disposables.push(x);
    return x;
  };
  const profile = [
    [0.0, 0.006], [0.19, 0.006], [0.22, 0.01], [0.27, 0.024], [0.3, 0.033], [0.312, 0.032],
    [0.314, 0.026], [0.28, 0.016], [0.2, 0.002], [0.0, 0.0],
  ].map(([x, yy]) => new THREE.Vector2(x, yy));
  const mounds = new Map();
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0xb9bdc2, roughness: 0.32, metalness: 0.85 }));
  return {
    plateGeo: keep(new THREE.LatheGeometry(profile, 40)),
    plateMat: keep(new THREE.MeshStandardMaterial({ map: keep(makePlateTexture()), roughness: 0.25, metalness: 0.05 })),
    peaGeo: keep(new THREE.IcosahedronGeometry(PEA_R, 1)),
    peaMat: keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42 })),
    steel,
    handleGeo: keep(new THREE.BoxGeometry(0.026, 0.2, 0.012).translate(0, -0.02, 0)),
    neckGeo: keep(new THREE.BoxGeometry(0.064, 0.03, 0.012).translate(0, -0.135, 0)),
    tineGeo: keep(new THREE.BoxGeometry(0.008, 0.085, 0.008).translate(0, -0.1925, 0)),
    mound(count) {
      if (!mounds.has(count)) mounds.set(count, moundPositions(count, 3));
      return mounds.get(count);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

function colorPeas(mesh, seed) {
  const rng = createRng(seed);
  const c = new THREE.Color();
  for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, c.setHex(PEA_COLORS[Math.floor(rng() * PEA_COLORS.length)]));
}

/** 접시와 콩 더미. setCount로 남은 콩 수만큼만 보여 준다 */
export class Plate {
  constructor(kit, count, seed) {
    this.group = new THREE.Group();
    this.group.rotation.y = createRng(seed)() * Math.PI * 2; // 접시마다 더미 모양이 달라 보이게
    const plate = new THREE.Mesh(kit.plateGeo, kit.plateMat);
    plate.receiveShadow = true;
    const spots = kit.mound(count);
    this.peas = new THREE.InstancedMesh(kit.peaGeo, kit.peaMat, Math.max(1, spots.length));
    const m = new THREE.Matrix4();
    spots.forEach((p, i) => this.peas.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    colorPeas(this.peas, seed);
    this.peas.receiveShadow = true;
    this.max = spots.length;
    this.group.add(plate, this.peas);
    this.setCount(count);
  }

  setCount(n) {
    this.peas.count = Math.max(0, Math.min(this.max, n));
  }

  dispose() {
    this.group.removeFromParent();
    this.peas.dispose();
  }
}

/** 포크와 꽂힌 콩. 손에 쥔 곳이 원점이고 날이 -y 방향 */
export class Fork {
  constructor(kit, seed) {
    this.group = new THREE.Group();
    const parts = [new THREE.Mesh(kit.handleGeo, kit.steel), new THREE.Mesh(kit.neckGeo, kit.steel)];
    for (const x of [-0.024, -0.008, 0.008, 0.024]) {
      const tine = new THREE.Mesh(kit.tineGeo, kit.steel);
      tine.position.x = x;
      parts.push(tine);
    }
    for (const p of parts) p.castShadow = true;
    this.peas = new THREE.InstancedMesh(kit.peaGeo, kit.peaMat, FORK_SLOT_COUNT);
    const m = new THREE.Matrix4();
    FORK_SLOTS.forEach(([x, y, z], i) => this.peas.setMatrixAt(i, m.makeTranslation(x, y, z)));
    colorPeas(this.peas, seed);
    this.group.add(...parts, this.peas);
    this.setCount(0);
  }

  setCount(n) {
    this.peas.count = Math.max(0, Math.min(FORK_SLOT_COUNT, n));
  }

  dispose() {
    this.group.removeFromParent();
    this.peas.dispose();
  }
}
