'use strict';
// 오목 AI. 사람과 같은 규칙으로 움직이도록 reachable(board) 가 알려 준 칸에만 둔다.
const N = 15;
const LINES = [[1, 0], [0, 1], [1, 1], [1, -1]];
// 이 칸에 두었을 때 5칸 묶음 안에 같은 색 돌이 몇 개 있는가에 따른 점수 (0개 ~ 4개 있던 묶음)
const WEIGHT = [1, 12, 150, 2000, 100000];
const FIVE = WEIGHT[4];
const SEARCH_DEPTH = 3;
const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

// (x,y)를 지나는 모든 5칸 묶음을 살펴, 내 공격 점수와 상대 수비 점수를 더한다
function scoreCell(board, x, y, color) {
  const opp = 3 - color;
  let attack = 0, defend = 0;
  for (const [dx, dy] of LINES) {
    for (let start = -4; start <= 0; start++) {
      let mine = 0, theirs = 0, ok = true;
      for (let i = start; i < start + 5; i++) {
        const a = x + dx * i, b = y + dy * i;
        if (!inside(a, b)) { ok = false; break; }
        if (board[b][a] === color) mine++;
        else if (board[b][a] === opp) theirs++;
      }
      if (!ok) continue;
      if (theirs === 0) attack += WEIGHT[mine];
      if (mine === 0) defend += WEIGHT[theirs];
    }
  }
  return { attack, defend };
}

// 둘 수 있는 칸마다 점수를 매겨 좋은 순서로 정렬 (같은 점수면 매번 다른 칸을 고르도록 살짝 흔든다)
function ranked(board, color, reachable, defendRate = 1) {
  return reachable(board)
    .map((m) => {
      const { attack, defend } = scoreCell(board, m.x, m.y, color);
      return { ...m, attack, defend, value: attack * 1.1 + defend * defendRate + Math.random() };
    })
    .sort((a, b) => b.value - a.value);
}

// 판 전체 점수: 5칸 묶음마다 한쪽 색만 있으면 그 색에게 유리하다
const BOARD_VALUE = [0, 1, 10, 100, 1000];
function evaluate(board, color) {
  let score = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (const [dx, dy] of LINES) {
    if (!inside(x + dx * 4, y + dy * 4)) continue;
    let mine = 0, theirs = 0;
    for (let i = 0; i < 5; i++) {
      const c = board[y + dy * i][x + dx * i];
      if (c === color) mine++; else if (c !== 0) theirs++;
    }
    if (!theirs) score += BOARD_VALUE[mine];
    else if (!mine) score -= BOARD_VALUE[theirs];
  }
  return score;
}

// 어려움: 좋은 후보만 골라 번갈아 놓아 보며 몇 수 앞을 읽는다 (알파-베타 탐색)
const WIN_VALUE = 1e7;
function search(board, color, depth, alpha, beta, reachable) {
  const moves = ranked(board, color, reachable);
  if (!moves.length) return 0;
  if (moves.some((m) => m.attack >= FIVE)) return WIN_VALUE + depth; // 빨리 이길수록 좋다
  if (depth === 0) return evaluate(board, color);
  const blocks = moves.filter((m) => m.defend >= FIVE);
  let best = -Infinity;
  for (const m of blocks.length ? blocks.slice(0, 2) : moves.slice(0, 8)) {
    board[m.y][m.x] = color;
    const value = -search(board, 3 - color, depth - 1, -beta, -alpha, reachable);
    board[m.y][m.x] = 0;
    if (value > best) best = value;
    if (value > alpha) alpha = value;
    if (alpha >= beta) break;
  }
  return best;
}
function lookAhead(board, color, moves, reachable) {
  let best = null, alpha = -Infinity;
  for (const m of moves.slice(0, 10)) {
    board[m.y][m.x] = color;
    const value = -search(board, 3 - color, SEARCH_DEPTH, -Infinity, -alpha, reachable);
    board[m.y][m.x] = 0;
    if (value > alpha) { alpha = value; best = m; }
  }
  return best;
}

// level: 'easy' | 'normal' | 'hard'. 돌려주는 값의 steps 는 사람의 이동 기록과 형식이 같다.
function chooseMove(board, color, level, reachable) {
  const easy = level === 'easy';
  const moves = ranked(board, color, reachable, easy ? 0.5 : 1);
  if (!moves.length) return null;
  const win = moves.find((m) => m.attack >= FIVE);
  if (win) return win;
  const block = moves.find((m) => m.defend >= FIVE);
  if (block && (!easy || Math.random() < 0.5)) return block;
  if (easy) return moves[Math.floor(Math.random() * Math.min(6, moves.length))];
  return level === 'hard' ? lookAhead(board, color, moves, reachable) : moves[0];
}

module.exports = { chooseMove };
