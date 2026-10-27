import * as THREE from 'three';
import { cellCenter, tileCountOf } from './symbolTilesRules.js';
import { makeRustMetalTexture, makeTilePlateTexture } from '../../render/proceduralTextures.js';

// 8×6 바닥 타일과 그 사이의 철제 격자 틀.
// 틀은 타일이 떨어져도 그대로 남아서, 뚫린 칸 아래로 깊이가 보이게 한다.
export class TileGrid {
  constructor(layout, cfg, symbolSet) {
    this.layout = layout;
    this.symbolSet = symbolSet;
    this.group = new THREE.Group();
    this.tiles = [];
    this._disposables = [];

    const plateMats = [5, 9, 17].map(
      (seed) => new THREE.MeshStandardMaterial({ map: makeTilePlateTexture({ seed }), roughness: 0.55, metalness: 0.6 }),
    );
    const tileGeo = new THREE.BoxGeometry(cfg.tileSize, cfg.tileThickness, cfg.tileSize);
    const symGeo = new THREE.PlaneGeometry(cfg.tileSize * 0.8, cfg.tileSize * 0.8);
    this._disposables.push(...plateMats, ...plateMats.map((m) => m.map), tileGeo, symGeo);

    for (let i = 0; i < tileCountOf(layout); i++) {
      const { x, z } = cellCenter(layout, i);
      const tile = new THREE.Group();
      tile.position.set(x, 0, z);

      const base = new THREE.Mesh(tileGeo, plateMats[(i * 7) % plateMats.length]);
      base.position.y = -cfg.tileThickness / 2;
      base.rotation.y = ((i * 5) % 4) * (Math.PI / 2); // 타일마다 무늬 방향을 다르게
      base.castShadow = true;
      base.receiveShadow = true;

      const sym = new THREE.Mesh(symGeo, symbolSet.materials[0][0]);
      sym.rotation.x = -Math.PI / 2;
      sym.position.y = 0.015;
      sym.visible = false;
      sym.renderOrder = 2;

      tile.add(base, sym);
      this.group.add(tile);
      this.tiles.push({
        group: tile,
        sym,
        variant: (i * 3) % symbolSet.variants,
        // 떨어질 때 타일마다 다르게 기우는 방향
        tiltX: ((((i * 37) % 7) - 3) / 3) * 0.5,
        tiltZ: ((((i * 53) % 5) - 2) / 2) * 0.4,
      });
    }

    this._buildFrame(layout, cfg);
  }

  _buildFrame(layout, cfg) {
    const mat = new THREE.MeshStandardMaterial({ map: makeRustMetalTexture({ seed: 61 }), roughness: 0.75, metalness: 0.5 });
    const h = 0.6;
    const t = cfg.tileGap;
    const alongZ = new THREE.BoxGeometry(t, h, layout.depth + t);
    const alongX = new THREE.BoxGeometry(layout.width + t, h, t);
    this._disposables.push(mat, mat.map, alongZ, alongX);
    for (let c = 0; c <= layout.cols; c++) {
      const m = new THREE.Mesh(alongZ, mat);
      m.position.set(layout.x0 + c * layout.pitch, -h / 2, 0);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }
    for (let r = 0; r <= layout.rows; r++) {
      const m = new THREE.Mesh(alongX, mat);
      m.position.set(0, -h / 2, layout.z0 + r * layout.pitch);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }
  }

  /** y: 높이, visible: 보임 여부, tumble: 0~1 떨어지며 기우는 정도 */
  setTile(i, y, visible, tumble = 0) {
    const t = this.tiles[i];
    t.group.position.y = y;
    t.group.visible = visible;
    t.group.rotation.x = t.tiltX * tumble;
    t.group.rotation.z = t.tiltZ * tumble;
  }

  /** symbol: 0~2, null이면 꺼짐 */
  setSymbol(i, symbol) {
    const t = this.tiles[i];
    if (symbol == null || symbol < 0) {
      t.sym.visible = false;
      return;
    }
    t.sym.material = this.symbolSet.materials[symbol][t.variant];
    t.sym.visible = true;
  }

  dispose() {
    this.group.removeFromParent();
    for (const d of this._disposables) d.dispose();
  }
}
