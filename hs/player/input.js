// 키보드 입력. e.code(물리 키 위치)를 써서 한글 자판 상태에서도 WASD가 동작한다.
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export class Input {
  constructor() {
    this.keys = new Set();
    window.addEventListener('keydown', (e) => {
      if (isTyping(e) || !MOVE_KEYS.has(e.code)) return;
      this.keys.add(e.code);
      e.preventDefault(); // 방향키로 페이지가 스크롤되지 않게
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** 카메라 기준 이동 방향. x: 오른쪽 +, z: 화면 아래쪽(카메라 쪽) + */
  axis() {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const z = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    return { x, z };
  }
}
