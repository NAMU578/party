// 밀치기·충돌 계산 테스트: node tests/push.test.mjs
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { findPushTarget, knockbackProgress, separate } from '../js/player/pushRules.js';

const P = CONFIG.push;
const facingRight = { x: 0, z: 0, ry: Math.PI / 2 }; // +x를 봄

// 정면 사거리 안의 가장 가까운 사람
let t = findPushTarget(facingRight, [{ id: 'far', x: 1.2, z: 0 }, { id: 'near', x: 0.9, z: 0.1 }], P);
assert.equal(t.id, 'near');
assert.ok(Math.abs(Math.hypot(t.dx, t.dz) - 1) < 1e-9, '밀려날 방향은 단위 벡터');
assert.ok(t.dx > 0.9, '민 사람에서 맞은 사람 쪽으로 밀려남');

// 사거리 밖, 뒤쪽, 옆쪽(각도 밖)은 맞지 않음
assert.equal(findPushTarget(facingRight, [{ id: 'a', x: P.range + 0.01, z: 0 }], P), null);
assert.equal(findPushTarget(facingRight, [{ id: 'b', x: -0.8, z: 0 }], P), null);
assert.equal(findPushTarget(facingRight, [{ id: 'c', x: 0, z: 1.0 }], P), null); // 90도 옆
assert.equal(findPushTarget(facingRight, [{ id: 'd', x: 0.8, z: 0.8 }], P)?.id, 'd'); // 45도 → 판정 안

// 밀려나는 거리: 처음 빠르고, 끝나면 정확히 knockbackDistance
assert.equal(knockbackProgress(0, P.knockbackTime), 0);
assert.equal(knockbackProgress(P.knockbackTime, P.knockbackTime), 1);
assert.equal(knockbackProgress(99, P.knockbackTime), 1);
assert.ok(knockbackProgress(P.knockbackTime / 2, P.knockbackTime) > 0.5);

// 충돌: 겹치면 최소 거리까지 밀려남
const min = CONFIG.player.radius * 2;
let s = separate(0.3, 0, [{ id: 'o', x: 0, z: 0 }], min, 'me');
assert.ok(Math.abs(Math.hypot(s.x, s.z) - min) < 1e-9);
s = separate(5, 5, [{ id: 'o', x: 0, z: 0 }], min, 'me');
assert.deepEqual(s, { x: 5, z: 5 }, '안 겹치면 그대로');
// 정확히 같은 자리: ID 순서에 따라 서로 반대쪽으로 비켜남
const a = separate(0, 0, [{ id: 'b', x: 0, z: 0 }], min, 'a');
const b = separate(0, 0, [{ id: 'a', x: 0, z: 0 }], min, 'b');
assert.ok(a.x * b.x < 0, '양쪽 화면이 반대 방향으로 비켜남');

console.log('밀치기 테스트 모두 통과');
