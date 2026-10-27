// 게임 전체 설정값. 밸런스나 타이밍은 여기 숫자만 바꾸면 된다.
export const CONFIG = {
  title: '파티 게임',

  net: {
    peerPrefix: 'symparty-v1-', // PeerJS 공용 서버에서 다른 서비스와 ID가 겹치지 않게 붙이는 접두어
    roomCodeLength: 4,
    sendRate: 15,               // 내 위치를 방장에게 보내는 빈도 (초당 횟수)
    snapshotRate: 15,           // 방장이 모든 위치를 뿌리는 빈도 (초당 횟수)
    pingSeconds: 1,             // 연결 확인 신호 간격
    timeoutSeconds: 15,         // 이 시간 동안 아무 신호가 없으면 연결이 끊긴 것으로 처리
    joinTimeoutSeconds: 12,
  },

  lobby: {
    defaultMaxPlayers: 4,
    maxPlayersOptions: [2, 3, 4, 5, 6, 7, 8],
    defaultMatchRounds: 5,
    matchRoundsOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    nameMaxLength: 12,
  },

  flow: {
    introSeconds: 4,    // 미니게임 시작 전 제목 카드
    resultsSeconds: 6,  // 미니게임 결과 화면
  },

  player: {
    moveSpeed: 5.5,
    turnSpeed: 14,
    gravity: 22,          // 탈락 시 떨어지는 가속도 (타일도 같은 값으로 떨어진다)
    fallHideDepth: 50,    // 이 깊이보다 더 떨어지면 캐릭터를 숨김
    remoteSmoothing: 14,  // 다른 플레이어 위치 보간 속도
    colors: ['#e8524a', '#3d8bfd', '#f2c94c', '#9b59d0', '#2fbf9b', '#f2994a', '#e85fa8', '#a0a8b8'],
  },

  camera: {
    fov: 44,
    position: [0, 21, 18.5],
    lookAt: [0, 1, -2.6],
  },

  symbolTiles: {
    cols: 8,
    rows: 6,
    tileSize: 2.0,
    tileGap: 0.2,
    tileThickness: 0.45,

    firstRoundDelay: 1.5,   // 시작 후 첫 깜빡임까지 (초)
    flickerCount: 3,        // 기호가 무작위로 바뀌며 깜빡이는 횟수
    flickerInterval: 1.0,   // 깜빡임 간격 (초)
    flickerOnRatio: 0.65,   // 깜빡임 한 번 중 켜져 있는 비율
    dropDelay: 3.0,         // 기호 확정 후 바닥이 떨어지기까지 (초)
    downDuration: 4.0,      // 바닥이 떨어진 상태로 유지되는 시간 (초)
    riseDuration: 4.0,      // 타일이 다시 올라오는 시간 (초)
    riseStartDepth: 14,     // 타일이 올라오기 시작하는 깊이

    removePerRound: 6,      // 매 라운드 다시 올라오지 않는 타일 수
    guaranteeSafeAbove: 6,  // 남은 타일이 이 수보다 많을 때만 '살아남는 타일 최소 1칸' 보장
    pitDepth: 60,           // 지하 구덩이 깊이

    dropGraceSeconds: 0.35, // 낙하 직후 이 시간 안에 떨어진 사람은 '동시 탈락'으로 묶음
    endCheckDelay: 1.0,     // 탈락 후 종료 여부를 판단하기까지 기다리는 시간 (동시 탈락 수집용)
    endHoldSeconds: 2.5,    // 종료가 결정된 뒤 결과 화면까지 기다리는 시간 (낙하 연출 감상)
  },
};
