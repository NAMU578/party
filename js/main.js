import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Stage } from './render/scene.js';
import { createRoom } from './render/room.js';
import { Network } from './net/network.js';
import { Session } from './core/session.js';
import { GameFlow } from './core/gameFlow.js';
import { registerMinigame } from './core/minigameRegistry.js';
import { Input } from './player/input.js';
import { Hud } from './ui/hud.js';
import { LobbyUI } from './ui/lobbyUI.js';
import { symbolTilesDef } from './minigames/symbolTiles/symbolTilesGame.js';
import { gridLayout } from './minigames/symbolTiles/symbolTilesRules.js';
import { trainDodgeDef } from './minigames/trainDodge/trainDodgeGame.js';
import { sortingLineDef } from './minigames/sortingLine/sortingGame.js';
import { dinnerMannersDef } from './minigames/dinnerManners/dinnerGame.js';

// 미니게임 등록: 새 미니게임을 만들면 여기에 한 줄 추가한다.
registerMinigame(symbolTilesDef);
registerMinigame(trainDodgeDef);
registerMinigame(sortingLineDef);
registerMinigame(dinnerMannersDef);

document.title = CONFIG.title;

const stage = new Stage(document.getElementById('game-canvas'));
const layout = gridLayout(CONFIG.symbolTiles);
const room = createRoom({ floorWidth: layout.width, floorDepth: layout.depth, cols: layout.cols, rows: layout.rows });
stage.scene.add(room.group);

const network = new Network();
const session = new Session();
const input = new Input();
const hud = new Hud();
let flow = null;
const lobby = new LobbyUI({
  onCreate: (name) => flow.createRoom(name),
  onJoin: (name, code) => flow.joinRoom(name, code),
  onStart: () => flow.hostStart(),
  onSettings: (settings) => flow.hostUpdateSettings(settings),
  onLeave: () => flow.leave(),
});
flow = new GameFlow({ stage, room, network, session, input, hud, lobby });
hud.onLobbyButton(() => flow.hostBackToLobby());

const peerLoaded = typeof window.Peer === 'function';
lobby.showStart(peerLoaded ? '' : '통신 라이브러리(PeerJS)를 불러오지 못했습니다. 인터넷 연결을 확인하세요.', !peerLoaded);

// 개발자 도구 콘솔에서 상태를 확인할 때 쓰는 디버그용 핸들
window.__party = { flow, stage, network, session };

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  flow.update(dt);
  stage.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
