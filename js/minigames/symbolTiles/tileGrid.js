import * as THREE from 'three';
import { cellCenter, tileCountOf } from './symbolTilesRules.js';
import { makeTilePlateTexture } from '../../render/proceduralTextures.js';

// 8×6 바닥 타일. 타일 사이에 틀이 없어서, 떨어진 칸은 완전한 허공으로 보인다.
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
