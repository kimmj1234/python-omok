'use strict';
// ============================================================
//  파이썬 오목 - 클라이언트
//  학습 모드(단계별 파이썬 수업) + 대전 모드(친구 1:1, AI)
// ============================================================
const N = 15;
const $ = (s) => document.querySelector(s);
const emptyBoard = () => Array.from({ length: N }, () => Array(N).fill(0));
const cloneBoard = (b) => b.map((r) => r.slice());
// 아이콘(public/icons 의 Lucide SVG)
const ic = (name) => `<i class="ic" style="--ic:url(icons/${String(name).replace(/[^a-z-]/g, '')}.svg)"></i>`;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
// 방 재접속 토큰은 "탭마다" 따로 보관 (같은 브라우저의 탭 두 개가 같은 사람으로 섞이지 않게)
const tabStore = {
  get(k, d) { try { const v = sessionStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
  remove(k) { try { sessionStorage.removeItem(k); } catch {} },
};

// ---------- 5목 찾기 (학습 단계 검사용) ----------
function findLine(placed, board, color) {
  const b = cloneBoard(board);
  placed.forEach((p) => { b[p.y - 1][p.x - 1] = color; }); // placed 는 1부터 시작하는 좌표
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let k = 0;
      while (k < 5) {
        const nx = x + dx * k, ny = y + dy * k;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N || b[ny][nx] !== color) break;
        k++;
      }
      if (k === 5) return { dx, dy, cells: Array.from({ length: 5 }, (_, i) => ({ x: x + dx * i, y: y + dy * i })) };
    }
  }
  return null;
}

// ============================================================
//  학습 단계 정의
// ============================================================
const has = (r, x, y) => r.placed.some((p) => p.x === x && p.y === y);
const at = (r, x, y) => !!r.stone && r.stone[0] === x && r.stone[1] === y;
const where = (r) => (r.stone ? `${r.stone[0]}-${r.stone[1]}` : '없음');
const boardWith = (cells, color = 2) => () => { const b = emptyBoard(); cells.forEach(([x, y]) => { b[y - 1][x - 1] = color; }); return b; };

// 좌표는 모두 "가로-세로" 1부터 시작. 1-1 이 왼쪽 위.
const LEVELS = [
  {
    title: '1. print() 로 돌 만들기',
    body: `<p>파이썬에서 화면에 글자를 내보내는 명령이 <code>print()</code> 예요.<br>
      이 게임에서는 <code>print("돌")</code> 이라고 쓰면 <b>왼쪽 위 1-1 칸에 임시 돌이 생겨요!</b>
      (반투명 돌은 아직 확정 전이에요)</p><pre>print("돌")</pre>`,
    goal: '<code>print("돌")</code> 을 쓰고 실행 버튼을 눌러서 <b>1-1</b> 에 임시 돌을 만드세요.',
    starter: '# 아래에 print("돌") 을 써 보세요\n',
    hint: '글자는 따옴표 "" 로 감싸야 해요. 괄호도 잊지 마세요: print("돌")',
    solution: 'print("돌")',
    board: emptyBoard,
    check: (r) => (r.stone ? null : '임시 돌이 아직 없어요. print("돌") 을 실행해 보세요.'),
  },
  {
    title: '2. 돌 움직이기',
    body: `<p>임시 돌은 함수로 움직여요. 한 번 부를 때마다 <b>한 칸</b>씩 가요.</p>
      <pre>right()   # 오른쪽 →\nleft()    # 왼쪽 ←\ndown()    # 아래 ↓\nup()      # 위 ↑</pre>
      <p>코드는 위에서 아래로 <b>차례대로</b> 실행돼요. 돌의 자취가 점선으로 보여요.</p>`,
    goal: '임시 돌을 <b>5-3</b> 까지 움직이세요. (오른쪽 4번, 아래 2번)',
    starter: 'print("돌")\nright()\n',
    hint: 'right() 를 4번, down() 을 2번 쓰면 돼요. 같은 줄을 여러 번 써도 돼요 (다음 단계에서 더 쉬운 방법을 배워요!)',
    solution: 'print("돌")\nright()\nright()\nright()\nright()\ndown()\ndown()',
    board: emptyBoard,
    check: (r) => (at(r, 5, 3) ? null : `지금 돌은 ${where(r)} 에 있어요. 목표는 5-3!`),
  },
  {
    title: '3. for 반복문',
    body: `<p>같은 일을 여러 번 시킬 땐 <code>for</code>! <code>range(3)</code> 은 "3번 반복"이에요.
      들여쓰기(스페이스 4칸)된 줄이 반복돼요.</p>
      <pre>for i in range(3):\n    right()</pre>`,
    goal: '<b>for</b> 반복문으로 돌을 <b>10-6</b> 까지 보내세요. (오른쪽 9번, 아래 5번)',
    starter: 'print("돌")\nfor i in range(9):\n    right()\n# 아래로도 이동해 보세요\n',
    hint: '반복문을 하나 더 만들어요: for i in range(5): 아래에 down()',
    solution: 'print("돌")\nfor i in range(9):\n    right()\nfor i in range(5):\n    down()',
    board: emptyBoard,
    check: (r) => {
      if (!/\bfor\b|\bwhile\b/.test(r.code)) return 'for 반복문을 사용해 주세요.';
      return at(r, 10, 6) ? null : `지금 돌은 ${where(r)} 에 있어요. 목표는 10-6!`;
    },
  },
  {
    title: '4. place() 로 돌 확정하기',
    body: `<p><code>place()</code> 를 부르면 임시 돌이 <b>지금 있는 자리에 진짜로 놓여요.</b>
      놓은 뒤에는 임시 돌이 사라지니까, 또 두려면 <code>print("돌")</code> 부터 다시!</p>
      <pre>print("돌")\nright()\nplace()   # 2-1 에 확정</pre>`,
    goal: '돌을 <b>6-6</b> 으로 옮긴 뒤 <code>place()</code> 로 놓으세요. (반복문 사용!)',
    starter: 'print("돌")\nfor i in range(5):\n    right()\n# 아래로도 가서 place() 하세요\n',
    hint: 'for 로 down() 을 5번 하고 마지막에 place() — place() 는 반복문 밖에 써야 해요(들여쓰기 없이).',
    solution: 'print("돌")\nfor i in range(5):\n    right()\n    down()\nplace()',
    board: emptyBoard,
    check: (r) => (has(r, 6, 6) ? null : '6-6 에 돌이 놓이지 않았어요.'),
  },
  {
    title: '5. if 와 blocked() - 막힌 길',
    body: `<p>이동하는 길에 <b>이미 돌이 있으면</b> 그 칸으론 갈 수 없고 에러가 나요!<br>
      <code>blocked("right")</code> 는 "오른쪽 바로 앞이 돌이나 벽이면 <b>True</b>" 를 알려줘요.
      <code>if</code> 는 "만약 ~라면" 이에요.</p>
      <pre>if blocked("right"):\n    down()      # 막혔으면 아래로\nright()</pre>`,
    goal: '<b>4-1</b> 에 흰 돌이 있어요. 돌을 <b>가로 8번째 칸(x=8)</b> 까지 보내세요. (오른쪽으로 7번 가야 해요. 에러 없이!)',
    starter: 'print("돌")\nfor i in range(7):\n    # 막혔을 때만 아래로 내려가도록 if 를 쓰세요\n    right()\n',
    hint: 'for 안에서 right() 앞에: if blocked("right"):  →  down()',
    solution: 'print("돌")\nfor i in range(7):\n    if blocked("right"):\n        down()\n    right()',
    board: boardWith([[4, 1]]),
    check: (r) => {
      if (!/\bif\b/.test(r.code) || !/blocked/.test(r.code)) return 'if blocked(...) 를 사용해 주세요.';
      return r.stone && r.stone[0] === 8 ? null : `지금 돌은 ${where(r)} 에 있어요. 가로 8번째 칸까지 가야 해요.`;
    },
  },
  {
    title: '6. else 와 jump() - 돌 건너뛰기',
    body: `<p><code>jump("right")</code> 는 바로 앞에 이어진 돌들을 <b>한 번에 건너뛰어</b> 첫 빈 칸에 착지해요.
      <code>else:</code> 는 "그렇지 않으면" 이에요.</p>
      <pre>if blocked("right"):\n    jump("right")   # 막혔으면 건너뛰기\nelse:\n    right()         # 아니면 한 칸</pre>`,
    goal: '<b>4-1, 5-1</b> 에 돌이 있어요. 아래로 내려가지 말고 <code>if</code> / <code>else</code> 와 <code>jump</code> 로 건너뛰어 돌을 <b>8-1</b> 까지 보내세요.',
    starter: 'print("돌")\nfor i in range(5):\n    # 막혔으면 jump, 아니면 right\n    pass\n',
    hint: 'for 안에 if blocked("right"): 를 쓰고 그 안에 jump("right"), else: 안에 right()',
    solution: 'print("돌")\nfor i in range(5):\n    if blocked("right"):\n        jump("right")\n    else:\n        right()',
    board: boardWith([[4, 1], [5, 1]]),
    check: (r) => {
      if (!/\belse\b/.test(r.code) || !/jump/.test(r.code)) return 'if / else 와 jump 를 사용해 주세요.';
      return at(r, 8, 1) ? null : `지금 돌은 ${where(r)} 에 있어요. 목표는 8-1!`;
    },
  },
  {
    title: '7. while 과 get_x()',
    body: `<p>건너뛰면 몇 번 움직일지 세기 어렵죠? <code>while 조건:</code> 은 조건이 참인 <b>동안 계속</b> 반복해요.<br>
      <code>get_x()</code>, <code>get_y()</code> 는 지금 돌의 가로/세로 위치를 알려줘요.</p>
      <pre>while get_x() &lt; 5:   # 가로 5번째 칸에 닿을 때까지\n    right()</pre>`,
    goal: '<b>3-1, 4-1, 7-1</b> 에 돌이 있어요. <code>while</code> 과 <code>if blocked</code> 로 돌을 <b>10-1</b> 까지 보내서 <code>place()</code> 하세요.',
    starter: 'print("돌")\nwhile get_x() < 10:\n    # 막혔으면 jump, 아니면 right\n    pass\n# 다 왔으면 place()\n',
    hint: 'while 안은 6단계와 똑같아요. place() 는 while 밖에(들여쓰기 없이) 쓰세요.',
    solution: 'print("돌")\nwhile get_x() < 10:\n    if blocked("right"):\n        jump("right")\n    else:\n        right()\nplace()',
    board: boardWith([[3, 1], [4, 1], [7, 1]]),
    check: (r) => {
      if (!/\bwhile\b/.test(r.code)) return 'while 을 사용해 주세요.';
      if (!/blocked/.test(r.code)) return 'blocked() 로 막힌 길을 확인해 주세요.';
      return has(r, 10, 1) ? null : '10-1 에 돌이 놓이지 않았어요.';
    },
  },
  {
    title: '8. 오목 완성하기!',
    body: `<p>이제 모든 걸 합칠 시간! 돌 하나 만들고(<code>print</code>) → 움직이고 → <code>place()</code>
      하는 과정을 <b>반복문 안에 넣으면</b> 여러 개를 놓을 수 있어요. 반복문 안의 반복문도 가능해요!</p>`,
    goal: '돌 <b>5개를 한 줄로 연속</b>해서 놓아 오목을 완성하세요! (가로·세로·대각선 모두 가능. 힌트: 매번 print("돌") 부터!)',
    starter: 'for n in range(5):\n    print("돌")\n    # n 번 오른쪽, n 번 아래로 움직인 뒤 place()\n',
    hint: 'n번째 돌은 오른쪽 n칸, 아래 n칸 이동하면 대각선(1-1, 2-2, 3-3 …)이 돼요. 안쪽 반복문 두 개 + place()',
    solution: 'for n in range(5):\n    print("돌")\n    for i in range(n):\n        right()\n    for i in range(n):\n        down()\n    place()',
    board: emptyBoard,
    check: (r) => (findLine(r.placed, r.baseBoard, 1) ? null : '아직 5개가 연속으로 이어지지 않았어요.'),
  },
];

// ============================================================
//  파이썬 워커 관리
// ============================================================
let worker = null, pending = null, seq = 0, engineReady = false;

function setEngine(state, text) {
  const el = $('#engine');
  el.className = 'engine ' + state;
  el.innerHTML = text;
  engineReady = state === 'ok';
  $('#runBtn').disabled = !engineReady;
}
function startWorker() {
  setEngine('loading', '파이썬 엔진 로딩 중…');
  worker = new Worker('pyworker.js');
  worker.onmessage = (e) => {
    const d = e.data;
    if (d.type === 'ready') return setEngine('ok', ic('circle-check') + '파이썬 준비 완료');
    if (d.type === 'fail') return setEngine('fail', '엔진 로딩 실패 (인터넷 확인)');
    if (d.type === 'result' && pending && d.id === pending.id) {
      clearTimeout(pending.timer);
      const p = pending; pending = null;
      p.resolve(d);
    }
  };
}
function runPy(payload) {
  return new Promise((resolve) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      worker.terminate();
      pending = null;
      startWorker();
      resolve({ ok: false, timeout: true, error: '5초 안에 끝나지 않았어요. 무한 반복(while True 등)이 아닌지 확인해 보세요!', out: [], placed: [], ghost: false });
    }, 5000);
    pending = { id, resolve, timer };
    worker.postMessage({ id, ...payload });
  });
}

// ============================================================
//  에디터 / 콘솔
// ============================================================
const editor = CodeMirror.fromTextArea($('#code'), {
  mode: 'python', theme: 'material-darker', lineNumbers: true, indentUnit: 4, smartIndent: true,
  extraKeys: {
    'Ctrl-Enter': () => run(), 'Cmd-Enter': () => run(),
    Tab: (cm) => (cm.somethingSelected() ? cm.indentSelection('add') : cm.execCommand('insertSoftTab')),
    // 줄 앞의 들여쓰기 안에서는 Backspace 한 번에 한 단계(4칸)를 지운다
    Backspace: (cm) => {
      if (cm.somethingSelected()) return CodeMirror.Pass;
      const c = cm.getCursor(), before = cm.getLine(c.line).slice(0, c.ch);
      if (!/^ +$/.test(before)) return CodeMirror.Pass;
      cm.replaceRange('', { line: c.line, ch: c.ch - ((before.length - 1) % 4 + 1) }, c);
    },
  },
});
function logConsole(lines, cls = '') {
  const c = $('#console');
  c.innerHTML = '';
  lines.forEach((l) => {
    const s = document.createElement('div');
    if (cls) s.className = cls;
    s.textContent = l;
    c.appendChild(s);
  });
  c.scrollTop = c.scrollHeight;
}
function appendConsole(text, cls, icon) {
  const s = document.createElement('div');
  s.className = cls; s.textContent = text;
  if (icon) s.insertAdjacentHTML('afterbegin', ic(icon));
  $('#console').appendChild(s);
  $('#console').scrollTop = $('#console').scrollHeight;
}
function showResult(res) {
  const c = $('#console');
  c.innerHTML = '';
  if (res.out.length) res.out.forEach((l) => appendConsole(l, ''));
  else appendConsole('(출력 없음)', 'dim');
  if (res.error) appendConsole(res.error, 'err', 'circle-x');
}

// ============================================================
//  상태
// ============================================================
let mode = 'learn';
const learn = {
  level: store.get('pyomok.v2.level', 0),
  solved: new Set(store.get('pyomok.v2.solved', [])),
  codes: store.get('pyomok.v2.codes', {}),
  board: emptyBoard(), ghost: null, path: [],
};
const match = {
  net: null, online: false, pending: null, room: null, token: null, state: null, ghost: null, path: [], code: null, msg: '',
  nick: store.get('pyomok.nick', ''), lastKey: '',
};
const MATCH_STARTER =
`# 내 차례! 어디에 둘지는 직접 정해 보세요
print("돌")        # 1-1 에 임시 돌이 생겨요

# 여기에 반복문과 조건문으로 돌을 움직이세요


# place()      # 마음에 들면 앞의 # 을 지우고 실행 → 진짜로 놓기
`;

// ============================================================
//  학습 모드
// ============================================================
function renderLessonPanel() {
  const L = LEVELS[learn.level];
  const total = LEVELS.length, doneCnt = learn.solved.size;
  const nav = LEVELS.map((lv, i) => {
    const done = learn.solved.has(i), cur = i === learn.level;
    const conn = i < total - 1 ? `<span class="conn ${done ? 'done' : ''}"></span>` : '';
    return `<button class="lv ${cur ? 'cur' : ''} ${done ? 'done' : ''}" data-i="${i}" title="${esc(lv.title)}">${done ? ic('check') : i + 1}</button>${conn}`;
  }).join('');
  const title = L.title.replace(/^\d+\.\s*/, '');
  $('#lessonPanel').innerHTML =
    `<div class="lvhead"><span class="step">STEP ${learn.level + 1}<small> / ${total}</small></span>
      <span class="prog"><i style="width:${Math.round((doneCnt / total) * 100)}%"></i></span>
      <span class="cnt">${doneCnt}/${total} 완료</span></div>
    <div class="levels">${nav}</div><h2>${title}</h2>${L.body}<div class="goal">${ic('target')}${L.goal}</div>`;
  $('#lessonPanel').querySelectorAll('.lv').forEach((b) => (b.onclick = () => gotoLevel(+b.dataset.i)));
}
function gotoLevel(i) {
  saveLearnCode();
  learn.level = i;
  store.set('pyomok.v2.level', i);
  learn.board = LEVELS[i].board();
  learn.ghost = null; learn.path = [];
  editor.setValue(learn.codes[i] ?? LEVELS[i].starter);
  renderLessonPanel();
  logConsole(['(실행 버튼을 눌러 보세요)'], 'dim');
  draw();
}
function saveLearnCode() {
  learn.codes[learn.level] = editor.getValue();
  store.set('pyomok.v2.codes', learn.codes);
}
function gradeLearn(res, code, baseBoard) {
  const L = LEVELS[learn.level];
  const r = { ...res, code, baseBoard };
  const fail = L.check(r);
  if (fail) { appendConsole(fail, 'info', 'info'); return; }
  learn.solved.add(learn.level);
  store.set('pyomok.v2.solved', [...learn.solved]);
  appendConsole('클리어! 잘했어요', 'ok', 'circle-check');
  renderLessonPanel();
  if (learn.level < LEVELS.length - 1) {
    const b = document.createElement('button');
    b.className = 'primary'; b.innerHTML = '다음 단계' + ic('chevron-right'); b.style.marginTop = '6px';
    b.onclick = () => gotoLevel(learn.level + 1);
    $('#console').appendChild(b);
  } else {
    appendConsole('모든 단계 완료! 이제 "대전"에서 코드로 승부하세요.', 'ok', 'trophy');
  }
}

// ============================================================
//  실행
// ============================================================
async function run() {
  if (!engineReady) return;
  const code = editor.getValue();
  $('#runBtn').disabled = true;
  try {
    if (mode === 'learn') {
      saveLearnCode();
      const base = LEVELS[learn.level].board();
      const res = await runPy({ code, board: base, me: 1, canPlace: true, maxPlace: 60 });
      learn.board = cloneBoard(base);
      res.placed.forEach((p) => { learn.board[p.y - 1][p.x - 1] = 1; });
      learn.ghost = ghostFrom(res);
      learn.path = res.path || [];
      showResult(res);
      if (res.ok) gradeLearn(res, code, base);
      draw();
    } else {
      const s = match.state;
      const myTurn = !!s && s.status === 'playing' && s.turn === s.you;
      const res = await runPy({ code, board: s ? s.board : emptyBoard(), me: s ? s.you : 1, canPlace: myTurn, maxPlace: 1 });
      match.ghost = ghostFrom(res);
      match.path = res.path || [];
      showResult(res);
      if (res.ok && res.placed.length) {
        if (!match.online) {
          appendConsole('상대와 연결되어 있지 않아 돌을 놓지 못했어요. 다시 연결되면 실행해 주세요.', 'err', 'unplug');
        } else {
          // 좌표가 아니라 이동 경로를 보내면 방을 만든 쪽이 직접 검증한다. 성공 메시지는 확인을 받은 뒤에 표시.
          appendConsole('확인하는 중…', 'dim', 'hourglass');
          clearPending();
          match.pending = setTimeout(() => {
            match.pending = null;
            appendConsole('응답이 없어요. 판을 확인하고 다시 시도해 주세요.', 'err', 'triangle-alert');
          }, 5000);
          send({ t: 'move', steps: stepsFrom(res.placed[0].path) });
        }
        match.ghost = null; match.path = [];
      } else if (res.ok && myTurn) {
        appendConsole('아직 place() 를 호출하지 않았어요. 미리보기만 보이는 중!', 'info', 'info');
      }
      draw();
    }
  } finally {
    $('#runBtn').disabled = !engineReady;
  }
}
// 경로 [[1,1],[2,1],[2,2]] -> "RD" (상대에게 보내는 이동 기록)
function stepsFrom(path) {
  let s = "";
  for (let i = 1; i < path.length; i++) {
    const dx = path[i][0] - path[i - 1][0], dy = path[i][1] - path[i - 1][1];
    // 한 칸 이동 = 대문자, 돌을 건너뛰는 jump = 소문자
    const c = dx > 0 ? "R" : dx < 0 ? "L" : dy > 0 ? "D" : "U";
    s += Math.abs(dx) + Math.abs(dy) >= 2 ? c.toLowerCase() : c;
  }
  return s;
}
// 임시 돌 위치 (화면용 0부터 시작 좌표)
function ghostFrom(res) {
  return res.stone ? { x: res.stone[0] - 1, y: res.stone[1] - 1 } : null;
}

// ============================================================
//  대전 모드 - 서버 없이 브라우저끼리 연결
//   방을 만든 사람의 브라우저가 규칙과 턴을 관리하고(game.js), 친구는 PeerJS(WebRTC)로 접속한다.
//   AI 대전은 내 브라우저 안에서만 돌아간다.
// ============================================================
const { RoomHost } = OmokGame;
const PEER_PREFIX = 'pyomok-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BEAT_MS = 5000, SILENCE_MS = 15000, REJOIN_TRIES = 12;
const hostKey = (code) => 'pyomok.host.' + code;
const tokenKey = (code) => 'pyomok.token.' + code;
function randomCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}
function send(o) { if (match.net) match.net.send(o); }
function clearPending() {
  if (match.pending) { clearTimeout(match.pending); match.pending = null; }
}
function closeNet() {
  const net = match.net;
  match.net = null;
  if (!net) return;
  clearInterval(net.beat);
  if (net.host) net.host.stop();
  // 마지막 메시지가 나갈 시간을 잠깐 준다
  if (net.peer) setTimeout(() => net.peer.destroy(), 200);
}
function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, { debug: 0 });
    const timer = setTimeout(() => { peer.destroy(); reject(new Error('timeout')); }, 10000);
    peer.on('open', () => { clearTimeout(timer); resolve(peer); });
    peer.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

// ---------- 방을 만든 쪽 ----------
function startHost(host) {
  const me = { send: (m) => { if (match.net === net) onServer(m); } };
  const net = {
    host, links: new Set(),
    send: (o) => setTimeout(() => { if (match.net === net) host.handle(me, o); }, 0),
  };
  closeNet();
  match.net = net;
  return net;
}
function listenForGuest(net, peer) {
  net.peer = peer;
  peer.on('connection', (conn) => {
    const link = { send: (m) => { if (conn.open) conn.send(m); }, lastSeen: Date.now(), conn };
    net.links.add(link);
    conn.on('data', (m) => {
      link.lastSeen = Date.now();
      if (match.net === net && m && m.t !== 'ping') net.host.handle(link, m);
    });
    conn.on('close', () => { net.links.delete(link); if (match.net === net) net.host.detach(link); });
    conn.on('error', () => {});
  });
  net.beat = setInterval(() => {
    if (peer.disconnected && !peer.destroyed) peer.reconnect(); // 초대 받을 수 있도록 중개 서버에 다시 연결
    for (const link of net.links) {
      if (Date.now() - link.lastSeen > SILENCE_MS) { link.conn.close(); net.links.delete(link); net.host.detach(link); }
      else link.send({ t: 'ping' });
    }
  }, BEAT_MS);
}
// 새로고침한 뒤 같은 방 코드를 되찾는다. 잠시 이전 연결이 남아 있으면 비워질 때까지 다시 시도한다.
async function reopenRoom(net, code) {
  while (match.net === net) {
    try {
      const peer = await openPeer(PEER_PREFIX + code);
      if (match.net !== net) return peer.destroy();
      return listenForGuest(net, peer);
    } catch { await new Promise((r) => setTimeout(r, 3000)); }
  }
}

// ---------- 입장하는 쪽 ----------
function connectGuest(code) {
  return openPeer().then((peer) => new Promise((resolve, reject) => {
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
    const net = { peer, send: (o) => { if (conn.open) conn.send(o); }, lastSeen: Date.now() };
    const fail = () => { clearTimeout(timer); peer.destroy(); reject(new Error('no_room')); };
    const timer = setTimeout(fail, 15000);
    peer.on('error', (e) => { if (e.type === 'peer-unavailable') fail(); });
    conn.on('error', () => {});
    conn.on('data', (m) => {
      net.lastSeen = Date.now();
      if (match.net === net && m && m.t !== 'ping') onServer(m);
    });
    conn.on('close', () => dropGuest(net));
    conn.on('open', () => {
      clearTimeout(timer);
      closeNet();
      match.net = net;
      net.lastSeen = Date.now();
      net.beat = setInterval(() => {
        if (Date.now() - net.lastSeen > SILENCE_MS) return dropGuest(net);
        net.send({ t: 'ping' });
      }, BEAT_MS);
      resolve(net);
    });
  }));
}
function dropGuest(net) {
  if (match.net !== net) return;
  closeNet();
  match.online = false;
  if (match.pending) { clearPending(); appendConsole('연결이 끊겼어요. 다시 연결되면 판을 확인해 주세요.', 'err', 'unplug'); }
  if (match.room) { renderMatchUI(); match.rejoinTries = 0; setTimeout(rejoin, 1500); }
}
async function rejoin() {
  const room = match.room;
  if (!room || match.net) return;
  try {
    await connectGuest(room);
    if (match.room !== room) return closeNet();
    send({ t: 'join', room, token: match.token, name: match.nick });
  } catch {
    if (match.room !== room) return;
    if (++match.rejoinTries >= REJOIN_TRIES) return leaveRoom('방을 만든 사람과 연결이 끊겼어요. 새 방을 만들어 주세요.');
    setTimeout(rejoin, 2000);
  }
}
// 방이 사라졌을 때 처음 화면으로 돌아간다
function leaveRoom(msg) {
  match.room = null; match.token = null; match.state = null; match.online = false;
  match.ghost = null; match.path = []; match.lastKey = ''; match.msg = msg;
  history.replaceState(null, '', location.pathname);
  renderMatchUI(); draw();
}
// 내가 방에서 나가 처음 화면으로 돌아간다
function quitRoom() {
  clearPending();
  const code = match.room, net = match.net;
  if (net && net.host) net.host.close(); else send({ t: 'leave' });
  tabStore.remove(tokenKey(code));
  tabStore.remove(hostKey(code));
  closeNet();
  resetMatchCode();
  logConsole(['(실행 버튼을 눌러 보세요)'], 'dim');
  leaveRoom('');
}
function onServer(m) {
  if (m.t === 'closed') {
    tabStore.remove(tokenKey(match.room));
    closeNet();
    return leaveRoom('방을 만든 사람이 방을 닫았어요.');
  }
  if (m.t === 'error') {
    clearPending();
    appendConsole(m.msg, 'err', 'triangle-alert');
    if (m.code === 'no_room') tabStore.remove(tokenKey(m.room));
    if (!match.room) closeNet();
    match.msg = m.msg; renderMatchUI();
    return;
  }
  if (m.t === 'joined') {
    match.room = m.room; match.token = m.token; match.msg = ''; match.online = true;
    tabStore.set(tokenKey(m.room), m.token);
    history.replaceState(null, '', '?room=' + m.room);
    return;
  }
  if (m.t === 'state') {
    const key = (m.last ? m.last.x + ',' + m.last.y : '-') + ',' + m.status;
    if (key !== match.lastKey) { match.ghost = null; match.path = []; match.lastKey = key; }
    const prev = match.state;
    match.state = m;
    match.offset = m.now - Date.now(); // 방을 만든 쪽 시계와의 차이
    if (m.notice && m.notice.id !== match.noticeId) { match.noticeId = m.notice.id; appendConsole(m.notice.msg, 'info', m.notice.icon); }
    match.msg = '';
    // 내 돌이 확정됐거나 새 판이 시작되면 코드를 비운다 (시간 초과나 거부된 수는 쓰던 코드 유지)
    const myMoveDone = prev && prev.status === 'playing' && prev.turn === prev.you
      && m.last && m.board[m.last.y][m.last.x] === m.you
      && (!prev.last || prev.last.x !== m.last.x || prev.last.y !== m.last.y);
    if (myMoveDone) { clearPending(); appendConsole(`${m.last.x + 1}-${m.last.y + 1} 에 돌을 놓았어요!`, 'ok', 'map-pin'); }
    if (myMoveDone && m.status === 'playing') { resetMatchCode(); appendConsole('다음 수는 코드를 새로 작성해 주세요.', 'dim', 'pencil'); }
    else if (prev && prev.status === 'over' && m.status === 'playing') resetMatchCode();
    const aiMoved = prev && m.ai && m.last && m.board[m.last.y][m.last.x] !== m.you
      && (!prev.last || prev.last.x !== m.last.x || prev.last.y !== m.last.y);
    if (aiMoved) appendConsole(`AI가 ${m.last.x + 1}-${m.last.y + 1} 에 두었어요.`, 'dim', 'bot');
    if (prev && m.status === 'playing' && prev.turn !== m.turn && m.turn === m.you) appendConsole('내 차례예요!', 'ok', 'circle-dot');
    if (m.status === 'over' && (!prev || prev.status !== 'over'))
      appendConsole(m.winner === 0 ? '무승부!' : m.winner === m.you ? '승리했어요!' : '졌어요. 다시 도전!', m.winner === m.you ? 'ok' : 'info', m.winner === 0 ? 'handshake' : m.winner === m.you ? 'trophy' : 'frown');
    renderMatchUI(); draw();
  }
}
function resetMatchCode() {
  if (mode !== 'match') { match.code = MATCH_STARTER; return; }
  editor.setValue(MATCH_STARTER);
  editor.clearHistory(); // Ctrl+Z 로 이전 턴 코드를 되살리지 못하게
}
// ai 를 넘기면 AI 대전 방을 만든다 ('easy' | 'normal' | 'hard')
async function createRoom(ai) {
  const name = readNick();
  if (name === null || match.busy) return;
  match.busy = true;
  try {
    let code = randomCode(), peer = null;
    // 친구 방만 연결 창구를 연다. 코드가 겹치면 다른 코드로 다시 시도.
    for (let i = 0; !ai && !peer; i++) {
      try { peer = await openPeer(PEER_PREFIX + code); }
      catch (e) { if (e.type !== 'unavailable-id' || i >= 4) throw e; code = randomCode(); }
    }
    const net = startHost(new RoomHost(code, (snap) => tabStore.set(hostKey(code), snap)));
    if (peer) listenForGuest(net, peer);
    net.send({ t: 'create', name, ai });
  } catch {
    match.msg = '방을 열지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';
    renderMatchUI();
  } finally { match.busy = false; }
}
async function joinRoom(code) {
  const name = readNick();
  if (name === null || match.busy) return;
  code = (code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) { match.msg = '방 코드는 4글자예요.'; return renderMatchUI(); }
  match.nick = name;
  const token = tabStore.get(tokenKey(code), null), snap = tabStore.get(hostKey(code), null);
  // 내가 만든 방을 새로고침한 경우: 저장해 둔 판으로 이어서 연다
  if (snap && token) {
    const net = startHost(RoomHost.restore(snap, (x) => tabStore.set(hostKey(code), x)));
    if (!snap.ai) reopenRoom(net, code);
    return net.send({ t: 'join', token, name });
  }
  match.busy = true;
  match.msg = '방에 연결하는 중…'; renderMatchUI();
  try {
    await connectGuest(code);
    send({ t: 'join', name, token });
  } catch (e) {
    onServer(e.message === 'no_room'
      ? { t: 'error', code: 'no_room', room: code, msg: '방을 찾지 못했어요. 코드를 확인하고, 방을 만든 사람이 창을 열어 두었는지 물어보세요.' }
      : { t: 'error', msg: '연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.' });
  } finally { match.busy = false; }
}
function readNick() {
  const el = $('#nick');
  const v = el ? el.value.trim() : match.nick;
  if (!v) { match.msg = '닉네임을 입력해 주세요.'; renderMatchUI(); return null; }
  match.nick = v; store.set('pyomok.nick', v);
  return v;
}
function inviteLink() { return location.origin + location.pathname + '?room=' + match.room; }

function renderMatchUI() {
  const s = match.state, ov = $('#overlay'), top = $('#topbar');
  // 상단 바
  if (mode !== 'match') return;
  renderMatchPanel();
  if (!match.room || !s) top.innerHTML = '<span class="dim">방에 들어가면 여기에 상태가 표시돼요</span>';
  else {
    const nm = (c) => `<span class="pill ${s.status === 'playing' && s.turn === c ? 'turn' : ''} ${s.online[c] || !s.names[c] ? '' : 'off'}">
      <span class="${c === 1 ? 'dotb' : 'dotw'}"></span>${c === s.aiColor ? ic('bot') : ''}${esc(s.names[c] || '대기 중')}${c === s.you ? ' (나)' : ''}</span>`;
    let st = '';
    if (s.status === 'waiting') st = ic('hourglass') + '상대를 기다리는 중';
    else if (s.status === 'playing') st = s.turn === s.you ? ic('circle-dot') + '내 차례 — 코드를 실행하세요' : s.ai ? ic('bot') + 'AI가 생각하는 중…' : ic('hourglass') + '상대 차례';
    else st = s.winner === 0 ? ic('handshake') + '무승부' : (s.winner === s.you ? ic('trophy') + '승리!' : ic('frown') + '패배') + (s.reason === 'timeout' ? ' (시간 초과)' : '');
    if (s.status === 'over' && s.winner === 0 && s.reason === 'stalemate') st = ic('handshake') + '무승부 (둘 곳 없음)';
    if (!match.online) st = `<span class="offline">${ic('unplug')}연결이 끊겼어요 — 다시 연결하는 중…</span>`;
    const tm = s.status === 'playing' && match.online && s.deadline ? ` <span id="timer" class="pill">${ic('timer')}<span id="timerN"></span></span>` : '';
    const head = s.ai ? '<button id="quitTop" class="mini">나가기</button>'
      : `<span>방 <b>${esc(s.room)}</b> <button id="copyBtn" class="mini">링크 복사</button></span>`;
    top.innerHTML = `${head}${nm(1)} vs ${nm(2)}<span>${st}${tm}</span>`;
    tickTimer();
    if (s.ai) $('#quitTop').onclick = quitRoom; else $('#copyBtn').onclick = copyLink;
  }
  // 오버레이
  ov.style.background = ''; ov.style.alignItems = '';
  if (!match.room || !s) {
    const pre = new URLSearchParams(location.search).get('room') || '';
    ov.classList.remove('hidden');
    ov.innerHTML = `<div class="card">
      <h3>${ic('swords')}오목 대전</h3>
      <input id="nick" maxlength="12" placeholder="닉네임" value="${esc(match.nick)}">
      <div class="lobbyLabel">${ic('users')}친구와 1:1</div>
      <button id="mk" class="primary">방 만들기</button>
      <div class="row"><input id="rc" class="code" maxlength="4" placeholder="CODE" value="${esc(pre)}"><button id="jn">입장</button></div>
      <div class="lobbyLabel">${ic('bot')}AI와 대결 <span class="dim">시간 제한 없음</span></div>
      <div class="row aiLevels">
        <button data-ai="easy">쉬움</button><button data-ai="normal">보통</button><button data-ai="hard">어려움</button>
      </div>
      <div class="msg">${esc(match.msg)}</div></div>`;
    $('#mk').onclick = () => createRoom();
    ov.querySelectorAll('[data-ai]').forEach((b) => (b.onclick = () => createRoom(b.dataset.ai)));
    $('#jn').onclick = () => joinRoom($('#rc').value);
    $('#rc').onkeydown = (e) => { if (e.key === 'Enter') joinRoom($('#rc').value); };
  } else if (s.status === 'waiting') {
    ov.classList.remove('hidden');
    ov.innerHTML = `<div class="card"><h3>친구를 초대하세요!</h3>
      <div class="dim" style="font-size:13px">이 링크를 보내면 친구가 바로 입장해요</div>
      <div class="link">${esc(inviteLink())}</div>
      <button id="cp2" class="primary">링크 복사</button>
      <div class="dim" style="font-size:13px">방 코드: <b style="letter-spacing:4px;font-size:18px">${esc(s.room)}</b></div>
      <div class="dim">${ic('hourglass')}상대를 기다리는 중… 이 창을 닫으면 방이 사라져요</div>
      <button id="quitWait">나가기</button></div>`;
    $('#cp2').onclick = copyLink;
    $('#quitWait').onclick = quitRoom;
  } else if (s.status === 'over') {
    ov.classList.remove('hidden');
    ov.style.background = '#0007'; ov.style.alignItems = 'flex-end';
    const waiting = s.rematch.includes(s.you);
    ov.innerHTML = `<div class="card" style="margin-bottom:10px"><h3>${s.winner === 0 ? ic('handshake') + '무승부' : s.winner === s.you ? ic('trophy') + '승리!' : ic('frown') + '패배'}</h3>
      <button id="rm" class="primary" ${waiting || !match.online ? 'disabled' : ''}>${!match.online ? '연결 중…' : waiting ? '상대 대기 중…' : '다시 하기 (선공 교대)'}</button>
      <button id="quitOver">나가기</button></div>`;
    $('#rm').onclick = () => send({ t: 'rematch' });
    $('#quitOver').onclick = quitRoom;
  } else {
    ov.classList.add('hidden');
  }
}
function tickTimer() {
  const el = $('#timer'), s = match.state;
  if (!el || !s || !s.deadline) return;
  const left = Math.max(0, Math.ceil((s.deadline - (Date.now() + (match.offset || 0))) / 1000));
  $('#timerN').textContent = left + '초';
  el.style.color = left <= 15 ? 'var(--bad)' : '';
  el.style.borderColor = left <= 15 ? 'var(--bad)' : '';
}
setInterval(tickTimer, 250);
function copyLink() {
  const t = inviteLink();
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(
    () => appendConsole('초대 링크를 복사했어요!', 'ok', 'link'),
    () => prompt('이 링크를 복사하세요', t));
}

function renderMatchPanel() {
  const limit = match.state?.ai ? '시간 제한 없음' : '한 턴 2분';
  $('#matchPanel').innerHTML = `<h2>${ic('swords')}대전 팁 <span class="dim">${ic('timer')}${limit} · 돌을 놓으면 코드가 비워져요</span></h2>
    <ul class="tips">
      <li>한 칸 이동 <code>right()</code> <code>down()</code> <code>left()</code> <code>up()</code> · 여러 칸은 <code>for i in range(3):</code></li>
      <li>막히면 <code>if blocked("right"):</code> → <code>jump("right")</code> (돌 건너뛰기), <code>else:</code> → <code>right()</code></li>
      <li>몇 번인지 모르면 <code>while get_x() &lt; 5:</code> · 돌 위치 <code>get_x()</code> <code>get_y()</code></li>
      <li><code>place()</code> 없이 실행 → 미리보기, 마음에 들면 <code>place()</code></li>
    </ul>`;
}

// ============================================================
//  모드 전환
// ============================================================
function setMode(m) {
  if (mode === 'learn') saveLearnCode(); else match.code = editor.getValue();
  mode = m;
  $('#tabLearn').classList.toggle('active', m === 'learn');
  $('#tabMatch').classList.toggle('active', m === 'match');
  $('#lessonPanel').classList.toggle('hidden', m !== 'learn');
  $('#matchPanel').classList.toggle('hidden', m !== 'match');
  $('#learnBtns').classList.toggle('hidden', m !== 'learn');
  if (m === 'learn') {
    $('#overlay').classList.add('hidden');
    $('#topbar').innerHTML = '<span class="dim">학습 모드 — 코드로 돌을 놓아 보세요</span>';
    editor.setValue(learn.codes[learn.level] ?? LEVELS[learn.level].starter);
    renderLessonPanel();
  } else {
    renderMatchPanel();
    editor.setValue(match.code ?? MATCH_STARTER);
    renderMatchUI();
  }
  logConsole(['(실행 버튼을 눌러 보세요)'], 'dim');
  draw();
}

// ============================================================
//  보드 그리기
// ============================================================
const cv = $('#board'), ctx = cv.getContext('2d');
const S = 720, M = 44, C = (S - 2 * M) / (N - 1);
const px = (i) => M + i * C;
let hover = null;

function view() {
  if (mode === 'learn') return { board: learn.board, ghost: learn.ghost, path: learn.path, last: null, win: null, color: 1 };
  const s = match.state;
  return { board: s ? s.board : emptyBoard(), ghost: match.ghost, path: match.path, last: s?.last || null, win: s?.winLine || null, color: s?.you || 1 };
}
function stone(x, y, color, alpha = 1) {
  const cx = px(x), cy = px(y), r = C * 0.43;
  ctx.save(); ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  if (color === 1) { g.addColorStop(0, '#5a5a5a'); g.addColorStop(1, '#050505'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9c9c9'); }
  ctx.shadowColor = '#0006'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function draw() {
  const v = view();
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#dcb35c'; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#5a4217'; ctx.lineWidth = 1.2;
  for (let i = 0; i < N; i++) {
    ctx.beginPath(); ctx.moveTo(px(0), px(i)); ctx.lineTo(px(N - 1), px(i)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px(i), px(0)); ctx.lineTo(px(i), px(N - 1)); ctx.stroke();
  }
  ctx.fillStyle = '#5a4217';
  [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(px(x), px(y), 4, 0, 7); ctx.fill(); });
  ctx.fillStyle = '#4a3512'; ctx.font = '13px Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < N; i++) { ctx.fillText(i + 1, px(i), 20); ctx.fillText(i + 1, 20, px(i)); }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (v.board[y][x]) stone(x, y, v.board[y][x]);
  if (v.last) {
    ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.arc(px(v.last.x), px(v.last.y), 5, 0, 7); ctx.fill();
  }
  if (v.win) {
    ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 4;
    v.win.forEach((c) => { ctx.beginPath(); ctx.arc(px(c.x), px(c.y), C * 0.47, 0, 7); ctx.stroke(); });
  }
  if (v.path && v.path.length > 1) {
    ctx.strokeStyle = '#2e7dffaa'; ctx.lineWidth = 3; ctx.setLineDash([2, 6]); ctx.lineCap = 'round';
    ctx.beginPath();
    v.path.forEach(([px1, py1], i) => (i ? ctx.lineTo(px(px1 - 1), px(py1 - 1)) : ctx.moveTo(px(px1 - 1), px(py1 - 1))));
    ctx.stroke(); ctx.setLineDash([]);
  }
  if (v.ghost) {
    const { x, y } = v.ghost;
    stone(x, y, v.color, 0.55);
    ctx.strokeStyle = '#2e7dff'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(px(x), px(y), C * 0.47, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    // 좌표 라벨: 돌과 겹쳐도 읽히도록 흰 배경을 깔고, 맨 윗줄에서는 돌 아래에 표시
    const label = `${x + 1}-${y + 1}`, ly = y === 0 ? px(y) + C * 0.78 : px(y) - C * 0.78;
    ctx.font = 'bold 14px Consolas, monospace';
    const lw = ctx.measureText(label).width + 10;
    ctx.fillStyle = '#ffffffee'; ctx.strokeStyle = '#2e7dff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.rect(px(x) - lw / 2, ly - 9, lw, 18); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1b4fb3';
    ctx.fillText(label, px(x), ly);
  }
  if (hover) {
    ctx.strokeStyle = '#0006'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px(hover.x), px(hover.y), 6, 0, 7); ctx.stroke();
  }
}
cv.addEventListener('mousemove', (e) => {
  const r = cv.getBoundingClientRect();
  const k = S / r.width;
  const x = Math.round(((e.clientX - r.left) * k - M) / C), y = Math.round(((e.clientY - r.top) * k - M) / C);
  hover = x >= 0 && y >= 0 && x < N && y < N ? { x, y } : null;
  $('#hover').textContent = hover ? `${hover.x + 1}-${hover.y + 1}` : ' ';
  draw();
});
cv.addEventListener('mouseleave', () => { hover = null; $('#hover').innerHTML = '&nbsp;'; draw(); });

// ============================================================
//  버튼 연결 & 시작
// ============================================================
$('#runBtn').onclick = run;
$('#tabLearn').onclick = () => setMode('learn');
$('#tabMatch').onclick = () => setMode('match');
$('#resetBtn').onclick = () => {
  if (mode === 'learn') { editor.setValue(LEVELS[learn.level].starter); learn.board = LEVELS[learn.level].board(); learn.ghost = null; learn.path = []; draw(); }
  else editor.setValue(MATCH_STARTER);
};
$('#hintBtn').onclick = () => { logConsole([], 'info'); appendConsole(LEVELS[learn.level].hint, 'info', 'lightbulb'); };
$('#solBtn').onclick = () => {
  if (confirm('정답을 에디터에 보여줄까요? (지금 코드가 바뀌어요)')) editor.setValue(LEVELS[learn.level].solution + '\n');
};

startWorker();
learn.board = LEVELS[learn.level].board();
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) {
  setMode('match');
  // 같은 브라우저에서 이미 들어갔던 방이면 자동 재입장
  if (tabStore.get(tokenKey(urlRoom.toUpperCase()), null) && match.nick) joinRoom(urlRoom);
} else {
  setMode('learn');
  gotoLevel(Math.min(learn.level, LEVELS.length - 1));
}
