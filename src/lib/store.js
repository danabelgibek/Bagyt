// Состояние приложения. Хранится в localStorage, поэтому маршрут не теряется
// при перезагрузке. Бэкенда нет: это осознанный выбор для демонстрации —
// весь полный путь работает локально и не зависит от внешних сервисов.

const KEY = 'bagyt.v1';

export const EMPTY_PROFILE = {
  grade: '11',
  interests: [],
  gpa: 'good',
  entScore: 95,
  entKnown: 'expected',
  pair: 'math_phys',
  langs: ['ru'],
  city: 'almaty',
  mobility: 'majors',
  budget: 'to2',
  priorities: ['grant'],
};

const EMPTY_STATE = {
  screen: 'intro',
  profileStep: 0,
  profile: { ...EMPTY_PROFILE },
  completed: false,
  targetId: null,
  compareIds: [],
  saved: [],
  done: {},
  snapshot: null, // предыдущий результат подбора — для показа изменений
  changes: null,
};

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_STATE, ...parsed, profile: { ...EMPTY_PROFILE, ...parsed.profile } };
  } catch {
    return null;
  }
}

function write(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    // Приватный режим браузера или заполненное хранилище — приложение
    // продолжает работать в памяти, просто без сохранения между сессиями.
    return false;
  }
}

export function createStore() {
  let state = read() || { ...EMPTY_STATE };
  let persisted = true;
  const listeners = new Set();

  const notify = () => listeners.forEach((fn) => fn(state));

  return {
    get state() {
      return state;
    },
    get persisted() {
      return persisted;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set(patch) {
      state = { ...state, ...patch };
      persisted = write(state);
      notify();
    },
    setProfile(patch) {
      state = { ...state, profile: { ...state.profile, ...patch } };
      persisted = write(state);
      notify();
    },
    toggleIn(key, value, max = Infinity) {
      const list = state[key] || [];
      const next = list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value].slice(-max);
      this.set({ [key]: next });
    },
    toggleProfileList(key, value, max = Infinity) {
      const list = state.profile[key] || [];
      const next = list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value].slice(-max);
      this.setProfile({ [key]: next });
    },
    toggleDone(id) {
      const done = { ...state.done };
      if (done[id]) delete done[id];
      else done[id] = true;
      this.set({ done });
    },
    reset() {
      state = { ...EMPTY_STATE, profile: { ...EMPTY_PROFILE } };
      try {
        localStorage.removeItem(KEY);
      } catch { /* ignore */ }
      notify();
    },
  };
}

// ——— Что изменилось после правки профиля ———
// Жюри по сценарию проверки меняет бюджет, интерес, страну или экзамен.
// Сервис обязан не просто пересчитать, а показать, что именно сдвинулось.

export function snapshotOf(result) {
  return {
    ids: result.matches.map((m) => m.program.id),
    top: result.matches[0]
      ? { id: result.matches[0].program.id, total: result.matches[0].total }
      : null,
    chances: Object.fromEntries(
      result.matches.map((m) => [m.program.id, m.chance.level]),
    ),
  };
}

const CHANCE_RANK = { unlikely: 0, low: 1, border: 2, good: 3, high: 4, separate: 2 };

export function diffResult(prev, result) {
  if (!prev) return null;
  const snap = snapshotOf(result);
  const added = result.matches.filter((m) => !prev.ids.includes(m.program.id));
  const removed = prev.ids.filter((id) => !snap.ids.includes(id));
  const lines = [];

  if (added.length) {
    lines.push(
      `Появилось в списке: ${added.map((m) => `${m.program.short} — ${m.program.name}`).join('; ')}`,
    );
  }
  if (removed.length) {
    lines.push(`Ушло из списка: ${removed.length} вариант(а)`);
  }
  if (snap.top && prev.top && snap.top.id !== prev.top.id) {
    const nowTop = result.matches[0];
    lines.push(`Новый лучший вариант: ${nowTop.program.short}, соответствие ${nowTop.total}%`);
  } else if (snap.top && prev.top && snap.top.total !== prev.top.total) {
    const d = snap.top.total - prev.top.total;
    lines.push(`Соответствие лучшего варианта ${d > 0 ? 'выросло' : 'упало'} на ${Math.abs(d)}%`);
  }

  const shifted = Object.keys(snap.chances).filter(
    (id) => prev.chances[id] && prev.chances[id] !== snap.chances[id],
  );
  if (shifted.length) {
    const up = shifted.filter(
      (id) => CHANCE_RANK[snap.chances[id]] > CHANCE_RANK[prev.chances[id]],
    ).length;
    const down = shifted.length - up;
    const parts = [];
    if (up) parts.push(`выросли у ${up}`);
    if (down) parts.push(`упали у ${down}`);
    lines.push(`Шансы на грант ${parts.join(', ')} программ`);
  }

  if (!lines.length) return null;
  return { lines, snapshot: snap };
}
