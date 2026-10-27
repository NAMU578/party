import * as THREE from 'three';
import { createRng } from '../../core/random.js';

// ○, ×, □ 초록 네온 기호. 붓으로 칠한 듯 흔들리고 군데군데 벗겨진 모양을 캔버스에 직접 그린다.

const SIZE = 256;

function drawPath(ctx, symbol, jitter) {
  ctx.beginPath();
  if (symbol === 0) {
    const n = jitter.length;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 70 + jitter[i % n];
      const x = 128 + Math.cos(a) * r;
      const y = 128 + Math.sin(a) * r * 0.96;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else if (symbol === 1) {
    ctx.moveTo(62 + jitter[0], 60);
    ctx.lineTo(194, 196 + jitter[1]);
    ctx.moveTo(196 + jitter[2], 62);
    ctx.lineTo(60, 194 + jitter[3]);
  } else {
    ctx.moveTo(60, 60 + jitter[0]);
    ctx.lineTo(196 + jitter[1], 62);
    ctx.lineTo(195, 196 + jitter[2]);
    ctx.lineTo(61 + jitter[3], 194);
    ctx.closePath();
  }
}

function makeSymbolTexture(symbol, seed) {
  const rng = createRng(seed);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.translate(128, 128);
  ctx.rotate((rng() - 0.5) * 0.14);
  ctx.translate(-128, -128);

  const jitter = [];
  for (let i = 0; i < 40; i++) jitter.push((rng() - 0.5) * 7);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // 바깥 빛 번짐
  ctx.shadowColor = 'rgba(40,255,90,0.95)';
  ctx.shadowBlur = 26;
  ctx.strokeStyle = 'rgba(40,220,80,0.8)';
  ctx.lineWidth = 30;
  drawPath(ctx, symbol, jitter);
  ctx.stroke();
  // 본체
  ctx.shadowBlur = 8;
  ctx.strokeStyle = '#55ff78';
  ctx.lineWidth = 21;
  drawPath(ctx, symbol, jitter);
  ctx.stroke();
  // 가운데 밝은 심
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(205,255,215,0.85)';
  ctx.lineWidth = 6;
  drawPath(ctx, symbol, jitter);
  ctx.stroke();

  // 페인트가 벗겨진 자국
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 150; i++) {
    ctx.globalAlpha = 0.3 + rng() * 0.7;
    ctx.beginPath();
    ctx.arc(rng() * SIZE, rng() * SIZE, 1 + rng() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * textures[symbol][variant], materials[symbol][variant]
 * 타일마다 variant를 다르게 써서 같은 기호라도 모양이 조금씩 다르게 보인다.
 */
export function createSymbolSet(variants = 2) {
  const textures = [];
  const materials = [];
  for (let s = 0; s < 3; s++) {
    textures.push([]);
    materials.push([]);
    for (let v = 0; v < variants; v++) {
      const tex = makeSymbolTexture(s, 1000 + s * 17 + v * 101);
      textures[s].push(tex);
      materials[s].push(
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
    }
  }
  return {
    variants,
    textures,
    materials,
    dispose() {
      textures.flat().forEach((t) => t.dispose());
      materials.flat().forEach((m) => m.dispose());
    },
  };
}
