import * as THREE from 'three';
import { CONFIG } from '../config.js';

// 로우폴리 인형 캐릭터와 머리 위 닉네임.
// 내 캐릭터는 setPose로 바로 움직이고, 다른 플레이어는 setTarget으로 받은 위치를 부드럽게 따라간다.

let shared = null;
function sharedGeometry() {
  if (shared) return shared;
  shared = {
    torso: new THREE.CapsuleGeometry(0.26, 0.38, 2, 8),
    head: new THREE.IcosahedronGeometry(0.24, 1),
    visor: new THREE.BoxGeometry(0.32, 0.085, 0.1),
    leg: new THREE.BoxGeometry(0.17, 0.7, 0.2).translate(0, -0.35, 0), // 회전축을 엉덩이에
    arm: new THREE.BoxGeometry(0.13, 0.58, 0.14).translate(0, -0.27, 0), // 회전축을 어깨에
    ring: new THREE.RingGeometry(0.42, 0.52, 32),
  };
  return shared;
}

function makeNameTag(name, color, isLocal) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 30px system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const textW = Math.min(220, ctx.measureText(name).width);
  const boxW = textW + 34;
  const x0 = (256 - boxW) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(x0, 10, boxW, 44, 8);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(x0 + 8, 20, 6, 24);
  ctx.fillStyle = isLocal ? '#ffffff' : '#e6e6e6';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x0 + 22, 33, 220);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false, fog: false }),
  );
  sprite.scale.set(2.2, 0.55, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export class PlayerView {
  constructor({ name, color, isLocal }) {
    const geo = sharedGeometry();
    this.isLocal = isLocal;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const base = new THREE.Color(color);
    this.materials = [
      new THREE.MeshStandardMaterial({ color: base, roughness: 0.55, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.42), roughness: 0.7, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: 0.45, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x111416, roughness: 0.2, metalness: 0.6 }),
    ];
    const [bodyMat, darkMat, skinMat, visorMat] = this.materials;

    const torso = new THREE.Mesh(geo.torso, bodyMat);
    torso.position.y = 1.12;
    const head = new THREE.Mesh(geo.head, skinMat);
    head.position.y = 1.72;
    const visor = new THREE.Mesh(geo.visor, visorMat);
    visor.position.set(0, 1.74, 0.19);
    this.legL = new THREE.Mesh(geo.leg, darkMat);
    this.legL.position.set(-0.11, 0.72, 0);
    this.legR = new THREE.Mesh(geo.leg, darkMat);
    this.legR.position.set(0.11, 0.72, 0);
    this.armL = new THREE.Mesh(geo.arm, bodyMat);
    this.armL.position.set(-0.36, 1.36, 0);
    this.armR = new THREE.Mesh(geo.arm, bodyMat);
    this.armR.position.set(0.36, 1.36, 0);
    this.body.add(torso, head, visor, this.legL, this.legR, this.armL, this.armR);
    this.body.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });

    if (isLocal) {
      // 내 캐릭터 발밑 고리 (내가 누군지 찾기 쉽게)
      const ringMat = new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
      this.materials.push(ringMat);
      this.marker = new THREE.Mesh(geo.ring, ringMat);
      this.marker.rotation.x = -Math.PI / 2;
      this.marker.position.y = 0.03;
      this.root.add(this.marker);
    }

    this.tag = makeNameTag(name, color, isLocal);
    this.tag.position.y = 2.4;
    this.root.add(this.tag);

    this.target = { x: 0, z: 0, ry: 0 };
    this.moving = false;
    this.walkPhase = 0;
    this.walkAmount = 0;
    this.falling = false;
    this.fallTime = 0;
    this.fallDir = 1;
  }

  snapTo(x, z, ry) {
    this.root.position.set(x, 0, z);
    this.root.visible = true;
    this.body.rotation.set(0, ry, 0);
    this.target = { x, z, ry };
    this.falling = false;
    this.fallTime = 0;
    this.tag.visible = true;
  }

  /** 내 캐릭터: 즉시 반영 */
  setPose(x, z, ry, moving) {
    if (this.falling) return;
    this.root.position.x = x;
    this.root.position.z = z;
    this.body.rotation.y = ry;
    this.moving = moving;
  }

  /** 다른 플레이어: 목표 위치만 갱신하고 update에서 따라감 */
  setTarget(x, z, ry, moving) {
    this.target.x = x;
    this.target.z = z;
    this.target.ry = ry;
    this.moving = !!moving;
  }

  /** 떨어지기 시작. elapsed: 이미 떨어진 시간(초)만큼 앞당겨 시작 */
  fall(elapsed = 0) {
    if (this.falling) return;
    this.falling = true;
    this.fallTime = Math.max(0, elapsed);
    this.fallDir = Math.random() < 0.5 ? -1 : 1;
  }

  update(dt) {
    if (this.falling) {
      this.fallTime += dt;
      const t = this.fallTime;
      const y = -0.5 * CONFIG.player.gravity * t * t;
      this.root.position.y = y;
      this.body.rotation.z = Math.min(0.8, t * 0.9) * this.fallDir;
      this.armL.rotation.x = -2.7 + Math.sin(t * 17) * 0.45;
      this.armR.rotation.x = -2.7 + Math.cos(t * 15) * 0.45;
      this.legL.rotation.x = Math.sin(t * 13) * 0.5;
      this.legR.rotation.x = -Math.sin(t * 13) * 0.5;
      this.tag.visible = y > -1.5;
      if (y < -CONFIG.player.fallHideDepth) this.root.visible = false;
      return;
    }

    if (!this.isLocal) {
      const k = 1 - Math.exp(-CONFIG.player.remoteSmoothing * dt);
      const p = this.root.position;
      const dx = this.target.x - p.x;
      const dz = this.target.z - p.z;
      if (dx * dx + dz * dz > 16) {
        p.x = this.target.x;
        p.z = this.target.z;
      } else {
        p.x += dx * k;
        p.z += dz * k;
      }
      const ry = this.body.rotation.y;
      this.body.rotation.y = ry + Math.atan2(Math.sin(this.target.ry - ry), Math.cos(this.target.ry - ry)) * k;
    }

    // 걷기 동작
    this.walkAmount += ((this.moving ? 1 : 0) - this.walkAmount) * (1 - Math.exp(-10 * dt));
    this.walkPhase += dt * 11 * this.walkAmount;
    const s = Math.sin(this.walkPhase) * 0.75 * this.walkAmount;
    this.legL.rotation.x = s;
    this.legR.rotation.x = -s;
    this.armL.rotation.x = -s * 0.8;
    this.armR.rotation.x = s * 0.8;
    this.body.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.06 * this.walkAmount;
  }

  dispose() {
    this.root.removeFromParent();
    for (const m of this.materials) m.dispose();
    this.tag.material.map.dispose();
    this.tag.material.dispose();
  }
}
