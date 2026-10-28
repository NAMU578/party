import * as THREE from 'three';

// 작업대 점수판: 앞뒤 양면 상자. 앞면은 소각로 쪽(다른 사람이 봄), 뒷면은 작업자 쪽.
// 숫자는 캔버스에 7세그먼트로 그리고, 값이 바뀔 때만 다시 그린다. null이면 꺼진 화면.

const W = 256;
const H = 128;
export const TINT = '#efe9d6';
export const TINT_DOOM = '#ff5236';
const SEGMENTS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];

function drawDigit(ctx, x, y, w, h, segs) {
  const t = w * 0.2; // 획 두께
  const g = t * 0.25; // 획 사이 틈
  const half = h / 2 - t / 2 - 2 * g;
  const rects = {
    a: [x + t / 2 + g, y, w - t - 2 * g, t],
    g: [x + t / 2 + g, y + h / 2 - t / 2, w - t - 2 * g, t],
    d: [x + t / 2 + g, y + h - t, w - t - 2 * g, t],
    f: [x, y + t / 2 + g, t, half],
    b: [x + w - t, y + t / 2 + g, t, half],
    e: [x, y + h / 2 + g, t, half],
    c: [x + w - t, y + h / 2 + g, t, half],
  };
  for (const s of segs) ctx.fillRect(...rects[s]);
}

function paint(ctx, value, tint) {
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#0b0d0c';
  ctx.fillRect(0, 0, W, H);
  const text = value == null ? '' : String(value).padStart(2, '0');
  const n = Math.max(2, text.length);
  const dw = 62;
  const dh = 96;
  const gap = 16;
  let x = (W - (n * dw + (n - 1) * gap)) / 2;
  const y = (H - dh) / 2;
  for (let i = 0; i < n; i++) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; // 꺼진 획
    drawDigit(ctx, x, y, dw, dh, SEGMENTS[8]);
    if (text[i]) {
      ctx.fillStyle = tint;
      ctx.shadowColor = tint;
      ctx.shadowBlur = 14;
      drawDigit(ctx, x, y, dw, dh, SEGMENTS[Number(text[i])]);
    }
    x += dw + gap;
  }
}

export class ScoreDisplay {
  /** body: 상자 재질, plane: 화면 크기의 PlaneGeometry (작업대끼리 공유) */
  constructor({ box, bodyMaterial, plane }) {
    this.group = new THREE.Group();
    this.group.add(new THREE.Mesh(box, bodyMaterial));
    this.faces = [-1, 1].map((side) => {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      const mesh = new THREE.Mesh(plane, mat);
      mesh.position.z = side * (box.parameters.depth / 2 + 0.003);
      if (side < 0) mesh.rotation.y = Math.PI; // 앞면은 -z(소각로 쪽)를 본다
      this.group.add(mesh);
      const face = { ctx: canvas.getContext('2d'), tex, mat, value: undefined, tint: undefined };
      this._paint(face, null, TINT);
      return face;
    });
  }

  /** front: 소각로 쪽 숫자, back: 작업자 쪽 숫자 (null이면 꺼짐) */
  set(front, back, tint = TINT) {
    this._paint(this.faces[0], front, tint);
    this._paint(this.faces[1], back, tint);
  }

  _paint(face, value, tint) {
    if (face.value === value && face.tint === tint) return;
    face.value = value;
    face.tint = tint;
    paint(face.ctx, value, tint);
    face.tex.needsUpdate = true;
  }

  dispose() {
    for (const f of this.faces) {
      f.tex.dispose();
      f.mat.dispose();
    }
  }
}
