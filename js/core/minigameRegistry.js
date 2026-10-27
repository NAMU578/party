import { shuffle } from './random.js';

// 미니게임 목록. 새 미니게임은 main.js에서 registerMinigame으로 등록한다.
// def 형식: { id, title, description, computeSpawns(rosterIds), create(ctx) }
const registry = new Map();

export function registerMinigame(def) {
  registry.set(def.id, def);
}

export function getMinigame(id) {
  return registry.get(id);
}

export function allMinigameIds() {
  return [...registry.keys()];
}

/**
 * 한 바퀴를 다 돌기 전에는 같은 게임이 다시 나오지 않도록 순서를 만든다.
 * 한 바퀴가 끝나 새로 섞을 때, 직전 게임이 바로 다시 나오지 않게 한다.
 */
export function buildMatchOrder(count, ids = allMinigameIds(), rng = Math.random) {
  const order = [];
  let bag = [];
  while (order.length < count && ids.length) {
    if (bag.length === 0) {
      bag = shuffle(ids.slice(), rng);
      const prev = order[order.length - 1];
      if (ids.length > 1 && bag[0] === prev) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    order.push(bag.shift());
  }
  return order;
}
