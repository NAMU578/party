# 파티 게임

친구들과 브라우저에서 바로 하는 온라인 파티 게임. 미니게임을 랜덤 순서로 돌아가며 하고, 점수를 합산한다.
설치 없이 링크로 접속하며, 방장 브라우저가 판정을 맡는 P2P 방식(PeerJS)이다.

## 실행 방법

JS 모듈을 쓰기 때문에 `index.html`을 더블클릭하면 동작하지 않는다. 아래 중 하나로 연다.

- VS Code의 Live Server 확장으로 `index.html` 열기
- 터미널에서 이 폴더로 이동 후 `python -m http.server 8000` 실행 → `http://localhost:8000`

혼자 테스트할 때는 탭 두 개를 열어 한쪽은 방 만들기, 다른 쪽은 방 코드로 참가하면 된다.
방장 혼자 시작해도 게임이 진행된다 (혼자일 때는 떨어질 때까지 계속됨).

## 깃허브 페이지 배포

1. 깃허브에 새 저장소를 만들고 이 폴더의 파일을 그대로 올린다 (`index.html`이 저장소 최상단에 오도록).
2. 저장소 Settings → Pages → Source를 `Deploy from a branch`, 브랜치 `main`, 폴더 `/ (root)`로 저장한다.
3. 잠시 후 `https://<아이디>.github.io/<저장소이름>/` 주소로 접속된다.
4. 방장이 방을 만들고 `초대 링크 복사`로 받은 주소를 친구에게 보내면 방 코드가 자동으로 채워진다.

## 조작

- WASD 또는 방향키: 이동 (한글 자판 상태에서도 동작)

## 폴더 구조

| 경로 | 역할 |
|---|---|
| `index.html`, `css/style.css` | 페이지와 UI 스타일 |
| `js/main.js` | 시작점, 미니게임 등록 |
| `js/config.js` | 인원수, 라운드 수, 타이밍 등 모든 설정값 |
| `js/net/` | PeerJS 연결(`network.js`), 메시지 종류(`protocol.js`) |
| `js/core/` | 전체 흐름(`gameFlow.js`), 점수, 미니게임 목록·공통 틀, 난수 |
| `js/render/` | 렌더러·카메라, 방 배경, 캐릭터, 절차적 텍스처 |
| `js/player/` | 키보드 입력, 내 캐릭터 조작 |
| `js/ui/` | 로비 화면, 게임 중 HUD·결과표 |
| `js/minigames/symbolTiles/` | 기호 타일 미니게임 (규칙, 시간표, 타일, 벽 패널, 구덩이) |
| `tests/rules.test.mjs` | 규칙 단위 테스트 (`node tests/rules.test.mjs`) |

## 미니게임 추가 방법

1. `js/minigames/새게임/` 폴더를 만들고 `MinigameBase`를 상속한 클래스를 작성한다.
   - `mount()`: 화면 구성, `begin()`: 시작, `update(dt)`: 매 프레임
   - 방장 판정은 `isHost`일 때만 하고 `broadcastEvent()`로 알린다. 참가자는 `sendEventToHost()`로 보고한다.
   - 끝나면 방장이 `finish([[1등들], [2등들], ...])`를 호출한다. 같은 묶음은 공동 순위.
2. `{ id, title, description, computeSpawns, create }` 형태의 정의 객체를 내보낸다 (`symbolTilesGame.js`의 `symbolTilesDef` 참고).
3. `js/main.js`에 `registerMinigame(새정의)` 한 줄을 추가한다.

## 알아둘 점

- 연결 중계는 PeerJS 공용 서버(`0.peerjs.com`)를 쓴다. 이 서버가 멈추면 방을 만들거나 참가할 수 없다.
- 학교·회사처럼 WebRTC를 막는 네트워크에서는 연결이 안 될 수 있다.
- 방장이 나가면 게임이 끝난다. 방장은 게임 탭을 계속 띄워 두어야 한다 (다른 탭으로 오래 가 있으면 브라우저가 진행을 늦춘다).
- 탈락은 각자 자기 화면 기준으로 판정해서 방장에게 보고한다. 친구끼리 하는 용도라 조작 방지는 하지 않았다.
- 같은 칸에 여러 명이 겹칠 수 있다. 밀치기는 아직 없다.
