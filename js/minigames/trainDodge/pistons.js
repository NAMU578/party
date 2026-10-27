import * as THREE from 'three';
import { makeGlowTexture, makeHazardTexture, makeRustMetalTexture, withRepeat } from '../../render/proceduralTextures.js';

// 대피 구역마다 하나씩: 위에서 오르내리는 피스톤(압착기)과 통로 바닥의 바닥등.
// 피스톤이 바닥까지 내려와 있으면 구역이 막혀 있고(빨간불), 올라가 있으면 들어갈 수 있다(초록불).

const PISTON_UP_Y = 14;  // 다 올라갔을 때 밑면 높이: 카메라 높이쯤이라 화면 밖으로 사라진다
const BLOCK_H = 2.2;
const ROD_TOP_Y = 18;           // 로드 윗끝 (화면 밖)
const LAMP_R = 0.19;
const RED = 0xff3020;
const GREEN = 0x36ff62;

export class Pistons {
  constructor(layout) {
    this.group = new THREE.Group();
    this.units = [];
    const disposables = (this._disposables = []);
    const keep = (...items) => {
      disposables.push(...items);
      return items[0];
    };
    const { halfW, alcoveDepth: depth, alcoveWidth: width } = layout;

    const steelTex = keep(makeRustMetalTexture({ seed: 57, base: [104, 98, 88] }));
    const hazardTex = keep(makeHazardTexture({ seed: 12 }));
    const glowTex = keep(makeGlowTexture());
    const blockMat = keep(new THREE.MeshStandardMaterial({ map: steelTex, roughness: 0.55, metalness: 0.65 }));
    const capMat = keep(new THREE.MeshStandardMaterial({ color: 0x8a6a3e, roughness: 0.4, metalness: 0.85 }));
    const bandMat = keep(new THREE.MeshStandardMaterial({ map: keep(withRepeat(hazardTex, 2.5, 0.5)), roughness: 0.7 }));
    const rodMat = keep(new THREE.MeshStandardMaterial({ color: 0xb8b8b0, roughness: 0.25, metalness: 0.95 }));
    const bezelMat = keep(new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 0.5, metalness: 0.7 }));
    this.mats = {
      lightOn: keep(new THREE.MeshBasicMaterial({ color: RED, toneMapped: false })),
      lightOff: keep(new THREE.MeshStandardMaterial({ color: 0x2a0f0c, roughness: 0.3, metalness: 0.2 })),
      lampRed: keep(new THREE.MeshBasicMaterial({ color: RED, toneMapped: false })),
      lampGreen: keep(new THREE.MeshBasicMaterial({ color: GREEN, toneMapped: false })),
    };
    const glowMat = (color) =>
      keep(
        new THREE.MeshBasicMaterial({
          map: glowTex,
          color,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
    this.mats.glowRed = glowMat(RED);
    this.mats.glowGreen = glowMat(GREEN);

    const blockGeo = keep(new THREE.BoxGeometry(depth - 0.06, BLOCK_H, width - 0.06));
    const capGeo = keep(new THREE.BoxGeometry(depth - 0.02, 0.14, width - 0.02));
    const bandGeo = keep(new THREE.BoxGeometry(depth - 0.04, 0.22, width - 0.04));
    const barGeo = keep(new THREE.BoxGeometry(0.1, 0.06, width - 0.36));
    const faceLightGeo = keep(new THREE.BoxGeometry(0.04, 0.14, width - 0.5));
    const rodGeo = keep(new THREE.CylinderGeometry(0.1, 0.1, 1, 12));
    const lampGeo = keep(new THREE.CircleGeometry(LAMP_R, 28));
    const bezelGeo = keep(new THREE.RingGeometry(LAMP_R, LAMP_R + 0.07, 28));
    const glowGeo = keep(new THREE.PlaneGeometry(1.7, 1.7));

    for (const a of layout.alcoves) {
      const cx = a.side * (halfW + depth / 2);
      const toCorridor = -a.side; // 피스톤에서 통로 쪽 방향 (x 부호)

      const piston = new THREE.Group();
      piston.position.set(cx, 0, a.z);
      const block = new THREE.Mesh(blockGeo, blockMat);
      block.position.y = BLOCK_H / 2;
      const band = new THREE.Mesh(bandGeo, bandMat); // 밑면 둘레 경고 띠
      band.position.y = 0.11;
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = BLOCK_H - 0.07;
      // 빨간불: 윗면 통로 쪽 가장자리의 막대 + 통로 쪽 옆면
      const bar = new THREE.Mesh(barGeo, this.mats.lightOn);
      bar.position.set(toCorridor * (depth / 2 - 0.12), BLOCK_H + 0.02, 0);
      const faceLight = new THREE.Mesh(faceLightGeo, this.mats.lightOn);
      faceLight.position.set(toCorridor * ((depth - 0.06) / 2 + 0.02), BLOCK_H - 0.45, 0);
      for (const m of [block, band, cap]) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
      piston.add(block, band, cap, bar, faceLight);

      const rod = new THREE.Mesh(rodGeo, rodMat);
      rod.position.set(cx, 0, a.z);
      rod.castShadow = true;

      const lx = a.side * (halfW - 0.26);
      const lamp = new THREE.Mesh(lampGeo, this.mats.lampRed);
      lamp.rotation.x = -Math.PI / 2;
      lamp.position.set(lx, 0.008, a.z);
      const bezel = new THREE.Mesh(bezelGeo, bezelMat);
      bezel.rotation.x = -Math.PI / 2;
      bezel.position.set(lx, 0.006, a.z);
      const glow = new THREE.Mesh(glowGeo, this.mats.glowRed);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(lx, 0.014, a.z);
      glow.renderOrder = 2;

      this.group.add(piston, rod, lamp, bezel, glow);
      this.units.push({ piston, rod, lamp, glow, lights: [bar, faceLight], lift: -1, green: null });
    }
  }

  /** lift: 0(바닥, 막힘) ~ 1(다 올라감), lampGreen: 바닥등 색 */
  set(i, lift, lampGreen) {
    const u = this.units[i];
    if (u.lift !== lift) {
      u.lift = lift;
      const y = lift * PISTON_UP_Y;
      u.piston.position.y = y;
      const rodLen = ROD_TOP_Y - (y + BLOCK_H) + 0.15;
      u.rod.scale.y = rodLen;
      u.rod.position.y = y + BLOCK_H - 0.15 + rodLen / 2;
      const lightMat = lift < 1 ? this.mats.lightOn : this.mats.lightOff; // 다 올라가 있을 때만 꺼짐
      for (const m of u.lights) m.material = lightMat;
    }
    if (u.green !== lampGreen) {
      u.green = lampGreen;
      u.lamp.material = lampGreen ? this.mats.lampGreen : this.mats.lampRed;
      u.glow.material = lampGreen ? this.mats.glowGreen : this.mats.glowRed;
    }
  }

  /** 피스톤 밑면 높이 */
  bottomY(i) {
    return Math.max(0, this.units[i].lift) * PISTON_UP_Y;
  }

  dispose() {
    this.group.removeFromParent();
    for (const d of this._disposables) d.dispose();
  }
}
