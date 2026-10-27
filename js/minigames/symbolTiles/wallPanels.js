import * as THREE from 'three';

// 벽면 패널 3개에 같은 기호를 띄운다. 고장난 패널은 가끔 꺼졌다 켜지고 흐리게 보인다.
export class WallPanels {
  constructor(anchors, symbolSet) {
    this.symbolSet = symbolSet;
    this.symbol = null;
    this.panels = anchors.map((a) => {
      const mat = new THREE.MeshBasicMaterial({
        map: symbolSet.textures[0][0],
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        opacity: a.broken ? 0.7 : 1,
      });
      const size = a.h * 0.86;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      plane.position.z = 0.07;
      plane.visible = false;
      const light = new THREE.PointLight(0x46ff6e, 0, 16, 2);
      light.position.set(0, 0, 1.6);
      a.group.add(plane, light);
      return { plane, mat, light, broken: a.broken, glitch: 0 };
    });
  }

  /** symbol: 0~2, null이면 꺼짐 */
  setSymbol(symbol) {
    if (symbol === this.symbol) return;
    this.symbol = symbol;
    for (const p of this.panels) {
      if (symbol == null) continue;
      p.mat.map = this.symbolSet.textures[symbol][p.broken ? 1 : 0];
    }
  }

  update(dt) {
    const on = this.symbol != null;
    for (const p of this.panels) {
      let visible = on;
      if (p.broken && on) {
        // 고장 연출: 가끔 짧게 꺼지고 살짝 흔들림
        if (p.glitch > 0) p.glitch -= dt;
        else if (Math.random() < dt * 2.5) p.glitch = 0.04 + Math.random() * 0.16;
        visible = p.glitch <= 0;
        p.plane.position.x = (Math.random() - 0.5) * 0.04;
      }
      p.plane.visible = visible;
      p.light.intensity = visible ? (p.broken ? 9 : 14) : 0;
    }
  }

  dispose() {
    for (const p of this.panels) {
      p.plane.removeFromParent();
      p.light.removeFromParent();
      p.plane.geometry.dispose();
      p.mat.dispose();
    }
  }
}
