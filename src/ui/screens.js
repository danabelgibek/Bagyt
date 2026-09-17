// Отрисовка экранов. Каждая функция возвращает строку HTML, а обработка
// событий целиком построена на делегировании по data-act — поэтому любое
// изменение профиля перерисовывает весь путь и ничего не рассыпается.

import {
  FIELDS, GRADES, GPA_LEVELS, SUBJECT_PAIRS, LANGS, CITIES, MOBILITY,
  BUDGETS, PRIORITIES, ENT_MAX,
  fieldName, pairName, langName, cityName, priorityName, budgetById, points,
} from '../data/taxonomy.js';
import { GRANT_SEATS_LABEL, DATA_NOTE } from '../data/programs.js';
import { WEIGHTS, fmtMoney, projectedScore } from '../lib/scoring.js';
import { CALENDAR_NOTE, CATEGORIES, planProgress } from '../lib/plan.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const STATIONS = [
  { id: 'profile', label: 'Профиль' },
  { id: 'diagnosis', label: 'Диагностика' },
  { id: 'matches', label: 'Рекомендации' },
  { id: 'compare', label: 'Сравнение' },
  { id: 'roadmap', label: 'Маршрут' },
];

const CHANCE_CHIP = {
  high: 'chip--good', good: 'chip--good', border: 'chip--grant',
  low: 'chip--risk', unlikely: 'chip--risk', separate: 'chip--route',
};

const demoChip = (title = 'Демонстрационные данные') =>
  `<span class="chip chip--demo" title="${esc(title)}">демо</span>`;

// ——— шапка со станциями ———

export function topbar(state) {
  const order = STATIONS.map((s) => s.id);
  const nowIdx = order.indexOf(state.screen);
  const stations = STATIONS.map((s, i) => {
    const cls = i < nowIdx ? 'is-done' : i === nowIdx ? 'is-now' : '';
    const reachable = state.completed || i <= nowIdx;
    return `<div class="station ${cls}">
      ${i ? '<span class="station__rail"></span>' : ''}
      <span class="station__dot"></span>
      <button class="station__label" data-act="${reachable ? 'goto' : 'noop'}" data-v="${s.id}"
        ${reachable ? '' : 'disabled'} style="background:none;border:0;cursor:${reachable ? 'pointer' : 'default'}">${s.label}</button>
    </div>`;
  }).join('');

  const back = state.screen !== 'intro'
    ? `<button class="iconbtn" data-act="back" aria-label="Назад">←</button>`
    : '';

  return `<header class="topbar">
    <div class="topbar__row">
      ${back}
      <div class="brand">Bagyt<span>.</span></div>
      <div class="topbar__stage">${state.screen === 'intro' ? 'Начало' : `Этап ${nowIdx + 1} из 5`}</div>
    </div>
    ${state.screen === 'intro' ? '' : `<nav class="stations" aria-label="Этапы">${stations}</nav>`}
  </header>`;
}

export function rail(state) {
  const order = STATIONS.map((s) => s.id);
  const nowIdx = order.indexOf(state.screen);
  const stations = STATIONS.map((s, i) => {
    const cls = i < nowIdx ? 'is-done' : i === nowIdx ? 'is-now' : '';
    const reachable = state.completed || i <= nowIdx;
    return `<div class="station ${cls}">
      <span class="station__dot"></span>
      <button class="station__label" data-act="${reachable ? 'goto' : 'noop'}" data-v="${s.id}"
        ${reachable ? '' : 'disabled'} style="background:none;border:0;cursor:pointer;text-align:left">${s.label}</button>
    </div>`;
  }).join('');
  return `<aside class="rail">
    <div class="tiny" style="margin-bottom:12px">Ваш маршрут</div>
    <nav class="stations" aria-label="Этапы">${stations}</nav>
    <div class="tiny" style="margin-top:20px">${state.completed ? 'Можно вернуться к любому этапу' : 'Этапы откроются по мере заполнения'}</div>
  </aside>`;
}

// ——— 1. Вход ———

export function intro() {
  return `<div class="stack-lg">
    <div class="stack">
      <span class="chip chip--route">Для 11 класса · Казахстан · бакалавриат</span>
      <h1 class="h1">Не список вузов,<br>а ваш маршрут поступления</h1>
      <p class="lead">Семь минут на анкету — и вы получите три программы, которые подходят
      именно вашему баллу, бюджету и паре профильных предметов, с объяснением каждого выбора
      и планом действий до августа 2027 года.</p>
    </div>

    <div class="facts">
      <div class="fact"><span class="fact__k">Что на входе</span><span class="fact__v">Класс, интересы, ожидаемый балл ЕНТ, языки, город, бюджет</span></div>
      <div class="fact"><span class="fact__k">Что на выходе</span><span class="fact__v">Рекомендации с объяснением, сравнение и пошаговый план с датами</span></div>
      <div class="fact"><span class="fact__k">Как считаем</span><span class="fact__v">Шесть проверяемых критериев, без «магии» — вы видите вклад каждого</span></div>
    </div>

    <button class="btn" data-act="start">Заполнить анкету</button>

    <p class="note">Сервис учитывает формальные правила приёма: пару профильных предметов
    ЕНТ и пороговые баллы направлений. Проходные баллы и стоимость обучения —
    демонстрационные ориентиры, они помечены значком «демо» и требуют проверки на сайте вуза.</p>
  </div>`;
}

// ——— 2. Профиль ———

const PROFILE_STEPS = [
  { key: 'grade', title: 'В каком вы классе?', hint: 'От этого зависит, с какого месяца начинается ваш маршрут.' },
  { key: 'interests', title: 'Что вам интересно?', hint: 'Выберите до трёх направлений. Чем точнее, тем осмысленнее подбор.' },
  { key: 'ent', title: 'На какой балл ЕНТ рассчитываете?', hint: `Максимум — ${ENT_MAX}. Если ещё не сдавали, поставьте честную оценку: мы скорректируем её по успеваемости.` },
  { key: 'pair', title: 'Какую пару профильных предметов выберете?', hint: 'Это самое жёсткое ограничение: пара определяет, какие программы вам вообще доступны.' },
  { key: 'langs', title: 'На каких языках готовы учиться?', hint: 'Отметьте все подходящие.' },
  { key: 'geo', title: 'Где вы готовы учиться?', hint: 'Переезд открывает заметно больше вариантов.' },
  { key: 'money', title: 'Какой бюджет на обучение?', hint: 'И что для вас важнее всего при выборе.' },
];

export const PROFILE_TOTAL = PROFILE_STEPS.length;

function choice(act, value, on, label, opts = {}) {
  return `<button class="choice ${opts.box ? 'choice--box' : ''} ${on ? 'is-on' : ''}"
    data-act="${act}" data-v="${esc(value)}" aria-pressed="${on}">
    <span class="choice__mark"></span>
    ${opts.icon ? `<span class="choice__ico">${opts.icon}</span>` : ''}
    <span>${label}</span>
  </button>`;
}

export function profileScreen(state) {
  const i = state.profileStep;
  const step = PROFILE_STEPS[i];
  const p = state.profile;
  const editing = !!state.editing;
  let body = '';

  if (step.key === 'grade') {
    body = `<div class="choices">${GRADES.map((g) =>
      choice('set:grade', g.id, p.grade === g.id, g.name)).join('')}</div>`;
  }

  if (step.key === 'interests') {
    body = `<div class="choices">${FIELDS.map((f) =>
      choice('toggle:interests', f.id, p.interests.includes(f.id), f.name, { box: true, icon: f.icon }),
    ).join('')}</div>
    <p class="tiny mt-s">Выбрано: ${p.interests.length} из 3${p.interests.length >= 3 ? ' — лимит достигнут, новый выбор заменит самый старый' : ''}</p>`;
  }

  if (step.key === 'ent') {
    const { score, adjusted } = projectedScore(p);
    body = `<div class="card card--flat">
      <div class="scorebox">${p.entScore}<small>из ${ENT_MAX}</small></div>
      <input class="slider" type="range" min="30" max="${ENT_MAX}" step="1"
        value="${p.entScore}" data-act="range:entScore" aria-label="Балл ЕНТ">
      <div class="tiny">Порог для национальных вузов — 65, для права и педагогики — 75, для медицины — 70.</div>
    </div>
    <div class="choices choices--2 mt-s">
      ${choice('set:entKnown', 'expected', p.entKnown === 'expected', 'Пока ожидаю')}
      ${choice('set:entKnown', 'actual', p.entKnown === 'actual', 'Уже сдавал')}
    </div>
    <div class="h3 mt-s" style="margin-top:18px">Успеваемость в школе</div>
    <div class="choices mt-s">${GPA_LEVELS.map((g) =>
      choice('set:gpa', g.id, p.gpa === g.id, g.name)).join('')}</div>
    ${p.entKnown === 'expected'
      ? `<p class="note mt-s">Расчётный ориентир: <b>${score}</b> ${adjusted === 0 ? '— без корректировки' : `(${adjusted > 0 ? '+' : ''}${adjusted} за успеваемость)`}. Именно он сравнивается с проходными баллами.</p>`
      : `<p class="note mt-s">Балл уже сдан, поэтому корректировка по успеваемости не применяется: сравниваем с <b>${score}</b>.</p>`}`;
  }

  if (step.key === 'pair') {
    body = `<div class="choices">${SUBJECT_PAIRS.map((s) =>
      choice('set:pair', s.id, p.pair === s.id, s.name)).join('')}</div>
    <p class="note mt-s">Три обязательных предмета — история Казахстана, грамотность чтения
    и математическая грамотность — сдают все. Пара профильных предметов выбирается
    при регистрации на ЕНТ и жёстко определяет доступные группы программ.</p>`;
  }

  if (step.key === 'langs') {
    body = `<div class="choices">${LANGS.map((l) =>
      choice('toggle:langs', l.id, p.langs.includes(l.id), l.name, { box: true })).join('')}</div>
    ${!p.langs.length ? '<p class="note note--warn mt-s">Выберите хотя бы один язык, иначе подбор не сможет отсечь неподходящие программы.</p>' : ''}`;
  }

  if (step.key === 'geo') {
    body = `<div class="h3">Ваш город</div>
    <div class="choices choices--2 mt-s">${CITIES.map((c) =>
      choice('set:city', c.id, p.city === c.id, c.name)).join('')}</div>
    <div class="h3" style="margin-top:18px">Готовность к переезду</div>
    <div class="choices mt-s">${MOBILITY.map((m) =>
      choice('set:mobility', m.id, p.mobility === m.id, m.name)).join('')}</div>`;
  }

  if (step.key === 'money') {
    body = `<div class="choices">${BUDGETS.map((b) =>
      choice('set:budget', b.id, p.budget === b.id, b.name)).join('')}</div>
    <div class="h3" style="margin-top:18px">Что важнее всего</div>
    <p class="tiny">До двух пунктов. Они подсветятся в сравнении вариантов.</p>
    <div class="choices choices--2 mt-s">${PRIORITIES.map((x) =>
      choice('toggle:priorities', x.id, p.priorities.includes(x.id), x.name, { box: true })).join('')}</div>`;
  }

  const blocked = step.key === 'langs' && !p.langs.length
    || step.key === 'interests' && !p.interests.length;

  const nav = editing
    ? `<div class="btn-row">
         <button class="btn btn--ghost" data-act="cancelEdit">Отменить</button>
         <button class="btn" data-act="saveEdit" ${blocked ? 'disabled' : ''}>Сохранить и пересчитать</button>
       </div>`
    : `<button class="btn" data-act="next" ${blocked ? 'disabled' : ''}>
         ${i === PROFILE_TOTAL - 1 ? 'Показать диагностику' : 'Далее'}
       </button>`;

  return `<div class="stack-lg">
    <div class="stack">
      ${editing ? '<span class="chip chip--route">Правка ответа</span>' : `<div class="tiny">Вопрос ${i + 1} из ${PROFILE_TOTAL}</div>`}
      <h2 class="h1" style="font-size:clamp(21px,5.2vw,26px)">${step.title}</h2>
      <p class="small">${step.hint}</p>
    </div>
    <div>${body}</div>
    ${nav}
  </div>`;
}

// ——— 3. Диагностика ———

export function diagnosisScreen(state, diag, result) {
  const p = state.profile;
  return `<div class="stack-lg">
    <div class="stack">
      <div class="tiny">Этап 2 — диагностика</div>
      <h2 class="h1" style="font-size:clamp(22px,5.4vw,28px)">Вот как выглядит ваш профиль</h2>
      <p class="note note--change"><b>Ваша цель:</b> ${esc(diag.goal)}</p>
    </div>

    <div class="facts">
      <div class="fact"><span class="fact__k">Ориентир ЕНТ</span><span class="fact__v">${diag.projected} из ${ENT_MAX}${diag.adjusted ? ` <span class="tiny">(${diag.adjusted > 0 ? '+' : ''}${diag.adjusted} за успеваемость)</span>` : ''}</span></div>
      <div class="fact"><span class="fact__k">Профильные</span><span class="fact__v">${pairName(p.pair)}</span></div>
      <div class="fact"><span class="fact__k">Интересы</span><span class="fact__v">${p.interests.map(fieldName).join(', ') || '—'}</span></div>
      <div class="fact"><span class="fact__k">Языки</span><span class="fact__v">${p.langs.map(langName).join(', ')}</span></div>
      <div class="fact"><span class="fact__k">География</span><span class="fact__v">${cityName(p.city)} · ${MOBILITY.find((m) => m.id === p.mobility).name.toLowerCase()}</span></div>
      <div class="fact"><span class="fact__k">Бюджет</span><span class="fact__v">${budgetById(p.budget).name}</span></div>
    </div>

    <div class="card stack">
      <div class="h3">Сильные стороны</div>
      <ul class="bullets">${diag.strengths.map((s) =>
        `<li class="bullet bullet--plus"><span class="bullet__m">+</span><span>${esc(s)}</span></li>`).join('')}</ul>
      <div class="h3" style="margin-top:6px">Ограничения</div>
      <ul class="bullets">${diag.limits.map((s) =>
        `<li class="bullet bullet--minus"><span class="bullet__m">!</span><span>${esc(s)}</span></li>`).join('')}</ul>
    </div>

    <div class="card card--flat">
      <div class="h3">Что нашлось в каталоге</div>
      <p class="small mt-s">Из ${result.counted} программ формальным требованиям и вашим интересам
      соответствуют <b>${result.matches.length}</b>. Ещё ${result.adjacent.length} —
      смежные варианты, и ${result.blocked.length} закрыты формально: мы покажем, чем именно.</p>
    </div>

    <button class="btn" data-act="goto" data-v="matches">Смотреть рекомендации</button>
  </div>`;
}

// ——— 4. Рекомендации ———

function segbar(parts) {
  const totalW = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  return `<div class="segbar" aria-hidden="true">${parts.map((p) => {
    const weak = p.score < 40 ? 1 : 0;
    const mid = !weak && p.score < 80 ? 1 : 0;
    return `<div class="segbar__seg" style="flex:${p.weight / totalW}" data-weak="${weak}" data-mid="${mid}"
      title="${esc(p.label)}: ${p.score} из 100, вес ${p.weight}%">
      <div class="segbar__fill" style="width:${p.score}%"></div></div>`;
  }).join('')}</div>`;
}

function matchCard(m, idx, state) {
  const pr = m.program;
  const isTarget = state.targetId === pr.id;
  const inCompare = state.compareIds.includes(pr.id);
  const top2 = m.strengths.slice(0, 2);
  return `<article class="card ${isTarget ? 'card--target' : ''} stack">
    <div class="card__head">
      <span class="rank">${idx + 1}</span>
      <div>
        <div class="card__uni">${esc(pr.short)} · ${cityName(pr.city)}${pr.gop ? ` · ${pr.gop}` : ''}</div>
        <div class="card__name">${esc(pr.name)}</div>
      </div>
      <div class="card__score"><b>${m.total}%</b><span>соответствие</span></div>
    </div>

    ${segbar(m.parts)}

    <div class="chips" style="margin-top:12px">
      <span class="chip ${CHANCE_CHIP[m.chance.level]}">${m.chance.label}</span>
      <span class="chip chip--grant">${GRANT_SEATS_LABEL[pr.grantSeats]}</span>
      <span class="chip">${fmtMoney(pr.tuition)}</span>
      ${demoChip('Проходной балл и стоимость — демонстрационные данные')}
      ${isTarget ? '<span class="chip chip--route">Целевая программа</span>' : ''}
      ${m.tierReason ? `<span class="chip chip--grant">${esc(m.tierReason)}</span>` : ''}
    </div>

    <div class="reasons">
      ${top2.map((s) => `<div class="reason">
        <span class="reason__key">${esc(s.label)}</span>
        <span class="reason__txt">${esc(s.explain)}</span></div>`).join('')}
      ${m.caution ? `<div class="reason">
        <span class="reason__key" style="color:var(--grant)">Учтите</span>
        <span class="reason__txt">${esc(m.caution.explain)}</span></div>` : ''}
    </div>

    <div class="btn-row" style="margin-top:4px">
      <button class="btn btn--ghost btn--slim" data-act="open" data-v="${pr.id}">Почему подходит</button>
      <button class="btn btn--ghost btn--slim" data-act="compare" data-v="${pr.id}">
        ${inCompare ? 'В сравнении ✓' : 'Сравнить'}</button>
      <button class="btn btn--slim" data-act="target" data-v="${pr.id}">
        ${isTarget ? 'Выбрано' : 'Выбрать'}</button>
    </div>
  </article>`;
}

const QUICK_EDITS = [
  { step: 2, label: 'Балл ЕНТ', get: (p) => String(projectedScore(p).score) },
  { step: 6, label: 'Бюджет', get: (p) => budgetById(p.budget).name },
  { step: 1, label: 'Интересы', get: (p) => p.interests.map(fieldName).join(', ') || '—' },
  { step: 3, label: 'Профильные', get: (p) => pairName(p.pair) },
  { step: 5, label: 'География', get: (p) => cityName(p.city) },
];

export function matchesScreen(state, result) {
  const p = state.profile;
  const quick = QUICK_EDITS.map((q) =>
    `<button class="check" data-act="edit" data-v="${q.step}">
      <span style="color:var(--ink-3);font-weight:500">${q.label}:</span> ${esc(q.get(p))} ✎
    </button>`).join('');

  const changes = state.changes
    ? `<div class="note note--change"><b>Ответ изменён — вот что стало другим:</b><br>
        ${state.changes.lines.map(esc).join('<br>')}</div>`
    : '';

  const c = result.conflict;
  const conflict = c
    ? `<div class="note note--warn">
        <b>Ваша пара предметов не сочетается с выбранным направлением.</b><br>
        С парой «${esc(c.have)}» вам открыто ${c.openNow === 0 ? 'ни одной программы' : `всего ${c.openNow}`}
        по направлению ${esc(c.fields.join(', ').toLowerCase())}. Это решается только до регистрации
        на ЕНТ — потом пара уже зафиксирована.
        <div class="chips" style="margin-top:10px">
          ${c.options.map((o) => `<button class="check" data-act="fixPair" data-v="${o.id}">
            Взять «${esc(o.name)}» — откроет ${o.count} программ</button>`).join('')}
        </div>
        <div class="tiny" style="margin-top:8px">Или оставьте пару как есть — ниже собраны
        варианты, доступные именно с ней.</div>
      </div>`
    : '';

  const empty = !result.matches.length
    ? `<div class="empty">
        <div class="empty__t">Под эти условия ничего не подошло</div>
        <div class="empty__d">Чаще всего мешает пара профильных предметов или запрет на переезд.
        Измените один ответ выше — список пересчитается сразу.</div>
      </div>`
    : '';

  return `<div class="stack-lg">
    <div class="stack">
      <div class="tiny">Этап 3 — рекомендации</div>
      <h2 class="h1" style="font-size:clamp(22px,5.4vw,28px)">${result.directFits >= 3
        ? `${result.matches.length} программ подходят вашему профилю`
        : `Вот что доступно с вашими ответами`}</h2>
      <p class="small">Проценты — это балл соответствия по шести критериям. Полоска под названием
      показывает вклад каждого: длина сегмента равна его весу в модели, заливка — насколько
      он выполнен. Нажмите «Почему подходит», чтобы увидеть все шесть с числами.</p>
    </div>

    <div>
      <div class="tiny" style="margin-bottom:8px">Измените любой ответ — рекомендации пересчитаются</div>
      <div class="chips">${quick}</div>
    </div>

    ${changes}
    ${conflict}
    ${empty}

    <div class="stack">${result.matches.map((m, i) => matchCard(m, i, state)).join('')}</div>

    ${result.adjacent.length ? `<div class="card card--flat stack">
      <div class="h3">Смежные варианты</div>
      <p class="small">Формально доступны, но либо направление рядом с вашим, либо другой город.</p>
      ${result.adjacent.map((m) => `<div class="reason">
        <span class="reason__key">${m.total}%</span>
        <span class="reason__txt"><b>${esc(m.program.short)} — ${esc(m.program.name)}.</b>
        ${esc(m.parts.find((x) => x.key === 'interest').explain)}
        <button class="link" data-act="open" data-v="${m.program.id}">Подробнее</button></span>
      </div>`).join('')}
    </div>` : ''}

    ${result.blocked.length ? `<div class="card card--flat stack">
      <div class="h3">Закрыто формально</div>
      <p class="small">Это не «не рекомендуем» — это правила приёма, которые нельзя обойти.</p>
      ${result.blocked.map((m) => `<div class="reason">
        <span class="reason__key" style="color:var(--risk)">${esc(m.blockers[0].title)}</span>
        <span class="reason__txt"><b>${esc(m.program.short)} — ${esc(m.program.name)}.</b>
        ${esc(m.blockers[0].fix)}</span>
      </div>`).join('')}
    </div>` : ''}

    <div class="btn-row">
      <button class="btn btn--ghost" data-act="goto" data-v="compare">Сравнить</button>
      <button class="btn" data-act="goto" data-v="roadmap">Построить маршрут</button>
    </div>

    <p class="tiny">${esc(DATA_NOTE)}</p>
  </div>`;
}

// ——— 5. Сравнение ———

const bestOf = (vals, dir) => {
  const nums = vals.filter((v) => typeof v === 'number');
  if (!nums.length) return null;
  return dir === 'max' ? Math.max(...nums) : Math.min(...nums);
};

export function compareScreen(state, items) {
  if (items.length < 2) {
    return `<div class="stack-lg">
      <div class="stack">
        <div class="tiny">Этап 4 — сравнение</div>
        <h2 class="h1" style="font-size:clamp(22px,5.4vw,28px)">Сравнение вариантов</h2>
      </div>
      <div class="empty">
        <div class="empty__t">Нужно минимум два варианта</div>
        <div class="empty__d">Отметьте «Сравнить» на карточках рекомендаций — можно выбрать до трёх.</div>
        <div style="margin-top:14px"><button class="btn btn--slim" data-act="goto" data-v="matches">К рекомендациям</button></div>
      </div>
    </div>`;
  }

  const prio = state.profile.priorities || [];
  const rows = [
    { k: 'Соответствие', p: null, dir: 'max', v: (m) => m.total, f: (m) => `${m.total}%` },
    { k: 'Шансы на грант', p: 'grant', dir: null, f: (m) => `${m.chance.label}${m.chance.gap !== null ? `<br><span class="tiny">разрыв ${m.chance.gap > 0 ? '+' : ''}${m.chance.gap}</span>` : ''}` },
    { k: 'Проходной балл', p: 'grant', dir: 'min', v: (m) => m.program.cutoff, f: (m) => m.program.cutoff ? `${m.program.cutoff} ${demoChip()}` : 'свой конкурс' },
    { k: 'Пороговый балл', p: null, f: (m) => String(m.threshold) },
    { k: 'Стоимость', p: 'cost', dir: 'min', v: (m) => m.program.tuition, f: (m) => `${fmtMoney(m.program.tuition)} ${demoChip()}` },
    { k: 'Грантов', p: 'grant', f: (m) => GRANT_SEATS_LABEL[m.program.grantSeats] },
    { k: 'Город', p: 'city', f: (m) => cityName(m.program.city) },
    { k: 'Языки', p: 'lang', f: (m) => m.program.langs.map(langName).join(', ') },
    { k: 'Репутация', p: 'quality', dir: 'max', v: (m) => m.program.rep, f: (m) => `${'●'.repeat(m.program.rep)}${'○'.repeat(5 - m.program.rep)} ${demoChip()}` },
    { k: 'Трудоустройство', p: 'career', dir: 'max', v: (m) => m.program.career, f: (m) => `${'●'.repeat(m.program.career)}${'○'.repeat(5 - m.program.career)} ${demoChip()}` },
    { k: 'Профильные', p: null, f: (m) => m.program.pairs.length ? m.program.pairs.map(pairName).join('<br>') : 'не требуются' },
  ];

  const head = items.map((m) =>
    `<th><div class="card__uni">${esc(m.program.short)}</div>
     <div style="font-weight:700;font-size:12.5px;line-height:1.2">${esc(m.program.name)}</div>
     <button class="link tiny" data-act="compare" data-v="${m.program.id}" style="margin-top:4px">убрать</button></th>`).join('');

  const body = rows.map((r) => {
    const best = r.dir && r.v ? bestOf(items.map(r.v), r.dir) : null;
    const cells = items.map((m) => {
      const win = best !== null && r.v && r.v(m) === best && items.length > 1;
      return `<td class="${win ? 'win' : ''}">${r.f(m)}</td>`;
    }).join('');
    const hot = r.p && prio.includes(r.p);
    return `<tr class="${hot ? 'is-priority' : ''}"><th>${r.k}${hot ? ' ★' : ''}</th>${cells}</tr>`;
  }).join('');

  return `<div class="stack-lg">
    <div class="stack">
      <div class="tiny">Этап 4 — сравнение</div>
      <h2 class="h1" style="font-size:clamp(22px,5.4vw,28px)">Сравнение по вашим параметрам</h2>
      <p class="small">Строки со звёздочкой — то, что вы назвали важным
      (${prio.map(priorityName).join(', ') || 'не выбрано'}). Зелёным помечено лучшее значение в строке.</p>
    </div>
    <div class="scrollx">
      <table class="cmp">
        <thead><tr><th></th>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div class="btn-row">
      <button class="btn btn--ghost" data-act="goto" data-v="matches">Назад к списку</button>
      <button class="btn" data-act="goto" data-v="roadmap">Маршрут</button>
    </div>
    <p class="tiny">Оценки репутации и трудоустройства — редакционные ориентиры для демонстрации,
    а не официальный рейтинг. ${esc(DATA_NOTE)}</p>
  </div>`;
}

// ——— 6. Маршрут ———

export function roadmapScreen(state, steps, target) {
  const prog = planProgress(steps, state.done);
  const nextId = (steps.find((s) => !state.done[s.id]) || {}).id;

  const list = steps.map((s) => {
    const done = !!state.done[s.id];
    const isNext = s.id === nextId;
    return `<li class="step ${done ? 'is-done' : ''} ${isNext ? 'is-next' : ''}">
      <div class="step__when">${esc(s.when)} · ${CATEGORIES[s.cat].name}</div>
      <div class="step__title">${esc(s.title)}</div>
      <div class="step__detail">${esc(s.detail)}</div>
      <div class="step__meta">
        <button class="check ${done ? 'is-on' : ''}" data-act="done" data-v="${s.id}">
          <span class="check__box">✓</span>${done ? 'Сделано' : 'Отметить'}
        </button>
        ${s.source ? `<a class="chip chip--route" href="${esc(s.source.url)}" target="_blank" rel="noopener">${esc(s.source.label)} ↗</a>` : ''}
        ${s.demo ? demoChip('Даты по циклу 2026 года, кампания 2027 официально не объявлена') : ''}
      </div>
    </li>`;
  }).join('');

  return `<div class="stack-lg">
    <div class="stack">
      <div class="tiny">Этап 5 — маршрут</div>
      <h2 class="h1" style="font-size:clamp(22px,5.4vw,28px)">Ваш план до августа 2027</h2>
      ${target
        ? `<p class="note note--change"><b>Целевая программа:</b> ${esc(target.program.short)} — ${esc(target.program.name)}. План построен под её требования.</p>`
        : `<p class="note note--warn">Целевая программа не выбрана, поэтому план общий.
           <button class="link" data-act="goto" data-v="matches">Выберите программу</button>, и шаги станут точнее.</p>`}
    </div>

    <div class="card stack">
      <div style="display:flex;align-items:baseline;gap:8px">
        <div class="h3">Прогресс</div>
        <div class="tiny" style="margin-left:auto">${prog.complete} из ${prog.total} шагов</div>
      </div>
      <div class="progress"><div class="progress__fill" style="width:${prog.pct}%"></div></div>
    </div>

    <ol class="route">${list}</ol>

    <p class="note">${esc(CALENDAR_NOTE)}</p>
    <div class="btn-row">
      <button class="btn btn--ghost" data-act="goto" data-v="matches">К рекомендациям</button>
      <button class="btn btn--ghost" data-act="reset">Начать заново</button>
    </div>
  </div>`;
}

// ——— 7. Следующее действие ———

export function dock(step, prog) {
  if (!step) {
    return `<div class="dock"><div class="dock__row">
      <div><div class="dock__k">МАРШРУТ ПРОЙДЕН</div>
      <div class="dock__t">Все ${prog.total} шагов отмечены</div></div>
    </div></div>`;
  }
  return `<div class="dock"><div class="dock__row">
    <div style="min-width:0">
      <div class="dock__k">СЛЕДУЮЩИЙ ШАГ</div>
      <div class="dock__t">${esc(step.title)}</div>
      <div class="dock__when">${esc(step.when)} · ${prog.complete}/${prog.total} готово</div>
    </div>
    <button class="btn btn--slim" data-act="done" data-v="${step.id}" style="flex:none">Сделано</button>
  </div></div>`;
}

// ——— лист «почему подходит» ———

export function sheet(m, state) {
  const pr = m.program;
  const rows = m.parts.map((p) => `<div class="reason">
    <span class="reason__key">${esc(p.label)}<br><span style="color:var(--ink-3);font-weight:500">вес ${p.weight}%</span></span>
    <span class="reason__txt"><b>${p.score} из 100.</b> ${esc(p.explain)}</span>
  </div>`).join('');

  const blocks = m.blockers.length
    ? `<div class="note note--warn"><b>Формальное ограничение:</b><br>
        ${m.blockers.map((b) => `${esc(b.title)} — ${esc(b.detail)}`).join('<br><br>')}</div>`
    : '';

  return `<div class="sheet" data-act="closeSheet">
    <div class="sheet__body stack" data-stop="1">
      <div class="sheet__grab"></div>
      <div class="card__uni">${esc(pr.uni)} · ${cityName(pr.city)}${pr.gop ? ` · группа ${pr.gop}` : ''}</div>
      <h2 class="h2">${esc(pr.name)}</h2>
      <div class="chips">
        <span class="chip chip--route">соответствие ${m.total}%</span>
        <span class="chip ${CHANCE_CHIP[m.chance.level]}">${m.chance.label}</span>
        <span class="chip">${fmtMoney(pr.tuition)} ${demoChip()}</span>
      </div>
      <p class="small">${esc(pr.note)}</p>
      ${blocks}
      <div class="card card--flat">
        <div class="h3">Как сложился балл соответствия</div>
        <div class="reasons" style="border-top:0;padding-top:10px;margin-top:0">${rows}</div>
      </div>
      <div class="facts">
        <div class="fact"><span class="fact__k">Проходной</span><span class="fact__v">${pr.cutoff ?? 'свой конкурс'} ${pr.cutoff ? demoChip() : ''}</span></div>
        <div class="fact"><span class="fact__k">Порог</span><span class="fact__v">${m.threshold}</span></div>
        <div class="fact"><span class="fact__k">Языки</span><span class="fact__v">${pr.langs.map(langName).join(', ')}</span></div>
        <div class="fact"><span class="fact__k">Профильные</span><span class="fact__v">${pr.pairs.length ? pr.pairs.map(pairName).join('; ') : 'не требуются'}</span></div>
      </div>
      <a class="btn btn--ghost" href="${esc(pr.site)}" target="_blank" rel="noopener">Официальный сайт вуза ↗</a>
      <div class="btn-row">
        <button class="btn btn--ghost" data-act="compare" data-v="${pr.id}">
          ${state.compareIds.includes(pr.id) ? 'Убрать из сравнения' : 'В сравнение'}</button>
        <button class="btn" data-act="target" data-v="${pr.id}">
          ${state.targetId === pr.id ? 'Целевая' : 'Сделать целевой'}</button>
      </div>
      <p class="tiny">Источник фактов о вузе — его официальный сайт. Проходной балл и стоимость
      помечены «демо»: это ориентиры прошлых кампаний, не гарантия и не официальные цифры.</p>
    </div>
  </div>`;
}
