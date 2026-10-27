import * as THREE from 'three';
import { makeGlowTexture, makeHazardTexture, makeRustMetalTexture, withRepeat } from '../../render/proceduralTextures.js';
import { PORTAL_H } from './corridor.js';

// 위쪽 끝의 터널 입구: 말려 올라가는 셔터, 입구 틀, 경고 띠 보, 셔터 통, 그 위의 경고 LED 두 개.

const SLATS = 12;
const LED_Y = PORTAL_H + 1.75;
const LED_X = 0.36;
const LED_RED = 0xff2a1a;

/** 셔터 판: 가로 골이 진 낡은 금속 */
function makeSlatTexture() {
  const tex = makeRustMetalTexture({ seed: 33, base: [92, 90, 84] });
  const ctx = tex.image.getContext('2d');
  const s = tex.image.width;
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, 'rgba(210,205,190,0.35)');
  g.addColorStop(0.18, 'rgba(0,0,0,0)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.15)');
  g.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  tex.needsUpdate = true;
  return tex;
}

export class Shutter {
  constructor(layout) {
    this.group = new THREE.Group();
    const disposables = (this._disposables = []);
    const keep = (...items) => {
      disposables.push(...items);
      return items[0];
    };
    const { halfW, zTop } = layout;
    const box = (mat, [w, h, d], [x, y, z], parent = this.group) => {
      const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    const metalTex = keep(makeRustMetalTexture({ seed: 77, base: [70, 66, 60] }));
    const hazardTex = keep(makeHazardTexture({ seed: 21 }));
    const glowTex = keep(makeGlowTexture());
    const frameMat = keep(new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.6, metalness: 0.6 }));
    const slatMat = keep(new THREE.MeshStandardMaterial({ map: keep(withRepeat(keep(makeSlatTexture()), 4, 1)), roughness: 0.6, metalness: 0.55 }));
    const beamMat = keep(new THREE.MeshStandardMaterial({ map: keep(withRepeat(hazardTex, 9, 1)), roughness: 0.65, metalness: 0.2 }));
    const darkMat = keep(new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5, metalness: 0.5 }));

    // 셔터 판: 묶음 전체가 위로 올라가면서 입구 위 벽 속으로 들어간다
    this.slats = new THREE.Group();
    const h = PORTAL_H / SLATS;
    for (let i = 0; i < SLATS; i++) box(slatMat, [halfW * 2, h - 0.015, 0.07], [0, (i + 0.5) * h, zTop - 0.18], this.slats);
    box(darkMat, [halfW * 2, 0.12, 0.13], [0, 0.06, zTop - 0.18], this.slats); // 맨 아래 묵직한 막대
    this.group.add(this.slats);

    // 입구 틀, 경고 띠 보, 셔터 통
    for (const s of [-1, 1]) box(frameMat, [0.28, PORTAL_H + 0.1, 0.36], [s * (halfW + 0.14), (PORTAL_H + 0.1) / 2, zTop + 0.1]);
    box(beamMat, [halfW * 2 + 0.7, 0.5, 0.4], [0, PORTAL_H + 0.25, zTop + 0.12]);
    box(frameMat, [halfW * 2 + 0.3, 0.75, 0.55], [0, PORTAL_H + 0.88, zTop + 0.2]);

    // 경고 LED 두 개 (판 위에 둥근 램프, 켜지면 빛 번짐과 붉은 조명)
    box(darkMat, [1.5, 0.75, 0.16], [0, LED_Y, zTop + 0.1]);
    this.ledOn = keep(new THREE.MeshBasicMaterial({ color: LED_RED, toneMapped: false }));
    this.ledOff = keep(new THREE.MeshStandardMaterial({ color: 0x3a0c08, roughness: 0.2, metalness: 0.3 }));
    const ledGeo = keep(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 24));
    const rimGeo = keep(new THREE.TorusGeometry(0.22, 0.05, 8, 24));
    const glowMat = keep(
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: LED_RED,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const glowGeo = keep(new THREE.PlaneGeometry(1.6, 1.6));
    this.leds = [-1, 1].map((s) => {
      const led = new THREE.Mesh(ledGeo, this.ledOff);
      led.rotation.x = Math.PI / 2;
      led.position.set(s * LED_X, LED_Y, zTop + 0.2);
      const rim = new THREE.Mesh(rimGeo, frameMat);
      rim.position.set(s * LED_X, LED_Y, zTop + 0.22);
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(s * LED_X, LED_Y, zTop + 0.3);
      glow.renderOrder = 2;
      glow.visible = false;
      const light = new THREE.PointLight(LED_RED, 0, 12, 2);
      light.position.set(s * LED_X, LED_Y - 0.3, zTop + 1.0);
      this.group.add(led, rim, glow, light);
      return { led, glow, light };
    });
    this.phase = null;
  }

  /** openness: 0(닫힘)~1(열림), led: -1 꺼짐 / 0 왼쪽 / 1 오른쪽 */
  set(openness, led) {
    this.slats.position.y = openness * PORTAL_H;
    if (led === this.phase) return;
    this.phase = led;
    this.leds.forEach((l, i) => {
      const on = i === led;
      l.led.material = on ? this.ledOn : this.ledOff;
      l.glow.visible = on;
      l.light.intensity = on ? 9 : 0;
    });
  }

  dispose() {
    this.group.removeFromParent();
    for (const d of this._disposables) d.dispose();
  }
}
