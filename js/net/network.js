import { CONFIG } from '../config.js';

// PeerJS 래퍼. 방장 한 명이 모든 참가자와 연결되는 별(star) 구조.
// 방장도 플레이어이므로, 방장이 자기 자신에게 보내는 메시지는 네트워크를 거치지 않고 바로 전달한다.

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O, 1/I 제외
const CONN_OPTIONS = { reliable: true, serialization: 'json' };

export function randomRoomCode(length = CONFIG.net.roomCodeLength) {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

export function normalizeRoomCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function makeError(type, message) {
  const err = new Error(message || type);
  err.type = type;
  return err;
}

export function describeNetError(err) {
  switch (err && err.type) {
    case 'peer-unavailable':
      return '방을 찾을 수 없습니다. 방 코드를 확인하세요.';
    case 'browser-incompatible':
      return '이 브라우저는 지원하지 않습니다. 최신 크롬이나 엣지를 사용하세요.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return '연결 서버에 접속하지 못했습니다. 인터넷 연결을 확인하세요.';
    case 'timeout':
      return '연결 시간이 초과되었습니다. 다시 시도하세요.';
    case 'no-peerjs':
      return '통신 라이브러리(PeerJS)를 불러오지 못했습니다. 인터넷 연결을 확인하세요.';
    default:
      return `연결 오류가 발생했습니다. (${(err && (err.type || err.message)) || '알 수 없음'})`;
  }
}

export class Network {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.myId = null;
    this.roomCode = null;
    this.hostConn = null;   // 참가자: 방장과의 연결
    this.conns = new Map(); // 방장: 참가자 ID → 연결
    this.listeners = { hostMessage: [], clientMessage: [], peerLeave: [], disconnect: [] };
    this._closing = false;
  }

  /**
   * hostMessage(fromId, msg): 방장이 받는 메시지
   * clientMessage(msg): 모든 플레이어(방장 포함)가 받는 메시지
   * peerLeave(id): 방장 기준, 참가자 연결 끊김
   * disconnect(): 참가자 기준, 방장과 연결 끊김
   */
  on(event, fn) {
    this.listeners[event].push(fn);
  }

  _emit(event, ...args) {
    for (const fn of this.listeners[event]) {
      try {
        fn(...args);
      } catch (e) {
        console.error(`[network] ${event} 처리 중 오류`, e);
      }
    }
  }

  get active() {
    return !!this.peer && !this.peer.destroyed;
  }

  /** 방장: 방을 만들고 방 코드를 돌려준다. */
  createRoom() {
    return new Promise((resolve, reject) => {
      if (typeof window.Peer !== 'function') return reject(makeError('no-peerjs'));
      this.close();
      this._closing = false;
      let attempts = 0;

      const tryOpen = () => {
        attempts += 1;
        const code = randomRoomCode();
        const peer = new window.Peer(CONFIG.net.peerPrefix + code, { debug: 1 });
        let opened = false;

        peer.on('open', (id) => {
          opened = true;
          this.peer = peer;
          this.isHost = true;
          this.myId = id;
          this.roomCode = code;
          resolve(code);
        });
        peer.on('connection', (conn) => this._acceptConnection(conn));
        peer.on('disconnected', () => {
          // 중계 서버와만 끊긴 상태. 이미 연결된 참가자와는 계속 통신되고, 새 참가자를 받으려면 재접속이 필요하다.
          if (this._closing || peer.destroyed) return;
          setTimeout(() => {
            if (!peer.destroyed) peer.reconnect();
          }, 1000);
        });
        peer.on('error', (err) => {
          if (!opened) {
            peer.destroy();
            if (err.type === 'unavailable-id' && attempts < 5) tryOpen(); // 코드가 겹치면 다른 코드로 재시도
            else reject(err);
            return;
          }
          console.warn('[network] 방장 오류', err);
        });
      };
      tryOpen();
    });
  }

  _acceptConnection(conn) {
    const gone = () => {
      if (this.conns.get(conn.peer) !== conn) return;
      this.conns.delete(conn.peer);
      this._emit('peerLeave', conn.peer);
    };
    conn.on('open', () => this.conns.set(conn.peer, conn));
    conn.on('data', (data) => this._emit('hostMessage', conn.peer, data));
    conn.on('close', gone);
    conn.on('error', (e) => {
      console.warn('[network] 참가자 연결 오류', e);
      gone();
    });
  }

  /** 참가자: 방 코드로 방장에게 연결한다. */
  joinRoom(rawCode) {
    return new Promise((resolve, reject) => {
      if (typeof window.Peer !== 'function') return reject(makeError('no-peerjs'));
      this.close();
      this._closing = false;
      const code = normalizeRoomCode(rawCode);
      const peer = new window.Peer({ debug: 1 });
      let settled = false;

      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        peer.destroy();
        reject(err);
      };
      const timer = setTimeout(() => fail(makeError('timeout')), CONFIG.net.joinTimeoutSeconds * 1000);

      peer.on('open', (id) => {
        const conn = peer.connect(CONFIG.net.peerPrefix + code, CONN_OPTIONS);
        conn.on('open', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.peer = peer;
          this.hostConn = conn;
          this.isHost = false;
          this.myId = id;
          this.roomCode = code;
          resolve(code);
        });
        conn.on('data', (data) => this._emit('clientMessage', data));
        conn.on('close', () => {
          if (settled && this.hostConn === conn && !this._closing) this._emit('disconnect');
        });
        conn.on('error', (e) => {
          console.warn('[network] 방장 연결 오류', e);
          if (!settled) fail(e);
        });
      });
      peer.on('error', (err) => {
        if (!settled) fail(err);
        else console.warn('[network] 참가자 오류', err);
      });
    });
  }

  /** 방장에게 보낸다. 방장 자신이 보내면 바로 자기에게 전달된다. */
  sendToHost(msg) {
    if (this.isHost) {
      const copy = structuredClone(msg);
      queueMicrotask(() => this._emit('hostMessage', this.myId, copy));
      return;
    }
    if (this.hostConn && this.hostConn.open) this._safeSend(this.hostConn, msg);
  }

  /** 방장 전용: 모든 플레이어(자기 자신 포함)에게 보낸다. */
  broadcast(msg) {
    if (!this.isHost) return;
    for (const conn of this.conns.values()) if (conn.open) this._safeSend(conn, msg);
    const copy = structuredClone(msg);
    queueMicrotask(() => this._emit('clientMessage', copy));
  }

  /** 방장 전용: 특정 플레이어에게만 보낸다. */
  sendTo(id, msg) {
    if (!this.isHost) return;
    if (id === this.myId) {
      const copy = structuredClone(msg);
      queueMicrotask(() => this._emit('clientMessage', copy));
      return;
    }
    const conn = this.conns.get(id);
    if (conn && conn.open) this._safeSend(conn, msg);
  }

  /** 방장 전용: 참가자 연결을 끊는다 (응답 없음, 입장 거절 등). */
  dropPeer(id) {
    const conn = this.conns.get(id);
    if (!conn) return;
    this.conns.delete(id);
    try {
      conn.close();
    } catch (e) {
      console.warn(e);
    }
    this._emit('peerLeave', id);
  }

  peerIds() {
    return [...this.conns.keys()];
  }

  _safeSend(conn, msg) {
    try {
      conn.send(msg);
    } catch (e) {
      console.warn('[network] 전송 실패', e);
    }
  }

  close() {
    this._closing = true;
    if (this.peer && !this.peer.destroyed) {
      try {
        this.peer.destroy();
      } catch (e) {
        console.warn(e);
      }
    }
    this.peer = null;
    this.hostConn = null;
    this.conns.clear();
    this.isHost = false;
    this.myId = null;
    this.roomCode = null;
  }
}
