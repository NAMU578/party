// 키보드 입력. e.code(물리 키 위치)를 써서 한글 자판 상태에서도 WASD가 동작한다.
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.pushQueued = false;
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (e.code === 'Space') {
        if (e.target && e.target.tagName === 'BUTTON') return; // 버튼에 포커스가 있으면 버튼 누르기로 둔다
        e.preventDefault();
        if (!e.repeat) this.pushQueued = true; // 꾹 누르고 있어도 한 번만
        return;
      }
      if (!MOVE_KEYS.has(e.code)) return;
      this.keys.add(e.code);
      e.preventDefault(); // 방향키로 페이지가 스크롤되지 않게
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pushQueued = false;
    });
  }

  /** 카메라 기준 이동 방향. x: 오른쪽 +, z: 화면 아래쪽(카메라 쪽) + */
  axis() {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const z = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    return { x, z };
  }

  /** 스페이스바가 눌렸는지 확인하고 지운다 (못 쓰는 순간에 눌러도 쌓아 두지 않음) */
  consumePush() {
    const pressed = this.pushQueued;
    this.pushQueued = false;
    return pressed;
  }
}
