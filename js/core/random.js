// 시드 기반 난수와 섞기 도구. 같은 시드면 같은 결과가 나온다.

export function randomSeed() {
  return (Math.random() * 2 ** 32) >>> 0;
}

/** mulberry32: 0 이상 1 미만의 수를 돌려주는 함수를 만든다. */
export function createRng(seed = randomSeed()) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0 이상 n 미만의 정수 */
export function randInt(rng, n) {
  return Math.floor(rng() * n);
}

/** 배열을 제자리에서 섞고 돌려준다 (Fisher–Yates). */
export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 배열에서 중복 없이 k개를 무작위로 뽑는다. */
export function sample(rng, arr, k) {
  return shuffle(arr.slice(), rng).slice(0, Math.max(0, Math.min(k, arr.length)));
}
