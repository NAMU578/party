import * as THREE from 'three';

// 벨트 위 물건 모형 (로우폴리). 종류·모양마다 한 번만 만들고 복제해서 쓴다 (형상·재질 공유).
// 기준: 밑면이 y=0, 앞면이 +z (작업대에서는 작업자 쪽). 폭은 벨트 한 칸에 들어가게 0.72 이하.
// 장치: 라디오, 브라운관 TV, 전화기, 카메라, 타자기 / 예술품: 액자 그림, 흉상, 도자기

const COLORS = {
  radio: [0x7a4a2a, 0x9e2f2a, 0x2f6f6a, 0xcdbb94],
  tv: [0x3a3a38, 0x8a7a5a, 0x6a3f2a, 0x2e4a5a],
  phone: [0x161616, 0x8f1f1f, 0xd9d2c0, 0x2f5f3a],
  camera: [0x1a1a1a, 0x4a3a24, 0x6a6a68, 0x22304a],
  typewriter: [0x1c2a22, 0x2a2a2a, 0x5a1f1f, 0x3a4a5a],
  bust: [0xe6e1d6, 0x8a5a2a, 0xb0704a, 0x2e2e32],
};
const UP = [Math.PI / 2, 0, 0]; // 원기둥을 앞(+z)으로 눕힘

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 액자 그림 4가지: 풍경, 면 분할 추상화, 초상화, 소용돌이 밤하늘
const PAINTINGS = [
  (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.7);
    sky.addColorStop(0, '#3f78c0');
    sky.addColorStop(1, '#d6e6ee');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f7d15a';
    g.beginPath();
    g.arc(w * 0.76, h * 0.26, h * 0.11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#6f9a45';
    g.beginPath();
    g.moveTo(0, h * 0.72);
    g.quadraticCurveTo(w * 0.3, h * 0.45, w * 0.62, h * 0.7);
    g.quadraticCurveTo(w * 0.85, h * 0.58, w, h * 0.66);
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.fill();
    g.fillStyle = '#3f6a2c';
    g.fillRect(0, h * 0.86, w, h * 0.14);
    g.fillStyle = '#5a3a22';
    g.fillRect(w * 0.22, h * 0.48, w * 0.04, h * 0.26);
    g.fillStyle = '#2f5a24';
    g.beginPath();
    g.arc(w * 0.24, h * 0.44, h * 0.13, 0, Math.PI * 2);
    g.fill();
  },
  (g, w, h) => {
    g.fillStyle = '#f2eee2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c62f2a';
    g.fillRect(0, 0, w * 0.46, h * 0.58);
    g.fillStyle = '#1d4c9c';
    g.fillRect(w * 0.7, h * 0.68, w * 0.3, h * 0.32);
    g.fillStyle = '#f0c22e';
    g.fillRect(w * 0.46, h * 0.84, w * 0.24, h * 0.16);
    g.fillStyle = '#111';
    for (const x of [0.46, 0.7]) g.fillRect(w * x - 3, 0, 6, h);
    for (const y of [0.58, 0.84]) g.fillRect(0, h * y - 3, w, 6);
  },
  (g, w, h) => {
    const bg = g.createRadialGradient(w * 0.5, h * 0.4, 5, w * 0.5, h * 0.5, w * 0.7);
    bg.addColorStop(0, '#6b5a3a');
    bg.addColorStop(1, '#231a10');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a2018';
    g.beginPath();
    g.ellipse(w * 0.5, h * 1.02, w * 0.36, h * 0.34, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1c140e';
    g.beginPath();
    g.ellipse(w * 0.5, h * 0.42, w * 0.17, h * 0.27, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d9b28a';
    g.beginPath();
    g.ellipse(w * 0.5, h * 0.45, w * 0.12, h * 0.2, 0, 0, Math.PI * 2);
    g.fill();
  },
  (g, w, h) => {
    g.fillStyle = '#1b2f6a';
    g.fillRect(0, 0, w, h);
    g.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = i % 2 ? '#7fa6e0' : '#e9d36a';
      g.beginPath();
      g.arc(w * (0.12 + 0.09 * i), h * (0.25 + 0.05 * (i % 3)), 6 + (i % 3) * 5, 0, Math.PI * 1.5);
      g.stroke();
    }
    g.fillStyle = '#f5e27a';
    g.beginPath();
    g.arc(w * 0.84, h * 0.2, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#25324a';
    g.fillRect(0, h * 0.82, w, h * 0.18);
    g.fillStyle = '#0d1a10';
    g.beginPath();
    g.moveTo(w * 0.18, h);
    g.quadraticCurveTo(w * 0.12, h * 0.5, w * 0.23, h * 0.28);
    g.quadraticCurveTo(w * 0.3, h * 0.6, w * 0.29, h);
    g.fill();
  },
];

// 도자기 무늬 4가지 (가로가 둘레 방향): 청화, 청자, 붉은 토기, 남색 금테
const GLAZES = [
  (g, w, h) => {
    g.fillStyle = '#eef0f2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a4f9a';
    g.fillRect(0, h * 0.12, w, 3);
    g.fillRect(0, h * 0.82, w, 3);
    for (let x = 8; x < w; x += 21) {
      g.beginPath();
      g.arc(x, h * 0.47, 6, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x - 1, h * 0.47, 2, 12);
    }
  },
  (g, w, h) => {
    g.fillStyle = '#9fbfa6';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,62,46,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const x = (i * 37) % w;
      const y = (i * 23) % h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 9, y + 5);
      g.lineTo(x + 14, y - 3);
      g.stroke();
    }
  },
  (g, w, h) => {
    g.fillStyle = '#c4682f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1210';
    g.fillRect(0, h * 0.38, w, h * 0.24);
    g.strokeStyle = '#c4682f';
    g.lineWidth = 2;
    for (let x = 0; x < w; x += 16) {
      g.beginPath();
      g.moveTo(x + 2, h * 0.58);
      g.lineTo(x + 2, h * 0.42);
      g.lineTo(x + 12, h * 0.42);
      g.lineTo(x + 12, h * 0.52);
      g.lineTo(x + 7, h * 0.52);
      g.stroke();
    }
  },
  (g, w, h) => {
    g.fillStyle = '#1d2f6e';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#d6b04a';
    for (const y of [0.1, 0.18, 0.78, 0.86]) g.fillRect(0, h * y, w, 2);
    for (let x = 6; x < w; x += 16) g.fillRect(x, h * 0.45, 4, 4);
  },
];

const BUILD = {
  radio(k, look) {
    const body = k.mat(COLORS.radio[look], { roughness: 0.75 });
    const dark = k.mat(0x151515, { roughness: 0.9 });
    const cream = k.mat(0xe8dcb8, { roughness: 0.5 });
    const metal = k.mat(0xb9b9b4, { roughness: 0.3, metalness: 0.8 });
    k.add(new THREE.BoxGeometry(0.62, 0.38, 0.24), body, [0, 0.19, 0]);
    k.add(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 14), dark, [-0.14, 0.19, 0.12], UP); // 스피커
    k.add(new THREE.BoxGeometry(0.2, 0.09, 0.02), cream, [0.15, 0.26, 0.12]); // 주파수 창
    for (const x of [0.1, 0.21]) k.add(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10), metal, [x, 0.11, 0.13], UP);
    k.add(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 5), metal, [0.34, 0.63, -0.05], [0, 0, -0.45]); // 안테나
    return k.group;
  },
  tv(k, look) {
    const body = k.mat(COLORS.tv[look], { roughness: 0.7 });
    const screen = k.mat(0x1d2a30, { roughness: 0.2, metalness: 0.3, emissive: 0x16303a, emissiveIntensity: 1 });
    const dark = k.mat(0x111111);
    const metal = k.mat(0xb9b9b4, { roughness: 0.3, metalness: 0.8 });
    k.add(new THREE.BoxGeometry(0.62, 0.48, 0.44), body, [0, 0.27, -0.02]);
    k.add(new THREE.BoxGeometry(0.42, 0.34, 0.04), screen, [-0.06, 0.28, 0.2]); // 화면
    k.add(new THREE.BoxGeometry(0.1, 0.1, 0.02), dark, [0.22, 0.36, 0.205]);
    k.add(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8), metal, [0.22, 0.2, 0.21], UP);
    k.add(new THREE.BoxGeometry(0.5, 0.04, 0.36), dark, [0, 0.02, -0.02]); // 받침
    for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.008, 0.008, 0.42, 5), metal, [s * 0.1, 0.69, -0.05], [0, 0, -s * 0.5]); // 토끼 귀 안테나
    return k.group;
  },
  phone(k, look) {
    const body = k.mat(COLORS.phone[look], { roughness: 0.35 });
    const face = k.mat(0xe9e4d4, { roughness: 0.5 });
    const dark = k.mat(0x1a1a1a);
    k.add(new THREE.BoxGeometry(0.46, 0.14, 0.38), body, [0, 0.07, 0]);
    k.add(new THREE.BoxGeometry(0.4, 0.12, 0.26), body, [0, 0.18, -0.03], [-0.3, 0, 0]); // 경사진 윗면
    k.add(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16), face, [0, 0.2, 0.1], [Math.PI / 2 - 0.3, 0, 0]); // 다이얼
    k.add(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 10), dark, [0, 0.21, 0.115], [Math.PI / 2 - 0.3, 0, 0]);
    k.add(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), body, [0, 0.33, -0.08], [0, 0, Math.PI / 2]); // 수화기
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.11, 0.07, 0.12), body, [s * 0.2, 0.3, -0.08]);
    return k.group;
  },
  camera(k, look) {
    const body = k.mat(COLORS.camera[look], { roughness: 0.45 });
    const metal = k.mat(0xc9c9c4, { roughness: 0.25, metalness: 0.85 });
    const glass = k.mat(0x0d1a2a, { roughness: 0.05, metalness: 0.6, emissive: 0x0a1830, emissiveIntensity: 1 });
    k.add(new THREE.BoxGeometry(0.44, 0.26, 0.2), body, [0, 0.13, 0]);
    k.add(new THREE.BoxGeometry(0.44, 0.05, 0.2), metal, [0, 0.285, 0]); // 윗판
    k.add(new THREE.BoxGeometry(0.12, 0.09, 0.14), metal, [0, 0.35, 0]); // 뷰파인더
    k.add(new THREE.CylinderGeometry(0.1, 0.11, 0.16, 14), body, [0.02, 0.14, 0.18], UP); // 렌즈 통
    k.add(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 14), glass, [0.02, 0.14, 0.265], UP);
    k.add(new THREE.BoxGeometry(0.1, 0.06, 0.08), metal, [-0.15, 0.34, 0.02]); // 플래시
    return k.group;
  },
  typewriter(k, look) {
    const body = k.mat(COLORS.typewriter[look], { roughness: 0.4, metalness: 0.2 });
    const keys = k.mat(0xe8e2cf, { roughness: 0.5 });
    const dark = k.mat(0x121212, { roughness: 0.6 });
    const paper = k.mat(0xf4f1e6, { roughness: 0.9, side: THREE.DoubleSide });
    k.add(new THREE.BoxGeometry(0.64, 0.12, 0.44), body, [0, 0.06, 0]);
    k.add(new THREE.BoxGeometry(0.62, 0.16, 0.2), body, [0, 0.2, -0.1]);
    for (let r = 0; r < 3; r++) k.add(new THREE.BoxGeometry(0.5, 0.03, 0.055), keys, [0, 0.135 + r * 0.035, 0.17 - r * 0.07]); // 자판 3줄
    k.add(new THREE.CylinderGeometry(0.055, 0.055, 0.7, 10), dark, [0, 0.32, -0.13], [0, 0, Math.PI / 2]); // 롤러
    k.add(new THREE.PlaneGeometry(0.34, 0.28), paper, [0, 0.47, -0.16], [-0.2, 0, 0]); // 종이
    return k.group;
  },
  painting(k, look) {
    const frame = k.mat(0xb08a3a, { roughness: 0.35, metalness: 0.6 });
    const back = k.mat(0x5a4330, { roughness: 0.9 });
    const picture = k.keep(new THREE.MeshStandardMaterial({ map: k.keep(canvasTexture(128, 96, PAINTINGS[look])), roughness: 0.85 }));
    const W = 0.72;
    const H = 0.56;
    const T = 0.07;
    const D = 0.05;
    const tilt = new THREE.Group(); // 뒤로 살짝 기대 선 액자
    tilt.position.y = 0.03;
    tilt.rotation.x = -0.22;
    k.group.add(tilt);
    k.add(new THREE.BoxGeometry(W, T, D), frame, [0, H - T / 2, 0], null, tilt);
    k.add(new THREE.BoxGeometry(W, T, D), frame, [0, T / 2, 0], null, tilt);
    k.add(new THREE.BoxGeometry(T, H - 2 * T, D), frame, [-(W - T) / 2, H / 2, 0], null, tilt);
    k.add(new THREE.BoxGeometry(T, H - 2 * T, D), frame, [(W - T) / 2, H / 2, 0], null, tilt);
    k.add(new THREE.PlaneGeometry(W - 2 * T, H - 2 * T), picture, [0, H / 2, 0.005], null, tilt);
    k.add(new THREE.BoxGeometry(W - 2 * T, H - 2 * T, 0.01), back, [0, H / 2, -0.015], null, tilt);
    k.add(new THREE.BoxGeometry(0.06, 0.4, 0.04), back, [0, 0.18, -0.18], [0.45, 0, 0]); // 받침대
    return k.group;
  },
  bust(k, look) {
    const stone = k.mat(COLORS.bust[look], look === 1 ? { roughness: 0.35, metalness: 0.7 } : { roughness: 0.55 });
    const base = k.mat(0x3a3530, { roughness: 0.7 });
    k.add(new THREE.BoxGeometry(0.34, 0.1, 0.3), base, [0, 0.05, 0]); // 받침
    k.add(new THREE.CylinderGeometry(0.08, 0.1, 0.06, 10), stone, [0, 0.13, 0]);
    k.add(new THREE.SphereGeometry(0.2, 10, 6), stone, [0, 0.25, 0]).scale.set(1.25, 0.6, 0.7); // 어깨
    k.add(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 8), stone, [0, 0.39, 0]);
    k.add(new THREE.IcosahedronGeometry(0.12, 1), stone, [0, 0.53, 0.01]).scale.set(0.95, 1.15, 1);
    k.add(new THREE.BoxGeometry(0.035, 0.06, 0.05), stone, [0, 0.52, 0.125]); // 코
    return k.group;
  },
  vase(k, look) {
    const glaze = k.keep(new THREE.MeshStandardMaterial({ map: k.keep(canvasTexture(128, 64, GLAZES[look])), roughness: 0.25 }));
    const profile = [
      [0.001, 0], [0.12, 0], [0.15, 0.03], [0.21, 0.14], [0.22, 0.24], [0.17, 0.36],
      [0.09, 0.45], [0.075, 0.52], [0.11, 0.58], [0.09, 0.585],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    k.add(new THREE.LatheGeometry(profile, 14), glaze, [0, 0, 0]);
    return k.group;
  },
};

export class ItemModels {
  constructor() {
    this.templates = new Map(); // 'kind:look' → 원본 모형
    this.disposables = [];
  }

  /** item: { kind, look } → 새 모형. 형상·재질은 원본과 공유하므로 따로 dispose하지 않는다 */
  create(item) {
    const key = `${item.kind}:${item.look}`;
    let tpl = this.templates.get(key);
    if (!tpl) {
      tpl = BUILD[item.kind](this._kit(), item.look);
      this.templates.set(key, tpl);
    }
    return tpl.clone();
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.templates.clear();
  }

  _kit() {
    const keep = (x) => {
      this.disposables.push(x);
      return x;
    };
    const group = new THREE.Group();
    return {
      group,
      keep,
      mat: (color, opts = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true, ...opts })),
      add(geo, material, [x, y, z], rot, parent = group) {
        const mesh = new THREE.Mesh(keep(geo), material);
        mesh.position.set(x, y, z);
        if (rot) mesh.rotation.set(...rot);
        mesh.castShadow = true;
        parent.add(mesh);
        return mesh;
      },
    };
  }
}
