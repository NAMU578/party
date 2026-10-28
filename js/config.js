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
    maxPlayersOptions: [2, 3, 4, 5, 6, 7, 8], // 열차 피하기 대피 구역(8칸)·분류 작업 작업대 배치(8곳)·식사 예절 좌석(8석)보다 많으면 안 됨
    defaultMatchRounds: 5,
    matchRoundsOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    nameMaxLength: 12,
  },

  flow: {
    introSeconds: 4,    // 미니게임 시작 전 제목 카드
    resultsSeconds: 6,  // 라운드 결과 화면
    playsPerRound: 2,   // 한 라운드에 같은 미니게임을 연속으로 하는 판 수 (결과 화면은 라운드 끝에 한 번)
  },

  player: {
    moveSpeed: 5.5,
    turnSpeed: 14,
    gravity: 22,          // 탈락 시 떨어지는 가속도 (타일도 같은 값으로 떨어진다)
    fallHideDepth: 50,    // 이 깊이보다 더 떨어지면 캐릭터를 숨김
    remoteSmoothing: 14,  // 다른 플레이어 위치 보간 속도
    radius: 0.38,         // 충돌 반지름 (두 사람 중심이 이 값의 2배보다 가까워지지 않음)
    colors: ['#e8524a', '#3d8bfd', '#f2c94c', '#9b59d0', '#2fbf9b', '#f2994a', '#e85fa8', '#a0a8b8'],
  },

  push: {
    range: 1.3,             // 밀치기 사거리 (두 사람 몸 중심 사이 거리, 타일 한 칸은 2.0)
    halfAngleDeg: 50,       // 정면 기준 좌우 판정 각도
    lockTime: 0.25,         // 밀치는 동안 멈춰 있는 시간 (헛스윙하면 빈틈)
    cooldown: 1.0,          // 다시 밀 수 있을 때까지
    knockbackDistance: 3.0, // 맞은 사람이 밀려나는 거리
    knockbackTime: 0.45,    // 밀려나며 넘어지는 시간
    downTime: 0.8,          // 누운 채 경직되는 시간
    getUpTime: 0.6,         // 손 짚고 일어나는 시간 (이 동작이 시작될 때부터 이동 가능)
    hostRangeSlack: 1.5,    // 방장이 거리를 확인할 때 허용하는 오차 (통신 지연 고려)
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
    tileGap: 0.1,
    tileThickness: 0.45,

    firstRoundDelay: 1.5,   // 시작 후 첫 깜빡임까지 (초)
    flickerCount: 3,        // 기호가 무작위로 바뀌며 깜빡이는 횟수
    flickerInterval: 1.0,   // 깜빡임 간격 (초)
    flickerOnRatio: 0.65,   // 깜빡임 한 번 중 켜져 있는 비율
    dropDelay: 3.0,         // 기호 확정 후 바닥이 떨어지기까지 (초)
    downDuration: 4.0,      // 바닥이 떨어진 상태로 유지되는 시간 (초)
    riseDuration: 4.0,      // 타일이 다시 올라오는 시간 (초)
    riseStartDepth: 14,     // 타일이 올라오기 시작하는 깊이
    solidLead: 1.0,         // 다음 라운드 1초 전에 다 올라와서 밟을 수 있음 (올라오는 애니메이션도 이때 끝남)

    removePerRound: 6,      // 매 라운드 다시 올라오지 않는 타일 수
    guaranteeSafeAbove: 6,  // 남은 타일이 이 수보다 많을 때만 '살아남는 타일 최소 1칸' 보장
    pitDepth: 60,           // 지하 구덩이 깊이

    dropGraceSeconds: 0.35, // 낙하 직후 이 시간 안에 떨어진 사람은 '동시 탈락'으로 묶음
    endCheckDelay: 1.0,     // 탈락 후 종료 여부를 판단하기까지 기다리는 시간 (동시 탈락 수집용)
    endHoldSeconds: 2.5,    // 종료가 결정된 뒤 결과 화면까지 기다리는 시간 (낙하 연출 감상)
  },

  trainDodge: {
    // 통로와 대피 구역 (타일 한 칸 = 2.0)
    corridorWidth: 4.0,     // 열차 폭과 같다
    corridorLength: 14,     // 셔터(화면 위) ~ 아래 끝
    alcovesPerSide: 4,      // 양쪽 4칸씩 8칸
    alcovePitch: 3.5,       // 구역 간격 (통로 길이 / 한쪽 칸 수: 고르게 배치)
    alcoveWidth: 1.2,       // 구역 입구 폭
    alcoveDepth: 0.95,      // 이보다 깊으면 두 사람 발 중심이 동시에 구역 안에 들어갈 수 있다 (1.0 미만 유지)

    // 턴 시간표 (턴 시작 후 초). 나머지 시각은 turnTimeline.js에서 이 값들로 계산한다.
    shutterOpenAt: 2.0,     // 셔터가 열리기 시작 (진동·LED 시작)
    shutterMoveTime: 1.0,   // 셔터가 열리거나 닫히는 데 걸리는 시간
    pistonMoveTime: 0.3,    // 피스톤이 올라가거나 내려오는 시간
    trainArriveAt: 7.0,     // 열차 앞부분이 셔터에 닿는 시각
    trainCrossTime: 1.0,    // 앞부분이 통로 끝까지 가는 시간 (속도 = 통로 길이 / 이 값)
    trainPassTime: 2.8,     // 앞부분이 아래 끝에 닿은 뒤 꼬리가 빠지기까지 (열차 길이 = 속도 × 이 값)
    shakeFadeTime: 1.3,     // 꼬리가 빠진 뒤 진동이 멈추기까지
    crushDelay: 2.8,        // 꼬리가 빠진 뒤 피스톤이 바닥에 닿기까지
    nextTurnDelay: 1.0,     // 압착 후 다음 턴 시작까지

    ledInterval: 0.25,      // 셔터 위 LED 두 개가 번갈아 켜지는 간격
    shakeStart: 0.03,       // 셔터가 열릴 때 진동 세기
    shakeMax: 0.2,          // 열차가 지나갈 때 진동 세기
    crushShake: 0.3,        // 피스톤이 바닥에 닿을 때 한 번 흔들림

    endCheckDelay: 1.0,     // 탈락 후 종료 여부를 판단하기까지 (동시 탈락 수집용)
    endHoldSeconds: 2.5,    // 종료가 결정된 뒤 결과 화면까지

    camera: { fov: 62, position: [0, 11, 10], lookAt: [0, 0, -1] }, // 통로 아래쪽 위에서 터널을 내려다봄 (넓은 화각)
  },

  sortingLine: {
    // 배치 (타일 한 칸 = 2.0). 작업대는 가운데 소각로를 원형으로 둘러싼다.
    ringRadiusMin: 4.6,       // 소각로 중심 ~ 벨트 가운데 (인원이 적을 때)
    ringRadiusPerPlayer: 0.85,
    ringRadiusMax: 6.8,       // 8명일 때 이웃 작업대와 벨트 끝이 겹치지 않는 크기
    standOut: 1.35,           // 벨트 가운데 ~ 플레이어가 서는 곳 (바깥쪽)
    slotSpacing: 1.05,        // 벨트 위 물건 간격
    beltIn: 2.4,              // 벨트 가운데 ~ 물건이 나오는 왼쪽 끝 (앞으로 올 물건 2개가 보임)
    beltOut: 1.45,            // 벨트 가운데 ~ 재활용 구멍이 있는 오른쪽 끝
    hatchWidth: 0.55,         // 양쪽 끝 구멍 상자의 폭
    itemsPerTurn: 400,        // 한 턴에 준비하는 물건 수 (20초 동안 다 쓸 수 없는 양)

    // 턴 시간표 (턴 시작 후 초)
    readyTime: 1.6,           // 물건이 벨트에 채워진 뒤 작업 시작
    playTime: 20,             // 작업 시간
    wrongJam: 0.5,            // 틀리면 벨트가 걸려 입력을 못 받는 시간
    revealDelay: 2.4,         // 작업 끝 → 점수 공개 (그동안 빈 벨트만 돌아감)
    // 점수 공개 후 초
    lookDelay: 1.2,           // 카메라가 꼴찌 쪽으로 돌기 시작
    lookTime: 0.7,            // 카메라가 도는 시간
    slamDelay: 2.4,           // 압착기가 바닥에 닿음
    pressDropTime: 0.22,      // 압착기가 떨어지는 시간
    lookBackDelay: 4.0,       // 카메라가 내 작업대로 돌아오기 시작
    nextTurnDelay: 5.2,       // 다음 턴 시작
    endHoldSeconds: 2.6,      // 마지막 압사 후 결과까지

    beltSnap: 30,             // 벨트가 한 칸 넘어가는 빠르기 (30이면 약 0.1초에 도착)
    beltRunSpeed: 2.5,        // 작업이 끝난 뒤 빈 벨트가 도는 속도 (칸/초)
    flightTime: 0.55,         // 버린 물건이 소각로까지 날아가는 시간
    slamShake: 0.35,
    lightLevel: 0.5,          // 공장 안이 어둡도록 기본 조명을 줄이는 배율
    fov: 58,
  },

  dinnerManners: {
    // 콩과 포크
    peasPerPlate: 120,        // 접시마다 처음 콩 수 (전원 같음)
    forkCapacity: 15,         // 포크에 꽂을 수 있는 최대 개수 (가득 찬 채로 찍으면 헛손질)
    stabMin: 1,               // 한 번 찍을 때 꽂히는 개수 범위 (무작위)
    stabMax: 3,
    stabMissChance: 0.2,      // 콩이 하나도 안 찍힐 확률 (동작은 그대로 해서 위험도 같다)
    stabTime: 0.4,            // 찍는 동작 시간: 이 동작이 집주인이 보는 시간과 겹치면 걸린다
    eatTime: 0.6,             // 먹는 동작 시간

    // 집주인 시간표 (초). 신문이 내려가기 시작하고 warnTime이 지나면 '보는 중'
    firstDelay: [2.0, 4.0],   // 시작 후 처음 신문을 내리기까지 (범위 안에서 무작위)
    readTime: [1.5, 5.0],     // 신문을 다 올린 뒤 다음에 내리기까지
    lowerTime: 0.25,          // 신문이 다 내려가는 시간
    warnTime: 0.15,           // 내려가기 시작 → 보는 중 (반응할 수 있는 찰나)
    raiseTime: 0.4,           // 신문을 다시 올리는 시간
    looks: {                  // 쳐다보는 방식: weight(나오는 비중), watch(보는 시간 범위)
      normal: { weight: 4, watch: [1.0, 2.0] },
      glance: { weight: 3, watch: [0.3, 0.6] },     // 흘깃 보고 바로 올림
      doubleTake: { weight: 2, watch: [0.4, 0.8], halfRaise: [0.2, 0.3], again: [1.0, 2.0] }, // 올리다가(halfRaise < raiseTime) 다시 봄
      longStare: { weight: 1, watch: [2.5, 4.5] },  // 길게 쳐다봄
    },

    // 총 (연출만, 판정과 무관)
    aimTime: 0.3,             // 걸린 뒤 총을 쏘기까지
    shotGap: 0.25,            // 여러 명을 연달아 쏠 때 간격
    paperHold: 1.0,           // 쏜 뒤 신문을 내린 채 있는 시간

    seatSpacing: 1.15,        // 같은 줄 좌석 간격
    endHoldSeconds: 2.5,      // 끝난 뒤 결과 화면까지
    lightLevel: 0.3,          // 창고 안이 어둡도록 기본 조명을 줄이는 배율 (식탁은 전등이 비춘다)
    fov: 36,
  },
};
