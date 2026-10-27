// 게임 중 화면 표시: 라운드 정보, 점수판, 제목 카드, 카운트다운, 알림, 결과표.
// 플레이어 이름은 다른 사람이 입력한 값이므로 항상 textContent로만 넣는다.

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.root = $('hud');
    this.roundEl = $('hud-round');
    this.aliveEl = $('hud-alive');
    this.scoreList = $('hud-score-list');
    this.introEl = $('hud-intro');
    this.introRound = $('intro-round');
    this.introTitle = $('intro-title');
    this.introDesc = $('intro-desc');
    this.countdownEl = $('hud-countdown');
    this.flashEl = $('hud-flash');
    this.feedEl = $('hud-feed');
    this.hintEl = $('hud-hint');
    this.resultPanel = $('result-panel');
    this.resultTitle = $('result-title');
    this.resultBody = $('result-body');
    this.resultNote = $('result-note');
    this.pointsHeader = $('result-points-header');
    this.lobbyBtn = $('to-lobby-btn');
    this._flashTimer = null;
  }

  show(on) {
    this.root.hidden = !on;
  }

  setRoundInfo(text, aliveText) {
    this.roundEl.textContent = text;
    this.aliveEl.textContent = aliveText || '';
    this.aliveEl.hidden = !aliveText;
  }

  /** standings: [{ id, total, rank }], players: Map id → { name, color, left } */
  setScores(standings, { myId, eliminated, players }) {
    this.scoreList.replaceChildren(
      ...standings.map((s) => {
        const p = players.get(s.id);
        const li = el('li');
        if (s.id === myId) li.classList.add('me');
        if (eliminated.has(s.id) || p?.left) li.classList.add('out');
        const dot = el('span', 'dot');
        dot.style.background = p?.color ?? '#ccc';
        li.append(el('span', 'rank', String(s.rank)), dot, el('span', 'name', p?.name ?? '???'), el('span', 'total', String(s.total)));
        return li;
      }),
    );
  }

  showIntro({ roundText, title, description }) {
    this.introRound.textContent = roundText;
    this.introTitle.textContent = title;
    this.introDesc.textContent = description;
    this.introEl.hidden = false;
  }

  hideIntro() {
    this.introEl.hidden = true;
  }

  setCountdown(n) {
    if (n == null) {
      this.countdownEl.hidden = true;
      return;
    }
    this.countdownEl.textContent = String(n);
    this.countdownEl.hidden = false;
    this.countdownEl.classList.remove('pop');
    void this.countdownEl.offsetWidth; // 애니메이션 다시 시작
    this.countdownEl.classList.add('pop');
  }

  flash(text, ms = 1500) {
    this.flashEl.textContent = text;
    this.flashEl.hidden = false;
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      this.flashEl.hidden = true;
    }, ms);
  }

  feed(text) {
    const li = el('li', null, text);
    this.feedEl.append(li);
    while (this.feedEl.children.length > 5) this.feedEl.firstChild.remove();
    setTimeout(() => li.remove(), 4000);
  }

  setHint(text) {
    this.hintEl.textContent = text || '';
    this.hintEl.hidden = !text;
  }

  clearTransient() {
    this.hideIntro();
    this.setCountdown(null);
    this.flashEl.hidden = true;
    this.feedEl.replaceChildren();
    this.setHint('');
  }

  /** rows: [{ rank, name, color, points(null이면 칸 숨김), total, me }] */
  showResult({ title, rows, note, showLobbyButton }) {
    const showPoints = rows.some((r) => r.points != null);
    this.resultTitle.textContent = title;
    this.pointsHeader.hidden = !showPoints;
    this.resultBody.replaceChildren(
      ...rows.map((r) => {
        const tr = el('tr', r.me ? 'me' : null);
        const nameCell = el('td', 'name');
        const dot = el('span', 'dot');
        dot.style.background = r.color;
        nameCell.append(dot, document.createTextNode(r.name));
        tr.append(el('td', 'rank', `${r.rank}위`), nameCell);
        if (showPoints) tr.append(el('td', 'points', `+${r.points}`));
        tr.append(el('td', 'total', String(r.total)));
        return tr;
      }),
    );
    this.resultNote.textContent = note || '';
    this.lobbyBtn.hidden = !showLobbyButton;
    this.resultPanel.hidden = false;
  }

  hideResult() {
    this.resultPanel.hidden = true;
  }

  onLobbyButton(fn) {
    this.lobbyBtn.addEventListener('click', fn);
  }
}
