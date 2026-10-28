import * as THREE from 'three';

// 시점: 내 작업대를 오른쪽 어깨 너머로 내려다보고, 그 너머로 소각로와 맞은편 작업대가 보인다.
// 점수 공개 뒤에는 꼴찌 쪽으로 돌아본다. 내가 꼴찌면 뒤로 빠져서 머리 위 압착기까지 보이게 한다.

const BACK = 2.9; // 작업자 뒤로
const SIDE = 1.45; // 오른쪽 어깨 쪽으로 (판정 칸이 내 머리에 가리지 않게)
const HEIGHT = 4.4;
const AHEAD = 2.6; // 벨트 가운데에서 소각로 쪽으로 이만큼 앞을 본다

/** 내 작업대 시점 { position, target } */
export function stationView(st, cfg) {
  const [ox, oz] = st.out;
  const [rx, rz] = st.right;
  const back = cfg.standOut + BACK;
  return {
    position: new THREE.Vector3(st.x + ox * back + rx * SIDE, HEIGHT, st.z + oz * back + rz * SIDE),
    target: new THREE.Vector3(st.x - ox * AHEAD, 0.3, st.z - oz * AHEAD),
  };
}

/** 꼴찌(들)를 보는 시점. me: 내 작업대, losers: 꼴찌 작업대들 */
export function loserView(me, losers, cfg, iAmLoser) {
  const view = stationView(me, cfg);
  if (iAmLoser) {
    const [ox, oz] = me.out;
    view.position.set(me.standX + ox * 5.2, 5.4, me.standZ + oz * 5.2);
    view.target.set(me.standX, 3.4, me.standZ);
    return view;
  }
  view.target.set(0, 0, 0);
  for (const st of losers) view.target.add(new THREE.Vector3(st.standX, 1.9, st.standZ));
  view.target.divideScalar(losers.length);
  view.position.y += 0.5;
  return view;
}
