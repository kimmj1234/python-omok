'use strict';
// AI 끼리 대국: 모든 수가 서버 규칙(walk)을 통과하는지, 난이도 순서가 맞는지, 한 수에 얼마나 걸리는지 확인
const ROOT = '../';
const { walk, reachable, hasLegalMove, checkWin } = require(ROOT + 'server.js');
const { chooseMove } = require(ROOT + 'ai.js');
const N = 15;
const empty = () => Array.from({ length: N }, () => Array(N).fill(0));

// 1. reachable 이 돌려준 경로는 전부 walk 를 통과하고 같은 칸에 도착해야 한다
{
  let checked = 0, bad = 0;
  for (let g = 0; g < 40; g++) {
    const b = empty();
    for (let i = 0; i < 120; i++) {
      const cells = reachable(b);
      for (const c of cells) {
        checked++;
        const p = walk(b, c.steps);
        if (!p || p.x !== c.x || p.y !== c.y) bad++;
      }
      if (!cells.length) break;
      const c = cells[Math.floor(Math.random() * cells.length)];
      b[c.y][c.x] = i % 2 + 1;
    }
  }
  console.log(`경로 검증: ${checked}개 중 불일치 ${bad}개`);
}

// 2. 이미 있는 교착 판정 유지
{
  const b = empty();
  for (let i = 0; i < N; i++) { b[0][i] = 1; b[i][0] = 2; }
  console.log('1행·1열 가득 → hasLegalMove:', hasLegalMove(b), '(false 여야 함)');
  const c = empty(); c[0][0] = 1; c[0][1] = 2; c[1][0] = 2;
  console.log('출구 막힘 → hasLegalMove:', hasLegalMove(c), '(true 여야 함, jump 가능)');
}

// 3. 반드시 이기기 / 반드시 막기
{
  for (const lv of ['normal', 'hard']) {
    const w = empty(); for (let i = 3; i < 7; i++) w[5][i] = 1; w[9][9] = 2; w[9][10] = 2;
    const m = chooseMove(w, 1, lv, reachable);
    const b = empty(); for (let i = 3; i < 7; i++) b[5][i] = 2; b[9][9] = 1;
    const n = chooseMove(b, 1, lv, reachable);
    console.log(`${lv}: 이기는 수 (${m.x},${m.y}) / 막는 수 (${n.x},${n.y}) — 행 5, x=2 또는 7 이어야 함`);
  }
}

// 4. 대국
function play(black, white) {
  const b = empty();
  let turn = 1, moves = 0, slowest = 0;
  for (;;) {
    const t = process.hrtime.bigint();
    const lv = turn === 1 ? black : white;
    const m = chooseMove(b, turn, lv, reachable);
    slowest = Math.max(slowest, Number(process.hrtime.bigint() - t) / 1e6);
    if (!m) return { winner: 0, moves, slowest, illegal: false };
    const p = walk(b, m.steps);
    if (!p || b[p.y][p.x] !== 0) return { winner: 0, moves, slowest, illegal: true };
    b[p.y][p.x] = turn; moves++;
    if (checkWin(b, p.x, p.y)) return { winner: turn, moves, slowest, illegal: false };
    if (moves >= N * N || !hasLegalMove(b)) return { winner: 0, moves, slowest, illegal: false };
    turn = 3 - turn;
  }
}
const GAMES = 30;
for (const [a, c] of [['easy', 'easy'], ['normal', 'easy'], ['hard', 'easy'], ['hard', 'normal'], ['normal', 'normal'], ['hard', 'hard']]) {
  let aw = 0, cw = 0, dr = 0, ill = 0, len = 0, slow = 0;
  for (let g = 0; g < GAMES; g++) {
    const aBlack = g % 2 === 0;
    const r = aBlack ? play(a, c) : play(c, a);
    if (r.illegal) ill++;
    len += r.moves; slow = Math.max(slow, r.slowest);
    if (r.winner === 0) dr++;
    else if ((r.winner === 1) === aBlack) aw++;
    else cw++;
  }
  console.log(`${a} vs ${c}: ${aw}승 ${cw}패 ${dr}무, 평균 ${(len / GAMES).toFixed(0)}수, 위반 ${ill}, 가장 느린 수 ${slow.toFixed(0)}ms`);
}
process.exit(0);
