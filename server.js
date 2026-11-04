'use strict';
// 파이썬 오목 서버: 정적 파일 + WebSocket(방 만들기 / 입장 / 대전)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const { chooseMove } = require('./ai');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const N = 15;
const TURN_SECONDS = Number(process.env.TURN_SECONDS) || 120; // 한 턴 제한 시간
const MAX_STEPS = 400;                                          // 한 턴 최대 이동 칸 수
const MAX_SKIPS = 2;                                            // 시간 초과 연속 N번이면 패배
const AI_DELAY = Number(process.env.AI_DELAY) || 900;           // AI 가 두기 전에 기다리는 시간(ms)
const MAX_ROOMS = 1000;                                         // 동시에 열 수 있는 방 수
const AI_LEVELS = { easy: '쉬움', normal: '보통', hard: '어려움' };
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); }
  catch { res.writeHead(400); return res.end('bad request'); }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- 게임 로직 ----------
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const emptyBoard = () => Array.from({ length: N }, () => Array(N).fill(0));

function newRoom() {
  const room = {
    code: makeCode(),
    players: { 1: null, 2: null },
    rematch: new Set(),
    updated: Date.now(),
  };
  resetGame(room);
  rooms.set(room.code, room);
  return room;
}
function resetGame(room) {
  room.board = emptyBoard();
  room.turn = 1;
  room.status = room.players[1] && room.players[2] ? 'playing' : 'waiting';
  room.winner = 0;
  room.winLine = null;
  room.last = null;
  room.moves = 0;
  room.rematch.clear();
  room.skips = { 1: 0, 2: 0 };
  room.reason = '';
  room.notice = null;
  startTurnTimer(room);
}

// ---------- 턴 타이머 (서버가 관리) ----------
function startTurnTimer(room) {
  clearTimeout(room.timer);
  room.timer = null;
  // AI 대전은 연습이므로 시간 제한이 없다
  if (room.status !== 'playing' || room.ai) { room.deadline = 0; return; }
  room.deadline = Date.now() + TURN_SECONDS * 1000;
  room.timer = setTimeout(() => onTimeout(room), TURN_SECONDS * 1000 + 50);
}
function onTimeout(room) {
  if (room.status !== 'playing') return;
  const c = room.turn, other = c === 1 ? 2 : 1;
  room.skips[c]++;
  if (room.skips[c] >= MAX_SKIPS) {
    room.status = 'over'; room.winner = other; room.reason = 'timeout';
    room.deadline = 0;
    room.notice = { id: Date.now(), icon: 'alarm-clock', msg: '시간 초과가 ' + MAX_SKIPS + '번 반복되어 ' + (room.players[c]?.name || '') + ' 님이 패배했어요.' };
  } else {
    room.turn = other;
    room.notice = { id: Date.now(), icon: 'alarm-clock', msg: (room.players[c]?.name || '') + ' 님이 시간 초과! 차례가 넘어갔어요. (' + room.skips[c] + '/' + MAX_SKIPS + ')' };
    startTurnTimer(room);
  }
  broadcast(room);
}

// 이동 경로를 서버가 직접 걸어 보며 검증. 시작은 1-1 = (0,0)
//  대문자 R/L/D/U = 빈 칸으로 한 칸 이동
//  소문자 r/l/d/u = 바로 앞에 이어진 돌들을 건너뛰어 첫 빈 칸에 착지 (jump)
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
// 둘 수 있는 칸이 하나도 없으면 교착 = 무승부 처리
const hasLegalMove = (board) => reachable(board).length > 0;

// (x,y)에 놓은 돌 기준으로 5목 이상이면 해당 칸들을 반환
function checkWin(board, x, y) {
  const c = board[y][x];
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const cells = [{ x, y }];
    for (const s of [1, -1]) {
      let nx = x + dx * s, ny = y + dy * s;
      while (nx >= 0 && ny >= 0 && nx < N && ny < N && board[ny][nx] === c) {
        cells.push({ x: nx, y: ny });
        nx += dx * s; ny += dy * s;
      }
    }
    if (cells.length >= 5) return cells;
  }
  return null;
}

// 사람과 AI 가 함께 쓰는 착수 처리. 경로가 규칙에 맞지 않으면 false
function applyMove(room, color, steps) {
  const pos = walk(room.board, steps);
  if (!pos) return false;
  const { x, y } = pos;
  room.board[y][x] = color;
  room.last = { x, y };
  room.moves++;
  room.skips[color] = 0;
  room.notice = null;
  const line = checkWin(room.board, x, y);
  if (line) { room.status = 'over'; room.winner = color; room.winLine = line; room.deadline = 0; }
  else if (room.moves >= N * N) { room.status = 'over'; room.winner = 0; room.deadline = 0; }
  else if (!hasLegalMove(room.board)) {
    // 아무도 더 둘 수 없는 교착 상태 → 시간 초과 패배 대신 무승부
    room.status = 'over'; room.winner = 0; room.reason = 'stalemate'; room.deadline = 0;
    room.notice = { id: Date.now(), icon: 'handshake', msg: '더 이상 돌을 놓을 수 있는 칸에 닿을 수 없어서 무승부로 끝났어요.' };
  }
  else room.turn = color === 1 ? 2 : 1;
  startTurnTimer(room);
  return true;
}
// AI 차례면 잠시 뒤에 둔다
function scheduleAi(room) {
  clearTimeout(room.aiTimer);
  const isAiTurn = () => room.status === 'playing' && !!room.players[room.turn]?.ai;
  if (!isAiTurn()) return;
  room.aiTimer = setTimeout(() => {
    if (!isAiTurn()) return;
    const move = chooseMove(room.board, room.turn, room.ai, reachable);
    if (move && applyMove(room, room.turn, move.steps)) broadcast(room);
  }, AI_DELAY);
}
function deleteRoom(room) {
  clearTimeout(room.timer);
  clearTimeout(room.aiTimer);
  rooms.delete(room.code);
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(room) {
  room.updated = Date.now();
  for (const color of [1, 2]) {
    const p = room.players[color];
    if (!p) continue;
    send(p.ws, {
      t: 'state',
      room: room.code,
      you: color,
      status: room.status,
      board: room.board,
      turn: room.turn,
      winner: room.winner,
      winLine: room.winLine,
      last: room.last,
      deadline: room.deadline || 0,
      now: Date.now(),
      turnSeconds: TURN_SECONDS,
      reason: room.reason,
      notice: room.notice,
      skips: room.skips,
      names: { 1: room.players[1]?.name || null, 2: room.players[2]?.name || null },
      online: { 1: !!(room.players[1]?.ws || room.players[1]?.ai), 2: !!(room.players[2]?.ws || room.players[2]?.ai) },
      rematch: [...room.rematch],
      ai: room.ai || null,
      aiColor: room.players[1]?.ai ? 1 : room.players[2]?.ai ? 2 : 0,
    });
  }
}
const cleanName = (n) => String(n || '').replace(/[<>]/g, '').trim().slice(0, 12) || '익명';
const newToken = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

// 호스팅 서비스가 조용한 연결을 끊지 않도록 주기적으로 신호를 보낸다
setInterval(() => { for (const c of wss.clients) if (c.readyState === 1) c.ping(); }, 30 * 1000).unref();

wss.on('connection', (ws) => {
  ws.room = null;
  ws.color = 0;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'create') {
      if (ws.room) return;
      if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', msg: '지금은 방이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.' });
      const room = newRoom();
      const token = newToken();
      room.players[1] = { token, name: cleanName(m.name), ws };
      ws.room = room; ws.color = 1;
      // AI 대전: 사람이 흑(선공)으로 시작하고, 다시 하기를 누를 때마다 선공이 바뀐다
      if (Object.keys(AI_LEVELS).includes(m.ai)) {
        room.ai = m.ai;
        room.players[2] = { token: null, name: 'AI (' + AI_LEVELS[m.ai] + ')', ws: null, ai: true };
        room.status = 'playing';
      }
      send(ws, { t: 'joined', room: room.code, token, you: 1 });
      broadcast(room);
      return;
    }

    if (m.t === 'join') {
      if (ws.room) return;
      const room = rooms.get(String(m.room || '').toUpperCase());
      if (!room) return send(ws, { t: 'error', code: 'no_room', room: String(m.room || '').toUpperCase(), msg: '그런 방이 없어요. 코드를 다시 확인해 주세요.' });
      // 재접속(토큰 일치)
      for (const color of [1, 2]) {
        const p = room.players[color];
        if (p && m.token && p.token === m.token) {
          if (p.ws && p.ws !== ws) { p.ws.room = null; try { p.ws.close(); } catch {} }
          p.ws = ws; ws.room = room; ws.color = color;
          send(ws, { t: 'joined', room: room.code, token: p.token, you: color });
          return broadcast(room);
        }
      }
      if (room.players[2]) return send(ws, { t: 'error', msg: '방이 가득 찼어요. (1:1 대결 방이에요)' });
      const token = newToken();
      room.players[2] = { token, name: cleanName(m.name), ws };
      ws.room = room; ws.color = 2;
      room.status = 'playing';
      startTurnTimer(room);
      send(ws, { t: 'joined', room: room.code, token, you: 2 });
      broadcast(room);
      return;
    }

    const room = ws.room;
    if (!room) return;

    if (m.t === 'move') {
      if (room.status !== 'playing') return send(ws, { t: 'error', msg: '지금은 돌을 둘 수 없어요.' });
      if (room.turn !== ws.color) return send(ws, { t: 'error', msg: '내 차례가 아니에요.' });
      if (!applyMove(room, ws.color, m.steps)) return send(ws, { t: 'error', msg: '이동 경로가 규칙에 맞지 않아요. (1-1 에서 출발, 빈 칸으로 한 칸씩 또는 이어진 돌 건너뛰기, 최대' + MAX_STEPS + '칸)' });
      broadcast(room);
      return scheduleAi(room);
    }

    if (m.t === 'rematch') {
      if (room.status !== 'over') return;
      room.rematch.add(ws.color);
      if (room.ai) room.rematch.add(ws.color === 1 ? 2 : 1); // AI 는 언제나 수락
      if (room.rematch.size === 2) {
        // 선공 교대
        [room.players[1], room.players[2]] = [room.players[2], room.players[1]];
        for (const c of [1, 2]) if (room.players[c]?.ws) room.players[c].ws.color = c;
        resetGame(room);
      }
      broadcast(room);
      return scheduleAi(room);
    }

    if (m.t === 'leave') {
      const p = room.players[ws.color];
      ws.room = null; ws.color = 0;
      // 기다리는 상대가 없는 방은 바로 없앤다. 사람과 끝난 판이면 상대에게 나갔다고 보여 준다.
      if (room.ai || room.status === 'waiting') return deleteRoom(room);
      if (p && p.ws === ws) { p.ws = null; broadcast(room); }
    }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    const p = room.players[ws.color];
    if (p && p.ws === ws) { p.ws = null; broadcast(room); }
  });
});

// 오래 비어 있는 방 정리
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const online = [1, 2].some((c) => room.players[c]?.ws);
    if (!online && now - room.updated > 30 * 60 * 1000) deleteRoom(room);
  }
}, 60 * 1000).unref();

if (require.main === module) server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n파이썬 오목 서버 시작!`);
  console.log(`   내 컴퓨터:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || [])
      if (i.family === 'IPv4' && !i.internal) console.log(`   같은 와이파이: http://${i.address}:${PORT}`);
  console.log('');
});

module.exports = { walk, reachable, hasLegalMove, checkWin };
