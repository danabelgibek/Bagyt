// Контроллер. Один цикл: состояние → пересчёт → полная перерисовка.
// Такой подход выбран сознательно: при любом изменении профиля весь путь
// (диагностика, рекомендации, сравнение, маршрут) пересчитывается из одного
// источника, поэтому экраны не могут разойтись между собой.

import { createStore, snapshotOf, diffResult } from './lib/store.js';
import { rankPrograms, diagnose, scoreProgram } from './lib/scoring.js';
import { buildPlan, nextStep, planProgress } from './lib/plan.js';
import { programById } from './data/programs.js';
import {
  topbar, rail, intro, profileScreen, diagnosisScreen, matchesScreen,
  compareScreen, roadmapScreen, dock, sheet, PROFILE_TOTAL,
} from './ui/screens.js';

const store = createStore();
const root = document.getElementById('app');

const LIMITS = { interests: 3, priorities: 2, langs: 3 };
const SHOW_DOCK = new Set(['matches', 'compare', 'roadmap']);

function derive(state) {
  const result = rankPrograms(state.profile);
  const target =
    (state.targetId && result.matches.find((m) => m.program.id === state.targetId))
    || (state.targetId && programById(state.targetId)
        ? scoreProgram(programById(state.targetId), state.profile)
        : null)
    || result.matches[0]
    || null;
  const steps = buildPlan(state.profile, target);
  return {
    result,
    target,
    steps,
    diag: diagnose(state.profile),
    next: nextStep(steps, state.done),
    progress: planProgress(steps, state.done),
  };
}

function screenHtml(state, d) {
  switch (state.screen) {
    case 'profile': return profileScreen(state);
    case 'diagnosis': return diagnosisScreen(state, d.diag, d.result);
    case 'matches': return matchesScreen(state, d.result);
    case 'compare': {
      const items = state.compareIds
        .map((id) => d.result.matches.find((m) => m.program.id === id)
          || (programById(id) ? scoreProgram(programById(id), state.profile) : null))
        .filter(Boolean);
      return compareScreen(state, items);
    }
    case 'roadmap': return roadmapScreen(state, d.steps, d.target);
    default: return intro();
  }
}

let lastScreen = null;

function render() {
  const state = store.state;
  const d = derive(state);
  const showDock = SHOW_DOCK.has(state.screen) && state.completed;

  const warn = store.persisted
    ? ''
    : `<p class="note note--warn">Браузер не разрешает сохранение, поэтому маршрут
       живёт только до перезагрузки страницы. Проверьте, не включён ли приватный режим.</p>`;

  const sheetItem = state.sheet
    ? (d.result.matches.find((m) => m.program.id === state.sheet)
       || d.result.adjacent.find((m) => m.program.id === state.sheet)
       || d.result.blocked.find((m) => m.program.id === state.sheet)
       || (programById(state.sheet) ? scoreProgram(programById(state.sheet), state.profile) : null))
    : null;

  root.innerHTML = `
    ${topbar(state)}
    <div class="layout">
      ${state.screen === 'intro' ? '' : rail(state)}
      <div>
        <main class="main ${showDock ? 'has-dock' : ''}">${warn}${screenHtml(state, d)}</main>
        ${showDock ? `<div class="dock-wrap">${dock(d.next, d.progress)}</div>` : ''}
      </div>
    </div>
    ${sheetItem ? sheet(sheetItem, state) : ''}`;

  if (state.screen !== lastScreen) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    lastScreen = state.screen;
  }
}

// ——— события ———

function act(name, value) {
  const s = store.state;

  if (name === 'start') return store.set({ screen: 'profile', profileStep: 0 });

  if (name === 'next') {
    if (s.profileStep < PROFILE_TOTAL - 1) {
      return store.set({ profileStep: s.profileStep + 1 });
    }
    return store.set({ screen: 'diagnosis', completed: true });
  }

  if (name === 'back') {
    if (s.sheet) return store.set({ sheet: null });
    if (s.editing) return store.set({ editing: false, screen: 'matches' });
    if (s.screen === 'profile' && s.profileStep > 0) {
      return store.set({ profileStep: s.profileStep - 1 });
    }
    const order = ['intro', 'profile', 'diagnosis', 'matches', 'compare', 'roadmap'];
    const i = Math.max(0, order.indexOf(s.screen) - 1);
    return store.set({ screen: order[i] });
  }

  if (name === 'goto') {
    const patch = { screen: value, sheet: null };
    if (value !== 'matches') patch.changes = null;
    if (value === 'matches' && !s.snapshot) {
      patch.snapshot = snapshotOf(rankPrograms(s.profile));
    }
    return store.set(patch);
  }

  if (name === 'edit') {
    return store.set({ screen: 'profile', profileStep: Number(value), editing: true, changes: null });
  }

  if (name === 'saveEdit') {
    const result = rankPrograms(s.profile);
    const changes = diffResult(s.snapshot, result);
    return store.set({
      screen: 'matches',
      editing: false,
      changes,
      snapshot: snapshotOf(result),
    });
  }

  if (name === 'cancelEdit') return store.set({ screen: 'matches', editing: false });

  if (name.startsWith('set:')) {
    const key = name.slice(4);
    return store.setProfile({ [key]: key === 'entScore' ? Number(value) : value });
  }

  if (name.startsWith('toggle:')) {
    const key = name.slice(7);
    return store.toggleProfileList(key, value, LIMITS[key] || Infinity);
  }

  if (name === 'fixPair') {
    store.setProfile({ pair: value });
    const result = rankPrograms(store.state.profile);
    return store.set({ changes: diffResult(s.snapshot, result), snapshot: snapshotOf(result) });
  }

  if (name === 'open') return store.set({ sheet: value });
  if (name === 'closeSheet') return store.set({ sheet: null });

  if (name === 'target') {
    return store.set({ targetId: s.targetId === value ? null : value, sheet: null });
  }

  if (name === 'compare') {
    const on = s.compareIds.includes(value);
    const next = on
      ? s.compareIds.filter((v) => v !== value)
      : [...s.compareIds, value].slice(-3);
    return store.set({ compareIds: next });
  }

  if (name === 'done') return store.toggleDone(value);

  if (name === 'reset') {
    if (window.confirm('Сбросить профиль и маршрут? Отметки о прогрессе тоже удалятся.')) {
      lastScreen = null;
      store.reset();
    }
    return undefined;
  }

  return undefined;
}

root.addEventListener('click', (e) => {
  const stop = e.target.closest('[data-stop]');
  const el = e.target.closest('[data-act]');
  if (!el) return;
  // клик внутри листа не должен его закрывать
  if (el.dataset.act === 'closeSheet' && stop) return;
  if (el.dataset.act === 'noop') return;
  e.preventDefault();
  act(el.dataset.act, el.dataset.v);
});

root.addEventListener('input', (e) => {
  const el = e.target.closest('[data-act^="range:"]');
  if (!el) return;
  store.setProfile({ [el.dataset.act.slice(6)]: Number(el.value) });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && store.state.sheet) store.set({ sheet: null });
});

store.subscribe(render);
render();
