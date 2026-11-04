// 파이썬 실행 워커 (Pyodide). 무한 반복이어도 화면이 멈추지 않도록 별도 스레드에서 실행.
// 좌표는 파이썬 쪽에서 모두 1부터 시작 (1-1 이 왼쪽 위).
importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');

let py = null;
const ready = loadPyodide()
  .then((p) => { py = p; postMessage({ type: 'ready' }); })
  .catch((e) => postMessage({ type: 'fail', msg: String(e) }));

const PRELUDE = `
import json
SIZE = 15
STEP_LIMIT = 400
_steps = 0
_board = json.loads(_board_json)
me = _me
_stone = None
_path = []
_D = {"right": (1, 0), "left": (-1, 0), "down": (0, 1), "up": (0, -1),
      "오른쪽": (1, 0), "왼쪽": (-1, 0), "아래": (0, 1), "위": (0, -1)}

def _inside(x, y):
    return 1 <= x <= SIZE and 1 <= y <= SIZE

def _need():
    if _stone is None:
        raise RuntimeError('임시 돌이 없어요. 먼저 print("돌") 로 돌을 만드세요')

def _dir(d):
    if d not in _D:
        raise ValueError('방향은 "right", "left", "up", "down" 중 하나여야 해요')
    return _D[d]

def cell(x, y):
    """x-y 칸의 내용: 0 빈칸, 1 흑, 2 백, -1 판 밖"""
    if not _inside(x, y):
        return -1
    return _board[y - 1][x - 1]

def blocked(d):
    """그 방향 바로 앞이 벽(판 밖)이거나 돌이 있으면 True"""
    _need()
    dx, dy = _dir(d)
    x, y = _stone[0] + dx, _stone[1] + dy
    return (not _inside(x, y)) or _board[y - 1][x - 1] != 0

def _count():
    global _steps
    _steps += 1
    if _steps > STEP_LIMIT:
        raise RuntimeError("한 번 실행에 %d번까지만 움직일 수 있어요. 더 짧은 길을 찾아보세요!" % STEP_LIMIT)

def _landing(d):
    """바로 앞부터 이어진 돌들을 건너뛴 뒤의 첫 빈 칸. 앞이 비었거나 판 끝까지 돌이면 None"""
    dx, dy = _dir(d)
    x, y = _stone[0] + dx, _stone[1] + dy
    if not _inside(x, y) or _board[y - 1][x - 1] == 0:
        return None
    while _inside(x, y) and _board[y - 1][x - 1] != 0:
        x, y = x + dx, y + dy
    return [x, y] if _inside(x, y) else None

def can_jump(d):
    """바로 앞에 돌이 있고, 이어진 돌들 뒤에 빈 칸이 있으면 True"""
    _need()
    return _landing(d) is not None

def jump(d):
    """앞에 이어진 돌들을 한 번에 건너뛰어 첫 빈 칸에 착지"""
    global _stone
    _need()
    _count()
    to = _landing(d)
    if to is None:
        raise RuntimeError("건너뛸 수 없어요! 바로 앞에 돌이 있고, 그 뒤에 빈 칸이 있어야 해요 (can_jump 로 확인)")
    _stone = to
    _path.append(list(_stone))

def _move(d):
    global _stone
    _need()
    _count()
    dx, dy = _dir(d)
    x, y = _stone[0] + dx, _stone[1] + dy
    if not _inside(x, y):
        raise RuntimeError("판 밖으로는 나갈 수 없어요! if blocked(...) 로 먼저 확인해 보세요")
    if _board[y - 1][x - 1] != 0:
        raise RuntimeError("%d-%d 에 이미 돌이 있어서 지나갈 수 없어요! if blocked(...) 로 먼저 확인하세요" % (x, y))
    _stone = [x, y]
    _path.append([x, y])

def _one(d, n):
    if n is not None:
        raise TypeError("한 번에 한 칸씩만 움직여요. 여러 칸은 for 반복문으로 해 보세요!")
    _move(d)

def right(n=None): _one("right", n)
def left(n=None): _one("left", n)
def up(n=None): _one("up", n)
def down(n=None): _one("down", n)
def move(d, n=None): _one(d, n)

def get_x():
    _need()
    return _stone[0]

def get_y():
    _need()
    return _stone[1]

def place():
    """임시 돌을 지금 자리에 확정해서 놓는다"""
    global _stone
    _need()
    x, y = _stone
    msg = _place_js(x, y, json.dumps(_path))
    if msg:
        raise ValueError(msg)
    _board[y - 1][x - 1] = me
    _stone = None

def _spawn():
    global _stone
    if _stone is not None:
        raise RuntimeError("이미 임시 돌이 있어요. place() 로 먼저 놓아 주세요")
    _stone = [1, 1]
    _path.clear()
    _path.append([1, 1])

_orig_print = print
def print(*args, **kw):
    _orig_print(*args, **kw)
    if any(str(a).strip() == "돌" for a in args):
        _spawn()

def _run(src):
    exec(compile(src, "<내 코드>", "exec"), globals())
`;

function summarizeError(msg) {
  const lines = String(msg).split('\n').map((l) => l.trimEnd()).filter(Boolean);
  const last = lines[lines.length - 1] || '오류';
  let lineNo = null;
  for (const l of lines) {
    const m = l.match(/File "<내 코드>", line (\d+)/);
    if (m) lineNo = m[1];
  }
  return (lineNo ? lineNo + '번째 줄 → ' : '') + koreanError(last);
}

// 초보자가 자주 만나는 파이썬 에러를 한국어 안내로 바꾼다. 모르는 에러는 원문을 함께 보여 준다.
function koreanError(last) {
  const m = last.match(/^(\w+): ?(.*)$/);
  if (!m) return last;
  const [, type, msg] = m;
  let r;
  if (type === 'NameError' && (r = msg.match(/name '(.+?)' is not defined(?:\. Did you mean: '(.+?)'\?)?/))) {
    return r[2]
      ? `'${r[1]}' 은(는) 없는 이름이에요. '${r[2]}' 를 잘못 쓴 것 아닌가요?`
      : `'${r[1]}' 은(는) 없는 이름이에요. 오타가 없는지, 글자라면 따옴표 "" 로 감쌌는지 확인해 보세요.`;
  }
  if (/[가-힣]/.test(msg) && type !== 'SyntaxError') return msg; // 이 게임이 직접 낸 한국어 에러
  if (type === 'IndentationError') {
    if ((r = msg.match(/expected an indented block after (?:'(\w+)' statement|(function) definition|(class) definition)/))) {
      return `이 줄은 위에 있는 ${r[1] || (r[2] ? 'def' : 'class')} 의 안쪽 코드라서 스페이스 4칸 들여 써야 해요.`;
    }
    if (/unexpected indent/.test(msg)) return '이 줄은 들여쓰기가 필요 없어요. 줄 앞의 빈칸을 지워 보세요.';
    if (/unindent does not match/.test(msg)) return '들여쓰기 칸 수가 위 줄과 맞지 않아요. 4칸 단위로 맞춰 보세요.';
    return '들여쓰기를 확인해 보세요.';
  }
  if (type === 'SyntaxError') {
    if (/expected ':'/.test(msg)) return '줄 끝에 콜론(:)이 빠졌어요.';
    if ((r = msg.match(/'(.)' was never closed/))) return `여는 괄호 '${r[1]}' 를 닫지 않았어요.`;
    if ((r = msg.match(/unmatched '(.)'/))) return `닫는 괄호 '${r[1]}' 가 남아요. 괄호 짝을 확인해 보세요.`;
    if (/unterminated string/.test(msg)) return '따옴표를 닫지 않았어요. 글자는 "" 로 감싸야 해요.';
    if (/invalid character/.test(msg)) return '파이썬에서 쓸 수 없는 글자가 있어요. 한글 자판의 특수문자나 전각 기호가 아닌지 확인해 보세요.';
    if (/Maybe you meant '=='/.test(msg)) return '조건에서 "같은가?" 는 = 가 아니라 == 로 써요.';
    if (/Missing parentheses in call to 'print'/.test(msg)) return 'print 뒤에 괄호가 빠졌어요. print("돌") 처럼 써 주세요.';
    if (/'return' outside function/.test(msg)) return 'return 은 함수(def) 안에서만 쓸 수 있어요.';
    if (/'break' outside loop/.test(msg)) return 'break 는 반복문(for, while) 안에서만 쓸 수 있어요.';
    if (/'continue' not properly in loop/.test(msg)) return 'continue 는 반복문(for, while) 안에서만 쓸 수 있어요.';
    return '문법이 틀렸어요. 오타, 빠진 괄호나 따옴표, 콜론(:)을 확인해 보세요.';
  }
  if (type === 'TabError') return '탭과 스페이스가 섞였어요. 들여쓰기는 스페이스 4칸으로 맞춰 주세요.';
  if (type === 'TypeError') {
    if ((r = msg.match(/(\w+)\(\) missing \d+ required positional argument/))) {
      const eg = ['blocked', 'jump', 'can_jump', 'move'].includes(r[1]) ? ` 예: ${r[1]}("right")` : '';
      return `${r[1]}() 괄호 안에 값이 빠졌어요.${eg}`;
    }
    if ((r = msg.match(/(\w+)\(\) takes 0 positional arguments/))) return `${r[1]}() 는 괄호 안을 비워 두세요.`;
    if ((r = msg.match(/(\w+)\(\) takes .* but \d+ (?:was|were) given/))) return `${r[1]}() 괄호 안의 값 개수가 너무 많아요.`;
    if (/cannot be interpreted as an integer/.test(msg)) return '숫자가 들어갈 자리에 다른 값이 들어갔어요. range() 안에는 정수를 넣어 주세요.';
    if (/can only concatenate|unsupported operand/.test(msg)) return '글자와 숫자처럼 종류가 다른 값은 바로 계산할 수 없어요.';
    if (/not supported between/.test(msg)) return '글자와 숫자처럼 종류가 다른 값은 비교할 수 없어요.';
    if (/not callable/.test(msg)) return '함수가 아닌 값에 괄호를 붙였어요. 변수 이름이 함수 이름과 겹치지 않는지 확인해 보세요.';
    return '값의 종류가 맞지 않아요. 글자와 숫자를 섞어 쓰지 않았는지 확인해 보세요.';
  }
  if (type === 'ZeroDivisionError') return '0으로 나눌 수 없어요.';
  if (type === 'IndexError') return '리스트의 범위를 벗어났어요. 번호가 0부터 시작하는지 확인해 보세요.';
  if (type === 'KeyError') return `사전(dict)에 없는 키를 찾았어요: ${msg}`;
  if (type === 'AttributeError') return '그 값에서는 쓸 수 없는 기능이에요. 점(.) 뒤의 이름을 확인해 보세요.';
  if (type === 'ValueError') return /invalid literal/.test(msg) ? '숫자로 바꿀 수 없는 글자예요.' : '값이 올바르지 않아요. 넣은 값을 확인해 보세요.';
  if (type === 'ModuleNotFoundError' || type === 'ImportError') return '이 게임에서는 쓸 수 없는 모듈이에요.';
  if (type === 'RecursionError') return '함수가 자기 자신을 너무 많이 불렀어요. 멈추는 조건을 확인해 보세요.';
  if (type === 'UnboundLocalError') {
    r = msg.match(/variable '(.+?)'/);
    return `함수 안에서 변수${r ? ` '${r[1]}'` : ''} 에 값을 넣기 전에 사용했어요.`;
  }
  if (type === 'OSError' || type === 'EOFError') return 'input() 은 이 게임에서 쓸 수 없어요.';
  console.warn('번역되지 않은 에러:', last); // 개발자 확인용. 화면에는 한국어만 보여 준다
  return '코드를 실행하지 못했어요. 오타나 넣은 값을 확인해 보세요.';
}

// 괄호 없이 이름만 쓴 줄(right 등)은 파이썬에서 에러 없이 아무 일도 안 일어나므로 미리 알려 준다
function findBareCall(code) {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(right|left|up|down|place|jump)\s*(#.*)?$/);
    if (m) {
      const eg = m[1] === 'jump' ? 'jump("right")' : m[1] + '()';
      return `${i + 1}번째 줄 → ${m[1]} 뒤에 괄호가 빠졌어요. ${eg} 처럼 써야 실행돼요.`;
    }
  }
  return null;
}

onmessage = async (e) => {
  await ready;
  if (!py) return;
  const { id, code, board, me, canPlace, maxPlace } = e.data;
  const out = [];
  const placed = []; // 1부터 시작하는 좌표
  const N = board.length;

  const MAX_OUT = 200; // 출력 줄 수 제한
  const push = (s) => { if (out.length < MAX_OUT) out.push(s); else if (out.length === MAX_OUT) out.push('… (출력이 너무 많아 여기서 생략)'); };
  py.setStdout({ batched: push });
  py.setStderr({ batched: push });

  const ns = py.globals.get('dict')();
  let error = null;
  try {
    ns.set('_board_json', JSON.stringify(board));
    ns.set('_me', me);
    ns.set('_user_code', code);
    ns.set('_place_js', (x, y, pathJson) => {
      if (!canPlace) return '지금은 내 차례가 아니에요! (미리보기만 가능)';
      if (placed.length >= maxPlace) return '한 번 실행에 돌은 ' + maxPlace + '개까지만 놓을 수 있어요.';
      if (x < 1 || y < 1 || x > N || y > N) return '판 밖이에요.';
      if (board[y - 1][x - 1] !== 0) return x + '-' + y + ' 에는 이미 돌이 있어요.';
      board[y - 1][x - 1] = me;
      placed.push({ x, y, path: JSON.parse(pathJson) });
      return '';
    });
    py.runPython(PRELUDE, { globals: ns });
    error = findBareCall(code);
    if (!error) py.runPython('_run(_user_code)', { globals: ns });
  } catch (err) {
    error = summarizeError(err.message || err);
  }

  let stone = null, path = [];
  try {
    const j = JSON.parse(py.runPython('json.dumps({"stone": _stone, "path": _path})', { globals: ns }));
    stone = j.stone; path = j.path;
  } catch {}
  try { ns.destroy(); } catch {}

  postMessage({ type: 'result', id, ok: !error, error, out, placed, stone, path });
};
