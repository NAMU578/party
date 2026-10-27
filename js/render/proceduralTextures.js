import * as THREE from 'three';
import { createRng, randInt } from '../core/random.js';

// 외부 이미지 없이 캔버스에 직접 그려 만드는 텍스처들 (콘크리트, 금속, 화면).
// 시드를 고정해서 매번 같은 무늬가 나온다.

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function toTexture(canvas, repeat = [1, 1]) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8; // 렌더러가 지원 최대값으로 알아서 제한한다
  return tex;
}

/** 같은 그림을 쓰되 반복 횟수만 다른 텍스처 */
export function withRepeat(tex, rx, ry) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

/** 이음매 없이 반복되는 값 노이즈 */
function valueNoise(rng, cells) {
  const n = cells + 1;
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  for (let i = 0; i < n; i++) g[i * n + cells] = g[i * n];
  for (let i = 0; i < n; i++) g[cells * n + i] = g[i];
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const xi = Math.min(cells - 1, Math.floor(x));
    const yi = Math.min(cells - 1, Math.floor(y));
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = g[yi * n + xi];
    const b = g[yi * n + xi + 1];
    const c = g[(yi + 1) * n + xi];
    const d = g[(yi + 1) * n + xi + 1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

/** 여러 크기의 노이즈를 겹친 값(0~1) 배열 */
function noiseField(rng, size, octaveCells) {
  const noises = octaveCells.map((c) => valueNoise(rng, c));
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      let amp = 1;
      let total = 0;
      for (const nz of noises) {
        sum += nz(x / size, y / size) * amp;
        total += amp;
        amp *= 0.55;
      }
      out[y * size + x] = sum / total;
    }
  }
  return out;
}

function paintField(ctx, size, field, base, contrast, grain, rng) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const k = (field[i] - 0.5) * contrast + (rng() - 0.5) * grain;
    d[i * 4] = clamp255(base[0] + k);
    d[i * 4 + 1] = clamp255(base[1] + k * 0.97);
    d[i * 4 + 2] = clamp255(base[2] + k * 0.92);
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function stains(ctx, size, rng, count, rgb, maxAlpha) {
  for (let s = 0; s < count; s++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = (0.03 + rng() * 0.12) * size;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${0.05 + rng() * maxAlpha})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function cracks(ctx, size, rng, count, alpha = 0.6) {
  ctx.lineCap = 'round';
  for (let s = 0; s < count; s++) {
    let x = rng() * size;
    let y = rng() * size;
    let ang = rng() * Math.PI * 2;
    ctx.strokeStyle = `rgba(16,14,12,${alpha * (0.5 + rng() * 0.5)})`;
    ctx.lineWidth = 0.8 + rng() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 8 + randInt(rng, 20);
    for (let i = 0; i < steps; i++) {
      ang += (rng() - 0.5) * 1.1;
      const step = 4 + rng() * 10;
      x += Math.cos(ang) * step;
      y += Math.sin(ang) * step;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/** 낡은 콘크리트 */
export function makeConcreteTexture({
  size = 512,
  seed = 1,
  base = [120, 114, 102],
  contrast = 70,
  stainCount = 30,
  drips = 0,
  crackCount = 6,
} = {}) {
  const rng = createRng(seed);
  const { canvas, ctx } = makeCanvas(size);
  paintField(ctx, size, noiseField(rng, size, [3, 6, 12, 24, 48, 96]), base, contrast, 18, rng);
  stains(ctx, size, rng, stainCount, '30,26,20', 0.18);
  for (let s = 0; s < drips; s++) {
    const x = rng() * size;
    const y0 = rng() * size * 0.5;
    const len = (0.15 + rng() * 0.5) * size;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, `rgba(25,22,18,${0.08 + rng() * 0.2})`);
    g.addColorStop(1, 'rgba(25,22,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y0, 1 + rng() * 5, len);
  }
  cracks(ctx, size, rng, crackCount);
  return toTexture(canvas);
}

/** 녹슨 어두운 금속 (레일, 액자 틀, 환풍구) */
export function makeRustMetalTexture({ size = 256, seed = 13, base = [72, 68, 62] } = {}) {
  const rng = createRng(seed);
  const { canvas, ctx } = makeCanvas(size);
  paintField(ctx, size, noiseField(rng, size, [4, 8, 16, 32, 64]), base, 50, 14, rng);
  stains(ctx, size, rng, 22, '115,62,28', 0.35);
  for (let i = 0; i < 60; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const a = rng() * Math.PI;
    const len = 6 + rng() * 26;
    ctx.strokeStyle = rng() < 0.5 ? 'rgba(190,185,170,0.18)' : 'rgba(10,10,10,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  return toTexture(canvas);
}

/** 바닥 타일 윗면: 테두리, 볼트, 긁힘, 녹 */
export function makeTilePlateTexture({ size = 256, seed = 5 } = {}) {
  const rng = createRng(seed);
  const { canvas, ctx } = makeCanvas(size);
  paintField(ctx, size, noiseField(rng, size, [4, 8, 16, 32, 64]), [46, 49, 47], 46, 16, rng);

  // 안쪽 판에 가는 금 (깨진 유리판 느낌)
  const cx = size * (0.3 + rng() * 0.4);
  const cy = size * (0.3 + rng() * 0.4);
  ctx.strokeStyle = 'rgba(150,160,150,0.22)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    let x = cx;
    let y = cy;
    let ang = (i / 9) * Math.PI * 2 + rng() * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      ang += (rng() - 0.5) * 0.6;
      x += Math.cos(ang) * (8 + rng() * 18);
      y += Math.sin(ang) * (8 + rng() * 18);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // 긁힘
  for (let i = 0; i < 70; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const a = rng() * Math.PI;
    const len = 4 + rng() * 22;
    ctx.strokeStyle = rng() < 0.6 ? 'rgba(170,170,160,0.16)' : 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  stains(ctx, size, rng, 8, '110,58,24', 0.3);

  // 테두리 (밝은 금속 틀 + 안쪽 그림자)
  const b = size * 0.075;
  ctx.strokeStyle = 'rgba(128,126,116,0.9)';
  ctx.lineWidth = b;
  ctx.strokeRect(b / 2, b / 2, size - b, size - b);
  ctx.strokeStyle = 'rgba(8,8,8,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeRect(b + 1.5, b + 1.5, size - 2 * b - 3, size - 2 * b - 3);
  ctx.strokeStyle = 'rgba(200,200,190,0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(1, 1, size - 2, size - 2);

  // 모서리 볼트
  for (const [x, y] of [[b / 2, b / 2], [size - b / 2, b / 2], [b / 2, size - b / 2], [size - b / 2, size - b / 2]]) {
    ctx.fillStyle = '#2a2a28';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.026, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8f8d84';
    ctx.beginPath();
    ctx.arc(x - 0.8, y - 0.8, size * 0.018, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(canvas);
}

/** 노랑·검정 사선 경고 띠 (긁히고 바랜 페인트). 가로로 반복해서 쓴다 */
export function makeHazardTexture({ size = 128, seed = 3 } = {}) {
  const rng = createRng(seed);
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#1b1a17';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#c9a227';
  const w = size / 4;
  for (let x = -size; x < size * 2; x += w * 2) {
    ctx.beginPath();
    ctx.moveTo(x, size);
    ctx.lineTo(x + w, size);
    ctx.lineTo(x + w + size, 0);
    ctx.lineTo(x + size, 0);
    ctx.closePath();
    ctx.fill();
  }
  stains(ctx, size, rng, 14, '40,30,20', 0.45);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(20,18,15,0.6)' : 'rgba(120,70,30,0.35)';
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 4, 1 + rng() * 2);
  }
  return toTexture(canvas);
}

/** 가운데가 밝고 가장자리로 사라지는 둥근 빛 (재질 색을 곱해서 빨강·초록으로 쓴다) */
export function makeGlowTexture({ size = 128 } = {}) {
  const { canvas, ctx } = makeCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.65)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 벽 패널 화면 (어두운 유리, broken이면 금이 많이 감) */
export function makeScreenTexture({ size = 256, seed = 7, broken = false } = {}) {
  const rng = createRng(seed);
  const { canvas, ctx } = makeCanvas(size);
  paintField(ctx, size, noiseField(rng, size, [4, 8, 16, 32]), [12, 18, 15], 18, 6, rng);
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, 'rgba(120,160,140,0.10)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(120,160,140,0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const centers = broken ? 3 : 1;
  const linesPer = broken ? 11 : 4;
  ctx.strokeStyle = broken ? 'rgba(170,190,180,0.45)' : 'rgba(150,170,160,0.25)';
  for (let c = 0; c < centers; c++) {
    const cx = size * (0.2 + rng() * 0.6);
    const cy = size * (0.2 + rng() * 0.6);
    for (let i = 0; i < linesPer; i++) {
      let x = cx;
      let y = cy;
      let ang = (i / linesPer) * Math.PI * 2 + rng() * 0.4;
      ctx.lineWidth = 0.8 + rng();
      ctx.beginPath();
      ctx.moveTo(x, y);
      const steps = broken ? 9 : 5;
      for (let k = 0; k < steps; k++) {
        ang += (rng() - 0.5) * 0.5;
        x += Math.cos(ang) * (10 + rng() * 22);
        y += Math.sin(ang) * (10 + rng() * 22);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  if (broken) {
    // 깨져서 검게 죽은 부분
    stains(ctx, size, rng, 5, '0,0,0', 0.6);
  }
  return toTexture(canvas);
}
