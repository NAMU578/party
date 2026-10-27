import { CONFIG } from '../config.js';
import { normalizeRoomCode } from '../net/network.js';

const NAME_KEY = 'partyGame.name';
const CODE_LEN = CONFIG.net.roomCodeLength;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// 시작 화면(닉네임, 방 만들기/참가)과 대기실 화면(참가자 목록, 방장 설정).
export class LobbyUI {
  /** handlers: { onCreate(name), onJoin(name, code), onStart(), onSettings({maxPlayers, matchRounds}), onLeave() } */
  constructor(handlers) {
    this.handlers = handlers;
    const $ = (id) => document.getElementById(id);
    this.root = $('lobby');
    this.startView = $('lobby-start');
    this.roomView = $('lobby-room');
    this.nameInput = $('name-input');
    this.codeInput = $('code-input');
    this.createBtn = $('create-btn');
    this.joinBtn = $('join-btn');
    this.status = $('lobby-status');
    this.roomCodeEl = $('room-code');
    this.copyBtn = $('copy-link-btn');
    this.playerCount = $('player-count');
    this.playerList = $('player-list');
    this.hostSettings = $('host-settings');
    this.maxSelect = $('max-players-select');
    this.roundsSelect = $('rounds-select');
    this.startBtn = $('start-btn');
    this.guestWait = $('guest-wait');
    this.roomStatus = $('room-status');
    this.leaveBtn = $('leave-btn');
    this.currentCode = '';

    for (const n of CONFIG.lobby.maxPlayersOptions) this.maxSelect.append(new Option(`${n}명`, String(n)));
    for (const n of CONFIG.lobby.matchRoundsOptions) this.roundsSelect.append(new Option(`${n}판`, String(n)));

    try {
      this.nameInput.value = localStorage.getItem(NAME_KEY) || '';
    } catch {
      // 저장소를 못 쓰는 환경이면 무시
    }
    const linkCode = new URLSearchParams(location.search).get('room');
    if (linkCode) this.codeInput.value = normalizeRoomCode(linkCode).slice(0, CODE_LEN);

    this.createBtn.addEventListener('click', () => this.handlers.onCreate(this._name()));
    this.joinBtn.addEventListener('click', () => this._join());
    this.codeInput.addEventListener('input', () => {
      this.codeInput.value = normalizeRoomCode(this.codeInput.value).slice(0, CODE_LEN);
    });
    this.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._join();
    });
    this.startBtn.addEventListener('click', () => this.handlers.onStart());
    this.maxSelect.addEventListener('change', () => this._settingsChanged());
    this.roundsSelect.addEventListener('change', () => this._settingsChanged());
    this.leaveBtn.addEventListener('click', () => this.handlers.onLeave());
    this.copyBtn.addEventListener('click', () => this._copyLink());
  }

  _name() {
    const name = this.nameInput.value.trim();
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // 무시
    }
    return name;
  }

  _join() {
    const code = normalizeRoomCode(this.codeInput.value);
    if (code.length !== CODE_LEN) {
      this.setStatus(`방 코드 ${CODE_LEN}자리를 입력하세요.`, true);
      this.codeInput.focus();
      return;
    }
    this.handlers.onJoin(this._name(), code);
  }

  _settingsChanged() {
    this.handlers.onSettings({ maxPlayers: Number(this.maxSelect.value), matchRounds: Number(this.roundsSelect.value) });
  }

  async _copyLink() {
    const url = `${location.origin}${location.pathname}?room=${this.currentCode}`;
    try {
      await navigator.clipboard.writeText(url);
      this.roomStatus.textContent = '초대 링크를 복사했습니다.';
    } catch {
      window.prompt('아래 링크를 복사해서 친구에게 보내세요.', url);
    }
  }

  showStart(message = '', isError = false) {
    this.root.hidden = false;
    this.startView.hidden = false;
    this.roomView.hidden = true;
    this.setBusy(false);
    this.setStatus(message, isError);
  }

  showRoom({ code, players, hostId, myId, settings }) {
    this.root.hidden = false;
    this.startView.hidden = true;
    this.roomView.hidden = false;
    this.currentCode = code;
    this.roomCodeEl.textContent = code;
    this.playerCount.textContent = `${players.length} / ${settings.maxPlayers}`;
    this.playerList.replaceChildren(
      ...players.map((p) => {
        const li = el('li');
        const dot = el('span', 'dot');
        dot.style.background = p.color;
        li.append(dot, el('span', 'name', p.name));
        if (p.id === hostId) li.append(el('span', 'tag', '방장'));
        if (p.id === myId) li.append(el('span', 'tag me', '나'));
        return li;
      }),
    );
    const isHost = myId === hostId;
    this.hostSettings.hidden = !isHost;
    this.guestWait.hidden = isHost;
    this.guestWait.textContent = `방장이 게임을 시작하기를 기다리는 중입니다. (${settings.matchRounds}판)`;
    this.maxSelect.value = String(settings.maxPlayers);
    this.roundsSelect.value = String(settings.matchRounds);
    this.roomStatus.textContent = '';
  }

  setStatus(text, isError = false) {
    this.status.textContent = text;
    this.status.classList.toggle('error', !!isError);
  }

  setBusy(busy) {
    this.createBtn.disabled = busy;
    this.joinBtn.disabled = busy;
  }

  hide() {
    this.root.hidden = true;
  }
}
