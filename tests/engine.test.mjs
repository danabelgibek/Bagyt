import assert from 'node:assert';
import { rankPrograms, scoreProgram, diagnose, projectedScore } from '../src/lib/scoring.js';
import { PROGRAMS, programById } from '../src/data/programs.js';
import { buildPlan, nextStep, planProgress } from '../src/lib/plan.js';
import { snapshotOf, diffResult } from '../src/lib/store.js';
import { SUBJECT_PAIRS, FIELDS } from '../src/data/taxonomy.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ok  ' + name); };

const base = {
  grade: '11', interests: ['it'], gpa: 'good', entScore: 112, entKnown: 'expected',
  pair: 'math_phys', langs: ['ru', 'en'], city: 'almaty', mobility: 'majors',
  budget: 'to2', priorities: ['grant'],
};

t('каталог непустой и без дублей id', () => {
  assert.ok(PROGRAMS.length >= 40, 'мало программ: ' + PROGRAMS.length);
  const ids = new Set(PROGRAMS.map(p => p.id));
  assert.equal(ids.size, PROGRAMS.length);
});

t('все пары предметов существуют в справочнике', () => {
  const valid = new Set(SUBJECT_PAIRS.map(p => p.id));
  for (const p of PROGRAMS) for (const pair of p.pairs) assert.ok(valid.has(pair), p.id + ': ' + pair);
});

t('все направления существуют в справочнике', () => {
  const valid = new Set(FIELDS.map(f => f.id));
  for (const p of PROGRAMS) for (const f of p.fields) assert.ok(valid.has(f), p.id + ': ' + f);
});

t('выдаётся минимум 3 подходящих варианта', () => {
  const r = rankPrograms(base);
  assert.ok(r.matches.length >= 3, 'найдено ' + r.matches.length);
});

t('балл соответствия в диапазоне 0-100 и компоненты в сумме дают его', () => {
  const r = rankPrograms(base);
  for (const m of r.matches) {
    assert.ok(m.total >= 0 && m.total <= 100, m.program.id + ' -> ' + m.total);
    const sum = Math.round(m.parts.reduce((a, p) => a + p.score * p.weight / 100, 0));
    assert.equal(sum, m.total);
  }
});

t('неподходящая пара предметов блокирует программу', () => {
  const s = scoreProgram(programById('kaznmu-med'), base);
  assert.ok(!s.eligible);
  assert.ok(s.blockers.some(b => b.type === 'subjects'));
});

t('балл ниже порога блокирует право/педагогику', () => {
  const s = scoreProgram(programById('mnu-law'), { ...base, pair: 'hist_law', entScore: 60, gpa: 'mid' });
  assert.ok(s.blockers.some(b => b.type === 'threshold'), JSON.stringify(s.blockers));
});

t('снижение бюджета меняет состав рекомендаций', () => {
  const rich = rankPrograms({ ...base, budget: 'open' });
  const poor = rankPrograms({ ...base, budget: 'grant' });
  assert.notDeepEqual(rich.matches.map(m => m.program.id), poor.matches.map(m => m.program.id));
});

t('смена интереса меняет топ-1', () => {
  const it = rankPrograms({ ...base, interests: ['it'] });
  const med = rankPrograms({ ...base, interests: ['med'], pair: 'bio_chem' });
  assert.notEqual(it.matches[0].program.id, med.matches[0].program.id);
});

t('рост балла ЕНТ повышает шансы, не понижая их', () => {
  const low = rankPrograms({ ...base, entScore: 80 });
  const high = rankPrograms({ ...base, entScore: 130 });
  const rank = { unlikely: 0, low: 1, border: 2, good: 3, high: 4, separate: 2 };
  const avg = r => r.matches.reduce((a, m) => a + rank[m.chance.level], 0) / r.matches.length;
  assert.ok(avg(high) > avg(low), avg(high) + ' vs ' + avg(low));
});

t('ограничение на свой город режет выдачу по географии', () => {
  const r = rankPrograms({ ...base, city: 'karaganda', mobility: 'home' });
  assert.ok(r.matches.some(m => m.program.city === 'karaganda'), 'нет местных вузов в выдаче');
});

t('успеваемость корректирует только ожидаемый балл', () => {
  assert.equal(projectedScore({ entScore: 100, entKnown: 'actual', gpa: 'top' }).score, 100);
  assert.equal(projectedScore({ entScore: 100, entKnown: 'expected', gpa: 'top' }).score, 106);
});

t('диагностика даёт цель и ограничения', () => {
  const d = diagnose({ ...base, mobility: 'home', budget: 'grant' });
  assert.ok(d.goal.length > 20);
  assert.ok(d.limits.length >= 1);
  assert.ok(d.strengths.length >= 1);
});

t('маршрут строится и содержит все категории', () => {
  const r = rankPrograms(base);
  const steps = buildPlan(base, r.matches[0]);
  assert.ok(steps.length >= 10, 'шагов ' + steps.length);
  const cats = new Set(steps.map(s => s.cat));
  for (const c of ['academic', 'exam', 'docs', 'deadline', 'activity']) assert.ok(cats.has(c), 'нет ' + c);
});

t('маршрут зависит от профиля', () => {
  const r = rankPrograms(base);
  const a = buildPlan({ ...base, budget: 'grant', gpa: 'top' }, r.matches[0]).map(s => s.id);
  const b = buildPlan(base, r.matches[0]).map(s => s.id);
  assert.notDeepEqual(a, b);
  assert.ok(a.includes('plan-b') && a.includes('altyn'));
});

t('следующий шаг и прогресс считаются корректно', () => {
  const r = rankPrograms(base);
  const steps = buildPlan(base, r.matches[0]);
  assert.equal(nextStep(steps, {}).id, steps[0].id);
  const done = { [steps[0].id]: true };
  assert.equal(nextStep(steps, done).id, steps[1].id);
  assert.equal(planProgress(steps, done).complete, 1);
});

t('diff фиксирует изменение рекомендаций', () => {
  const before = rankPrograms(base);
  const snap = snapshotOf(before);
  const after = rankPrograms({ ...base, budget: 'grant', entScore: 85 });
  const d = diffResult(snap, after);
  assert.ok(d && d.lines.length >= 1, 'diff пустой');
});

t('одинаковый профиль даёт одинаковый результат', () => {
  const a = rankPrograms(base).matches.map(m => [m.program.id, m.total]);
  const b = rankPrograms(base).matches.map(m => [m.program.id, m.total]);
  assert.deepEqual(a, b);
});

console.log('\n' + pass + ' проверок пройдено');

// ——— добавлено после нагрузочной проверки всех комбинаций профиля ———
import { pairsUnlocking, conflictCheck } from '../src/lib/scoring.js';
const FIELD_IDS = FIELDS.map(f => f.id);
const PAIR_IDS = SUBJECT_PAIRS.map(p => p.id);

t('минимум 3 рекомендации для любой комбинации профиля', () => {
  let bad = [];
  for (const f of FIELD_IDS) for (const pair of PAIR_IDS)
    for (const mob of ['home', 'majors', 'any']) for (const b of ['grant', 'to2', 'open']) {
      const p = { ...base, interests: [f], pair, mobility: mob, budget: b, entScore: 100, langs: ['ru','kz','en'] };
      const r = rankPrograms(p);
      if (r.matches.length < 3) bad.push(`${f}/${pair}/${mob}/${b}=${r.matches.length}`);
    }
  assert.equal(bad.length, 0, 'недобор в: ' + bad.slice(0, 5).join(', '));
});

t('каждая пара профильных предметов имеет минимум 3 программы', () => {
  for (const pair of PAIR_IDS) {
    const n = PROGRAMS.filter(p => p.pairs.includes(pair)).length;
    assert.ok(n >= 3, pair + ': ' + n);
  }
});

t('конфликт «интерес против пары» определяется и предлагает рабочую замену', () => {
  const c = conflictCheck({ ...base, interests: ['med'], pair: 'math_phys' });
  assert.ok(c, 'конфликт не найден');
  assert.ok(c.options.length >= 1, 'нет предложений');
  const fixed = rankPrograms({ ...base, interests: ['med'], pair: c.options[0].id });
  assert.ok(fixed.matches.some(m => m.program.fields.includes('med')), 'замена не открыла медицину');
  assert.equal(conflictCheck({ ...base, interests: ['med'], pair: 'bio_chem' }), null, 'ложный конфликт');
});

t('варианты ниже первой ступени помечены причиной', () => {
  const r = rankPrograms({ ...base, interests: ['med'], pair: 'math_phys' });
  const low = r.matches.filter(m => m.rung !== 'a');
  assert.ok(low.length >= 1);
  assert.ok(low.every(m => m.tierReason && m.tierReason.length > 10), 'есть вариант без объяснения');
});

t('pairsUnlocking возвращает пары по убыванию числа программ', () => {
  const o = pairsUnlocking(['it']);
  assert.ok(o.length >= 1);
  assert.ok(o[0].count >= (o[1] ? o[1].count : 0));
});

console.log('\nитого ' + pass + ' проверок движка');
