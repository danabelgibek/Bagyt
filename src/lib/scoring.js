// Движок подбора. Полностью детерминированный и объяснимый:
// каждый балл соответствия раскладывается на компоненты, и у каждого
// компонента есть текстовое объяснение с конкретными числами.
//
// Никакой генерации «на глаз»: одинаковый профиль всегда даёт одинаковый
// результат, а изменение любого ответа предсказуемо меняет итог.
//
// Отбор идёт в три слоя:
//   1. формальные требования — пара профильных предметов и пороговый балл;
//      не выполнены → программа вообще недоступна;
//   2. релевантность — направление и география; не совпали → вариант уходит
//      в «смежные», чтобы не вытеснять то, что человек действительно искал;
//   3. балл соответствия — взвешенная сумма шести компонентов.

import {
  fieldById, fieldName, fieldAcc, thresholdFor, budgetById, pairName,
  langName, cityName, gpaBonus, points, ENT_MAX,
} from '../data/taxonomy.js';
import { PROGRAMS } from '../data/programs.js';

export const WEIGHTS = {
  interest: 28,
  chance: 26,
  budget: 20,
  city: 12,
  lang: 9,
  subjects: 5,
};

export const COMPONENT_LABEL = {
  interest: 'Совпадение с интересами',
  chance: 'Шансы на поступление',
  budget: 'Бюджет',
  city: 'Город',
  lang: 'Язык обучения',
  subjects: 'Профильные предметы',
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const fmtMoney = (t) =>
  t === 0 ? 'стипендия' : `${(t / 1_000_000).toFixed(1).replace('.', ',')} млн ₸/год`;

// Ожидаемый балл корректируется на успеваемость, только если балл ещё не сдан.
export function projectedScore(profile) {
  const raw = Number(profile.entScore) || 0;
  if (profile.entKnown === 'actual') return { score: raw, adjusted: 0 };
  const adj = gpaBonus(profile.gpa);
  return { score: clamp(raw + adj, 0, ENT_MAX), adjusted: adj };
}

// ——— Шансы на грант ———

const CHANCE_LEVELS = [
  { id: 'high', min: 10, label: 'Высокие шансы на грант', score: 100 },
  { id: 'good', min: 3, label: 'Хорошие шансы на грант', score: 85 },
  { id: 'border', min: -4, label: 'На границе проходного балла', score: 60 },
  { id: 'low', min: -14, label: 'Низкие шансы на грант', score: 30 },
  { id: 'unlikely', min: -999, label: 'Грант маловероятен', score: 10 },
];

const SEAT_ADJUST = { high: 4, mid: 0, low: -4 };

export function grantChance(program, profile) {
  if (program.track === 'alt') {
    return {
      level: 'separate',
      label: 'Отдельный конкурс, не по ЕНТ',
      score: 55,
      gap: null,
      explain:
        `${program.short} отбирает не по баллу ЕНТ, а через свой конкурс и ` +
        'подготовительный год. Балл ЕНТ здесь ничего не решает.',
    };
  }
  const { score: proj } = projectedScore(profile);
  const seat = SEAT_ADJUST[program.grantSeats] ?? 0;
  const gap = proj + seat - program.cutoff;
  const level = CHANCE_LEVELS.find((l) => gap >= l.min);
  const diff = proj - program.cutoff;
  const direction =
    diff === 0
      ? 'это ровно на уровне вашего ориентира'
      : diff > 0
        ? `это на ${points(diff)} ниже вашего ориентира`
        : `это на ${points(Math.abs(diff))} выше вашего ориентира`;
  return {
    level: level.id,
    label: level.label,
    score: level.score,
    gap: diff,
    explain:
      `Ваш ориентир — ${proj} из ${ENT_MAX}. Грант здесь в прошлые годы ` +
      `закрывался на ${program.cutoff} баллах: ${direction}.`,
  };
}

// ——— Компоненты соответствия ———

function interestPart(program, profile) {
  const picked = profile.interests || [];
  const direct = program.fields.filter((f) => picked.includes(f));
  if (direct.length) {
    return {
      tier: 'direct',
      score: 100,
      explain: `Прямое попадание в ваш интерес «${fieldName(direct[0])}».`,
    };
  }
  const related = program.fields.find((f) => {
    const fd = fieldById(f);
    return fd && fd.related.some((r) => picked.includes(r));
  });
  if (related) {
    return {
      tier: 'related',
      score: 55,
      explain:
        `Смежное направление: «${fieldName(related)}» соседствует с тем, что вы выбрали, ` +
        'но это не то же самое.',
    };
  }
  return {
    tier: 'none',
    score: 0,
    explain: 'Направление не связано с тем, что вы выбрали.',
  };
}

function budgetPart(program, profile, chance) {
  const b = budgetById(profile.budget);
  if (program.tuition === 0) {
    return { score: 100, explain: 'Обучение покрывается стипендией вуза.' };
  }
  if (b.cap === 0) {
    const map = { high: 100, good: 85, border: 55, low: 25, unlikely: 8, separate: 70 };
    return {
      score: map[chance.level] ?? 30,
      explain:
        'Вы рассчитываете только на грант, поэтому всё зависит от шансов: ' +
        `${chance.label.toLowerCase()}. Платно здесь ${fmtMoney(program.tuition)}.`,
    };
  }
  const t = program.tuition;
  if (t <= b.cap * 0.6) {
    return { score: 100, explain: `${fmtMoney(t)} — заметно ниже вашего лимита.` };
  }
  if (t <= b.cap) {
    return { score: 85, explain: `${fmtMoney(t)} — укладывается в ваш бюджет.` };
  }
  if (t <= b.cap * 1.3) {
    return { score: 40, explain: `${fmtMoney(t)} — немного выше лимита, платно будет тяжело.` };
  }
  return {
    score: 10,
    explain: `${fmtMoney(t)} — сильно выше вашего лимита, реально только на грант.`,
  };
}

function langPart(program, profile) {
  const mine = profile.langs || [];
  const shared = program.langs.filter((l) => mine.includes(l));
  if (shared.length) {
    return {
      score: 100,
      explain: `Есть обучение на вашем языке: ${shared.map(langName).join(', ').toLowerCase()}.`,
    };
  }
  return {
    score: 25,
    explain:
      `Обучение только на ${program.langs.map(langName).join(' / ').toLowerCase()} — ` +
      'язык придётся подтянуть до начала учёбы.',
  };
}

function cityPart(program, profile) {
  const same = program.city === profile.city;
  const major = program.city === 'almaty' || program.city === 'astana';
  if (same) {
    return { fits: true, score: 100, explain: `Вуз в вашем городе — ${cityName(program.city)}.` };
  }
  if (profile.mobility === 'home') {
    return {
      fits: false,
      score: 0,
      explain:
        `Вуз в ${cityName(program.city)}, а вы не планируете переезд — ` +
        'придётся менять либо город, либо вариант.',
    };
  }
  if (profile.mobility === 'majors') {
    return major
      ? { fits: true, score: 90, explain: `${cityName(program.city)} — город, в который вы готовы переехать.` }
      : {
          fits: false,
          score: 20,
          explain: `${cityName(program.city)} не входит в города, куда вы готовы переехать.`,
        };
  }
  return { fits: true, score: 85, explain: `${cityName(program.city)} — вы открыты к переезду.` };
}

function subjectsPart(program, profile) {
  if (program.track === 'alt') {
    return { score: 70, explain: 'Пара профильных предметов ЕНТ здесь не требуется.' };
  }
  if (program.pairs.includes(profile.pair)) {
    return { score: 100, explain: `Ваша пара «${pairName(profile.pair)}» подходит.` };
  }
  return {
    score: 0,
    explain: `Нужна другая пара: ${program.pairs.map(pairName).join(' или ')}.`,
  };
}

// ——— Формальные блокировки ———

function blockers(program, profile, parts) {
  const out = [];
  if (program.track !== 'alt' && parts.subjects.score === 0) {
    out.push({
      type: 'subjects',
      title: 'Не та пара профильных предметов',
      detail:
        `Вы выбрали «${pairName(profile.pair)}», а здесь принимают с ` +
        `${program.pairs.map(pairName).join(' или ')}. Без нужной пары заявление не примут.`,
      fix: 'Сменить пару профильных предметов в профиле или выбрать другую программу.',
    });
  }
  const need = thresholdFor(program);
  const { score: proj } = projectedScore(profile);
  if (program.track !== 'alt' && proj < need) {
    out.push({
      type: 'threshold',
      title: `Ниже порогового балла (${need})`,
      detail:
        `Государство установило порог ${need} баллов для этого направления, ` +
        `а ваш ориентир — ${proj}. Нужно добрать минимум ${points(need - proj)}.`,
      fix: `Поднять балл до ${need} или выше.`,
    });
  }
  return out;
}

// ——— Итоговая оценка одной программы ———

export function scoreProgram(program, profile) {
  const chance = grantChance(program, profile);
  const interest = interestPart(program, profile);
  const city = cityPart(program, profile);
  const parts = {
    interest,
    chance: { score: chance.score, explain: chance.explain },
    budget: budgetPart(program, profile, chance),
    city,
    lang: langPart(program, profile),
    subjects: subjectsPart(program, profile),
  };

  const total = Math.round(
    Object.keys(WEIGHTS).reduce((acc, k) => acc + (parts[k].score * WEIGHTS[k]) / 100, 0),
  );

  const blocks = blockers(program, profile, parts);
  const ordered = Object.keys(WEIGHTS)
    .map((k) => ({ key: k, label: COMPONENT_LABEL[k], weight: WEIGHTS[k], ...parts[k] }))
    .sort((a, b) => b.score * b.weight - a.score * a.weight);

  return {
    program,
    total,
    chance,
    parts: ordered,
    blockers: blocks,
    eligible: blocks.length === 0,
    interestTier: interest.tier,
    cityFits: city.fits,
    strengths: ordered.filter((p) => p.score >= 85).slice(0, 3),
    caution: ordered.filter((p) => p.score < 60).slice(-1)[0] || null,
    threshold: thresholdFor(program),
  };
}

// ——— Ранжирование каталога ———
//
// Кейс требует минимум три рекомендации, но бывает честный конфликт: человек
// хочет медицину, а выбрал пару «Математика — Физика», с которой на медицину
// не принимают вообще. Выдумывать три варианта в такой ситуации нельзя.
// Поэтому список собирается по лестнице, и каждый вариант ниже первой ступени
// несёт честную пометку, почему он здесь.

const LADDER = [
  { id: 'a', reason: null,
    test: (s) => s.eligible && s.interestTier === 'direct' && s.cityFits },
  { id: 'b', reason: 'Другой город — в вашей географии прямых вариантов мало',
    test: (s) => s.eligible && s.interestTier === 'direct' },
  { id: 'c', reason: 'Смежное направление — прямых совпадений мало',
    test: (s) => s.eligible && s.interestTier === 'related' },
  { id: 'd', reason: 'Доступно по вашей паре профильных предметов, но направление другое',
    test: (s) => s.eligible },
  { id: 'e', reason: 'Совпадает с интересом, но нужна другая пара профильных предметов',
    test: (s) => !s.eligible && s.interestTier === 'direct'
      && s.blockers.every((b) => b.type === 'subjects') },
];

export function rankPrograms(profile, { limit = 6 } = {}) {
  const scored = PROGRAMS.map((p) => scoreProgram(p, profile));
  const byTotal = (a, b) => b.total - a.total;
  const used = new Set();

  const rungs = LADDER.map((rung) => {
    const items = scored
      .filter((s) => !used.has(s.program.id) && rung.test(s))
      .sort(byTotal);
    items.forEach((s) => {
      used.add(s.program.id);
      s.rung = rung.id;
      if (rung.reason) s.tierReason = rung.reason;
    });
    return items;
  });

  const [a, b, c, d, e] = rungs;
  let matches = a.slice(0, limit);
  const queue = [...b, ...c, ...d, ...e];
  while (matches.length < 3 && queue.length) matches.push(queue.shift());
  if (matches.length > 3) matches = matches.slice(0, Math.max(3, limit));

  const shown = new Set(matches.map((m) => m.program.id));
  const adjacent = [...b, ...c]
    .filter((s) => !shown.has(s.program.id))
    .slice(0, 4);
  const blocked = scored
    .filter((s) => !s.eligible && !shown.has(s.program.id)
      && (s.interestTier === 'direct' || s.interestTier === 'related'))
    .sort(byTotal)
    .slice(0, 4);

  return {
    matches,
    adjacent,
    blocked,
    counted: scored.length,
    directFits: a.length,
    conflict: conflictCheck(profile),
  };
}

// Какие пары профильных предметов открывают интересы пользователя.
export function pairsUnlocking(interests = []) {
  const counts = {};
  PROGRAMS
    .filter((p) => p.pairs.length && p.fields.some((f) => interests.includes(f)))
    .forEach((p) => p.pairs.forEach((pair) => { counts[pair] = (counts[pair] || 0) + 1; }));
  return Object.entries(counts)
    .sort((x, y) => y[1] - x[1])
    .map(([id, n]) => ({ id, name: pairName(id), count: n }));
}

// Конфликт «интерес против пары предметов»: самая полезная вещь, которую
// сервис может сказать одиннадцатикласснику до регистрации на ЕНТ.
export function conflictCheck(profile) {
  const interests = profile.interests || [];
  if (!interests.length) return null;
  const direct = PROGRAMS.filter((p) => p.fields.some((f) => interests.includes(f)));
  const open = direct.filter(
    (p) => p.track === 'alt' || p.pairs.includes(profile.pair),
  );
  if (open.length >= 3) return null;
  const options = pairsUnlocking(interests).filter((o) => o.id !== profile.pair);
  if (!options.length) return null;
  return {
    kind: 'pair',
    have: pairName(profile.pair),
    openNow: open.length,
    options: options.slice(0, 2),
    fields: interests.map(fieldName),
  };
}

// ——— Диагностика профиля ———

export function diagnose(profile) {
  const { score: proj, adjusted } = projectedScore(profile);
  const strengths = [];
  const limits = [];

  if (proj >= 115) strengths.push('Балл в зоне самых конкурентных грантов');
  else if (proj >= 95) strengths.push('Балл позволяет бороться за гранты в сильных вузах');
  else if (proj >= 75) strengths.push('Балл открывает гранты в региональных и профильных вузах');
  else limits.push('Балла пока не хватает для большинства грантов — это приоритет номер один');

  if ((profile.langs || []).includes('en')) {
    strengths.push('Английский открывает программы на английском языке');
  } else {
    limits.push('Без английского закрыты КБТУ, КИМЭП, SDU и часть программ AITU');
  }
  if (profile.gpa === 'top' || profile.gpa === 'good') {
    strengths.push('Хорошая успеваемость — плюс при равных баллах и для «Алтын белгі»');
  }
  if (adjusted !== 0) {
    strengths.push(
      `Ориентир скорректирован на ${adjusted > 0 ? '+' : ''}${adjusted} с учётом успеваемости`,
    );
  }

  if (profile.mobility === 'home') {
    limits.push(`Только ${cityName(profile.city)} — это отсекает большую часть каталога`);
  }
  if (profile.budget === 'grant') {
    limits.push('Расчёт только на грант — платные варианты не подстрахуют');
  }
  if ((profile.interests || []).length > 3) {
    limits.push('Выбрано много направлений сразу — стоит сузить до двух');
  }
  if (!limits.length) {
    limits.push(
      'Проходные баллы меняются каждый год, поэтому запас в 5–7 баллов обязателен',
    );
  }

  return {
    projected: proj,
    adjusted,
    strengths: strengths.slice(0, 4),
    limits: limits.slice(0, 3),
    goal: buildGoal(profile, proj),
  };
}

function buildGoal(profile, proj) {
  const acc = (profile.interests || []).map(fieldAcc);
  const subject = acc.length ? acc.slice(0, 2).join(' и ') : 'выбранное направление';
  const where =
    profile.mobility === 'home'
      ? `в ${cityName(profile.city)}`
      : profile.mobility === 'majors'
        ? 'в Алматы или Астане'
        : 'в любом городе Казахстана';
  const money =
    profile.budget === 'grant' ? 'на гранте' : 'на гранте или платно в рамках бюджета';
  return `Поступить на ${subject} ${where} ${money}. Ориентир по ЕНТ — ${points(proj)}.`;
}
