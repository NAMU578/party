import * as THREE from 'three';
import { CONFIG } from '../config.js';

const REF_ASPECT = 16 / 9;

// 렌더러, 장면, 고정 3/4 카메라, 기본 조명.
export class Stage {
  constructor(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    const fogColor = 0x040605;
    this.scene.background = new THREE.Color(fogColor);
    // 멀어질수록(깊이 떨어질수록) 어둠에 묻히게 해서 구덩이의 깊이감을 만든다
    this.scene.fog = new THREE.Fog(fogColor, 30, 62);

    const cam = CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(cam.fov, 1, 0.1, 250);
    this.basePosition = new THREE.Vector3(...cam.position);
    this.camera.position.copy(this.basePosition);
    this.camera.lookAt(new THREE.Vector3(...cam.lookAt));

    this._shake = { time: 0, duration: 1, strength: 0 };
    this._addLights();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _addLights() {
    const hemi = new THREE.HemisphereLight(0xc4ccd0, 0x1c1e1c, 0.7);

    const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
    key.position.set(-8, 26, 10);
    key.target.position.set(0, 0, -1);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -16, right: 16, top: 14, bottom: -14, near: 1, far: 80 });
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;

    const fill = new THREE.DirectionalLight(0x9db2ff, 0.4);
    fill.position.set(12, 10, 14);

    this.scene.add(hemi, key, key.target, fill);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // 16:9보다 좁은 화면에서는 세로 시야각을 넓혀 바닥 양 끝이 잘리지 않게 한다
    const baseFov = CONFIG.camera.fov;
    if (aspect < REF_ASPECT) {
      const t = Math.tan(THREE.MathUtils.degToRad(baseFov / 2)) * (REF_ASPECT / aspect);
      this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(t));
    } else {
      this.camera.fov = baseFov;
    }
    this.camera.updateProjectionMatrix();
  }

  /** 화면 흔들림 (바닥이 떨어질 때) */
  shake(strength = 0.25, duration = 0.5) {
    this._shake = { time: duration, duration, strength };
  }

  render(dt) {
    const s = this._shake;
    if (s.time > 0) {
      s.time = Math.max(0, s.time - dt);
      const k = s.strength * (s.time / s.duration);
      this.camera.position.set(
        this.basePosition.x + (Math.random() - 0.5) * 2 * k,
        this.basePosition.y + (Math.random() - 0.5) * 2 * k,
        this.basePosition.z + (Math.random() - 0.5) * k,
      );
    } else {
      this.camera.position.copy(this.basePosition);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
