'use strict';
// 오목 규칙과 방 관리. 서버 없이 "방을 만든 사람의 브라우저"에서 돌아간다.
// 상대의 수는 이 코드가 이동 경로를 직접 걸어 보며 검증한다.
(function (root) {
  const { chooseMove } = typeof module !== 'undefined' ? require('./ai.js') : root.OmokAI;
  const N = 15;
  const TURN_SECONDS = 120;   // 한 턴 제한 시간
  const MAX_STEPS = 400;      // 한 턴 최대 이동 칸 수
  const MAX_SKIPS = 2;        // 시간 초과 연속 N번이면 패배
  const AI_DELAY = 900;       // AI 가 두기 전에 기다리는 시간(ms)
  const AI_LEVELS = { easy: '쉬움', normal: '보통', hard: '어려움' };
  const emptyBoard = () => Array.from({ length: N }, () => Array(N).fill(0));

  // 이동 기록: 대문자 R/L/D/U = 빈 칸으로 한 칸, 소문자 r/l/d/u = 이어진 돌을 건너뛰어 첫 빈 칸에 착지
  const DIRS = { R: [1, 0], L: [-1, 0], D: [0, 1], U: [0, -1] };
  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  // (x,y)에서 (dx,dy) 방향으로 건너뛴 착지 칸. 앞이 비었거나 판 끝까지 돌이면 null
  function landing(board, x, y, dx, dy) {
    let a = x + dx, b = y + dy;
    if (!inside(a, b) || board[b][a] === 0) return null;
    while (inside(a, b) && board[b][a] !== 0) { a += dx; b += dy; }
    return inside(a, b) ? [a, b] : null;
  }
  function walk(board, steps) {
    if (typeof steps !== 'string' || steps.length > MAX_STEPS || !/^[RLUDrlud]*$/.test(steps)) return null;
    let x = 0, y = 0;
    if (board[0][0] !== 0 && steps.length === 0) return null;
    for (const ch of steps) {
      const [dx, dy] = DIRS[ch.toUpperCase()];
      if (ch === ch.toUpperCase()) {
        x += dx; y += dy;
        if (!inside(x, y) || board[y][x] !== 0) return null;
      } else {
        const to = landing(board, x, y, dx, dy);
        if (!to) return null;
        [x, y] = to;
      }
    }
    return { x, y };
  }
  // 1-1 에서 출발해 걷기/뛰기로 닿을 수 있는 모든 빈 칸과 그 이동 기록
  function reachable(board) {
    const seen = Array.from({ length: N }, () => Array(N).fill(false));
    const q = [[0, 0, '']];
    const cells = [];
    seen[0][0] = true;
    while (q.length) {
      const [x, y, steps] = q.shift();
      if (board[y][x] === 0) cells.push({ x, y, steps });
      for (const [ch, [dx, dy]] of Object.entries(DIRS)) {
        const sx = x + dx, sy = y + dy;
        if (inside(sx, sy) && board[sy][sx] === 0 && !seen[sy][sx]) { seen[sy][sx] = true; q.push([sx, sy, steps + ch]); }
        const to = landing(board, x, y, dx, dy);
        if (to && !seen[to[1]][to[0]]) { seen[to[1]][to[0]] = true; q.push([to[0], to[1], steps + ch.toLowerCase()]); }
      }
    }
    return cells;
  }
  const hasLegalMove = (board) => reachable(board).length > 0;
  // (x,y)에 놓은 돌 기준으로 5목 이상이면 해당 칸들을 반환
  function checkWin(board, x, y) {
    const c = board[y][x];
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const cells = [{ x, y }];
      for (const s of [1, -1]) {
        let nx = x + dx * s, ny = y + dy * s;
        while (inside(nx, ny) && board[ny][nx] === c) {
          cells.push({ x: nx, y: ny });
          nx += dx * s; ny += dy * s;
        }
      }
      if (cells.length >= 5) return cells;
    }
    return null;
  }

  const cleanName = (n) => String(n || '').replace(/[<>]/g, '').trim().slice(0, 12) || '익명';
  const newToken = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  // 방 하나. link 는 플레이어에게 메시지를 전하는 { send(obj) } 객체다.
  // onSave 는 판이 바뀔 때마다 호출되어, 새로고침해도 이어서 둘 수 있게 해 준다.
  class RoomHost {
    constructor(code, onSave) {
      this.code = code;
      this.onSave = onSave || (() => {});
      this.players = { 1: null, 2: null };
      this.rematch = new Set();
      this.ai = null;
      this.resetGame();
    }

    resetGame() {
      this.board = emptyBoard();
      this.turn = 1;
      this.status = this.players[1] && this.players[2] ? 'playing' : 'waiting';
      this.winner = 0;
      this.winLine = null;
      this.last = null;
      this.moves = 0;
      this.rematch.clear();
      this.skips = { 1: 0, 2: 0 };
      this.reason = '';
      this.notice = null;
      this.startTurnTimer();
    }

    startTurnTimer() {
      clearTimeout(this.timer);
      this.timer = null;
      // AI 대전은 연습이므로 시간 제한이 없다
      if (this.status !== 'playing' || this.ai) { this.deadline = 0; return; }
      this.deadline = Date.now() + TURN_SECONDS * 1000;
      this.timer = setTimeout(() => this.onTimeout(), TURN_SECONDS * 1000 + 50);
    }
    onTimeout() {
      if (this.status !== 'playing') return;
      const c = this.turn, other = c === 1 ? 2 : 1;
      const name = this.players[c]?.name || '';
      this.skips[c]++;
      if (this.skips[c] >= MAX_SKIPS) {
        this.status = 'over'; this.winner = other; this.reason = 'timeout';
        this.deadline = 0;
        this.notice = { id: Date.now(), icon: 'alarm-clock', msg: '시간 초과가 ' + MAX_SKIPS + '번 반복되어 ' + name + ' 님이 패배했어요.' };
      } else {
        this.turn = other;
        this.notice = { id: Date.now(), icon: 'alarm-clock', msg: name + ' 님이 시간 초과! 차례가 넘어갔어요. (' + this.skips[c] + '/' + MAX_SKIPS + ')' };
        this.startTurnTimer();
      }
      this.broadcast();
    }

    // 사람과 AI 가 함께 쓰는 착수 처리. 경로가 규칙에 맞지 않으면 false
    applyMove(color, steps) {
      const pos = walk(this.board, steps);
      if (!pos) return false;
      const { x, y } = pos;
      this.board[y][x] = color;
      this.last = { x, y };
      this.moves++;
      this.skips[color] = 0;
      this.notice = null;
      const line = checkWin(this.board, x, y);
      if (line) { this.status = 'over'; this.winner = color; this.winLine = line; this.deadline = 0; }
      else if (this.moves >= N * N) { this.status = 'over'; this.winner = 0; this.deadline = 0; }
      else if (!hasLegalMove(this.board)) {
        // 아무도 더 둘 수 없는 교착 상태 → 시간 초과 패배 대신 무승부
        this.status = 'over'; this.winner = 0; this.reason = 'stalemate'; this.deadline = 0;
        this.notice = { id: Date.now(), icon: 'handshake', msg: '더 이상 돌을 놓을 수 있는 칸에 닿을 수 없어서 무승부로 끝났어요.' };
      }
      else this.turn = color === 1 ? 2 : 1;
      this.startTurnTimer();
      return true;
    }
    scheduleAi() {
      clearTimeout(this.aiTimer);
      const isAiTurn = () => this.status === 'playing' && !!this.players[this.turn]?.ai;
      if (!isAiTurn()) return;
      this.aiTimer = setTimeout(() => {
        if (!isAiTurn()) return;
        const move = chooseMove(this.board, this.turn, this.ai, reachable);
        if (move && this.applyMove(this.turn, move.steps)) this.broadcast();
      }, AI_DELAY);
    }

    broadcast() {
      this.onSave(this.snapshot());
      for (const color of [1, 2]) {
        const p = this.players[color];
        if (!p || !p.link) continue;
        p.link.send({
          t: 'state',
          room: this.code,
          you: color,
          status: this.status,
          board: this.board,
          turn: this.turn,
          winner: this.winner,
          winLine: this.winLine,
          last: this.last,
          deadline: this.deadline || 0,
          now: Date.now(),
          turnSeconds: TURN_SECONDS,
          reason: this.reason,
          notice: this.notice,
          skips: this.skips,
          names: { 1: this.players[1]?.name || null, 2: this.players[2]?.name || null },
          online: { 1: !!(this.players[1]?.link || this.players[1]?.ai), 2: !!(this.players[2]?.link || this.players[2]?.ai) },
          rematch: [...this.rematch],
          ai: this.ai,
          aiColor: this.players[1]?.ai ? 1 : this.players[2]?.ai ? 2 : 0,
        });
      }
    }

    // 플레이어가 보낸 메시지 처리. 상대가 보낸 값은 믿지 않고 모두 검사한다.
    handle(link, m) {
      if (!m || typeof m.t !== 'string') return;

      if (m.t === 'create') {
        if (this.players[1]) return;
        const token = newToken();
        this.players[1] = { token, name: cleanName(m.name), link };
        link.color = 1;
        // AI 대전: 사람이 흑(선공)으로 시작하고, 다시 하기를 누를 때마다 선공이 바뀐다
        if (Object.keys(AI_LEVELS).includes(m.ai)) {
          this.ai = m.ai;
          this.players[2] = { token: null, name: 'AI (' + AI_LEVELS[m.ai] + ')', link: null, ai: true };
          this.status = 'playing';
        }
        link.send({ t: 'joined', room: this.code, token, you: 1 });
        return this.broadcast();
      }

      if (m.t === 'join') {
        // 재접속(토큰 일치)
        for (const color of [1, 2]) {
          const p = this.players[color];
          if (p && m.token && p.token === m.token) {
            if (p.link && p.link !== link) p.link.color = 0;
            p.link = link; link.color = color;
            link.send({ t: 'joined', room: this.code, token: p.token, you: color });
            return this.broadcast();
          }
        }
        if (this.players[2]) return link.send({ t: 'error', msg: '방이 가득 찼어요. (1:1 대결 방이에요)' });
        const token = newToken();
        this.players[2] = { token, name: cleanName(m.name), link };
        link.color = 2;
        this.status = 'playing';
        this.startTurnTimer();
        link.send({ t: 'joined', room: this.code, token, you: 2 });
        return this.broadcast();
      }

      const color = link.color;
      if (!color) return;

      if (m.t === 'move') {
        if (this.status !== 'playing') return link.send({ t: 'error', msg: '지금은 돌을 둘 수 없어요.' });
        if (this.turn !== color) return link.send({ t: 'error', msg: '내 차례가 아니에요.' });
        if (!this.applyMove(color, m.steps)) return link.send({ t: 'error', msg: '이동 경로가 규칙에 맞지 않아요. (1-1 에서 출발, 빈 칸으로 한 칸씩 또는 이어진 돌 건너뛰기, 최대 ' + MAX_STEPS + '칸)' });
        this.broadcast();
        return this.scheduleAi();
      }

      if (m.t === 'rematch') {
        if (this.status !== 'over') return;
        this.rematch.add(color);
        if (this.ai) this.rematch.add(color === 1 ? 2 : 1); // AI 는 언제나 수락
        if (this.rematch.size === 2) {
          // 선공 교대
          [this.players[1], this.players[2]] = [this.players[2], this.players[1]];
          for (const c of [1, 2]) if (this.players[c]?.link) this.players[c].link.color = c;
          this.resetGame();
        }
        this.broadcast();
        return this.scheduleAi();
      }

      if (m.t === 'leave') this.detach(link);
    }

    // 연결이 끊긴 플레이어를 표시한다 (토큰이 있으면 다시 들어올 수 있다)
    detach(link) {
      const p = this.players[link.color];
      link.color = 0;
      if (p && p.link === link) { p.link = null; this.broadcast(); }
    }
    stop() {
      clearTimeout(this.timer);
      clearTimeout(this.aiTimer);
      this.onSave = () => {};
    }
    // 방을 닫으며 상대에게 알린다
    close() {
      for (const c of [1, 2]) this.players[c]?.link?.send({ t: 'closed' });
      this.stop();
    }

    snapshot() {
      const { code, board, turn, status, winner, winLine, last, moves, skips, reason, notice, ai } = this;
      const player = (p) => p && { token: p.token, name: p.name, ai: p.ai };
      return { code, board, turn, status, winner, winLine, last, moves, skips, reason, notice, ai, rematch: [...this.rematch], players: { 1: player(this.players[1]), 2: player(this.players[2]) } };
    }
    // 새로고침 뒤 저장해 둔 판으로 방을 되살린다
    static restore(snap, onSave) {
      const room = new RoomHost(snap.code, onSave);
      const { rematch, players, ...rest } = snap;
      Object.assign(room, rest);
      room.rematch = new Set(rematch);
      for (const c of [1, 2]) room.players[c] = players[c] && { ...players[c], link: null };
      room.startTurnTimer();
      room.scheduleAi();
      return room;
    }
  }

  const api = { RoomHost, walk, reachable, hasLegalMove, checkWin };
  if (typeof module !== 'undefined') module.exports = api;
  else root.OmokGame = api;
})(typeof self !== 'undefined' ? self : this);
