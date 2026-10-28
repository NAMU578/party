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

    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 250);
    this.basePosition = new THREE.Vector3();
    this._shake = { time: 0, duration: 1, strength: 0 };
    this._rumble = 0;
    this._addLights();
    this.setView();
    window.addEventListener('resize', () => this.resize());
  }

  /** 고정 카메라 시점 { fov, position, lookAt }. 인자가 없으면 기본 시점(기호 타일 방) */
  setView(view = CONFIG.camera) {
    this.view = view;
    this.basePosition.set(...view.position);
    this.camera.position.copy(this.basePosition);
    this.camera.lookAt(new THREE.Vector3(...view.lookAt));
    this.resize();
  }

  /** 시점만 옮긴다 (화각은 그대로). 카메라를 매 프레임 움직이는 미니게임용 */
  aim(position, lookAt) {
    this.basePosition.copy(position);
    this.camera.position.copy(position);
    this.camera.lookAt(lookAt);
  }

  /** 기본 조명 밝기 배율 (1이 기본). 어두운 맵을 쓰는 미니게임이 정하고, 끝나면 1로 되돌린다 */
  setLightLevel(k) {
    for (const [light, base] of this._lights) light.intensity = base * k;
  }

  /** 계속 이어지는 진동 세기 (0이면 멈춤). 매 프레임 미니게임이 정한다 */
  setRumble(strength) {
    this._rumble = strength;
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
    this._lights = [hemi, key, fill].map((light) => [light, light.intensity]);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // 16:9보다 좁은 화면에서는 세로 시야각을 넓혀 바닥 양 끝이 잘리지 않게 한다
    const baseFov = this.view.fov;
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
    s.time = Math.max(0, s.time - dt);
    const k = Math.max(s.strength * (s.time / s.duration), this._rumble);
    if (k > 0) {
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
