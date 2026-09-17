// Сквозной прогон интерфейса в jsdom: имитируем реальный сценарий проверки жюри.
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const dom = new JSDOM(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), {
  url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.localStorage = window.localStorage;
window.scrollTo = () => {};
window.confirm = () => true;

await import(new URL('../src/app.js', import.meta.url).href);

const $ = sel => window.document.querySelector(sel);
const $$ = sel => [...window.document.querySelectorAll(sel)];
const click = el => { assert.ok(el, 'элемент не найден'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
const byAct = (act, v) => $$(`[data-act="${act}"]`).find(e => v === undefined || e.dataset.v === String(v));
const text = () => window.document.body.textContent;
const noUndef = where => {
  assert.ok(!window.document.body.innerHTML.includes('undefined'), 'в разметке есть undefined: ' + where);
  assert.ok(!text().includes('NaN'), 'в разметке есть NaN: ' + where);
};

let pass = 0;
const t = (n, fn) => { fn(); pass++; console.log('  ok  ' + n); };

t('экран входа отрисован', () => {
  assert.ok(text().includes('маршрут поступления'));
  noUndef('intro');
});

t('анкета проходится до конца', () => {
  click(byAct('start'));
  assert.ok(text().includes('Вопрос 1 из 7'));
  click(byAct('set:grade', '11'));
  click(byAct('next'));
  click(byAct('toggle:interests', 'it'));
  click(byAct('toggle:interests', 'data'));
  click(byAct('next'));
  const slider = $('[data-act="range:entScore"]');
  slider.value = '104';
  slider.dispatchEvent(new window.Event('input', { bubbles: true }));
  click(byAct('set:gpa', 'good'));
  click(byAct('next'));
  click(byAct('set:pair', 'math_phys'));
  click(byAct('next'));
  click(byAct('toggle:langs', 'en'));
  click(byAct('next'));
  click(byAct('set:city', 'almaty'));
  click(byAct('set:mobility', 'majors'));
  click(byAct('next'));
  click(byAct('set:budget', 'to2'));
  click(byAct('toggle:priorities', 'career'));
  click(byAct('next'));
  assert.ok(text().includes('Вот как выглядит ваш профиль'), 'нет диагностики');
  noUndef('diagnosis');
});

t('диагностика содержит цель, сильные стороны и ограничения', () => {
  assert.ok(text().includes('Ваша цель'));
  assert.ok(text().includes('Сильные стороны'));
  assert.ok(text().includes('Ограничения'));
});

t('рекомендаций минимум три, у каждой есть объяснение', () => {
  click(byAct('goto', 'matches'));
  const cards = $$('article.card');
  assert.ok(cards.length >= 3, 'карточек ' + cards.length);
  assert.ok($$('.segbar').length >= 3, 'нет шкал соответствия');
  assert.ok($$('.reason').length >= 6, 'нет объяснений');
  noUndef('matches');
});

t('лист «почему подходит» раскрывает все шесть компонентов', () => {
  click(byAct('open'));
  assert.ok($('.sheet'), 'лист не открылся');
  const keys = $$('.sheet .reason__key').map(e => e.textContent);
  for (const k of ['Совпадение с интересами', 'Шансы на поступление', 'Бюджет', 'Город', 'Язык обучения', 'Профильные предметы']) {
    assert.ok(keys.some(x => x.includes(k)), 'нет компонента: ' + k);
  }
  assert.ok(text().includes('вес 28%'), 'не показан вес компонента');
  noUndef('sheet');
  click($('.sheet'));
  assert.ok(!$('.sheet'), 'лист не закрылся');
});

t('сравнение требует двух вариантов и показывает пустое состояние', () => {
  click(byAct('goto', 'compare'));
  assert.ok(text().includes('Нужно минимум два варианта'));
  click(byAct('goto', 'matches'));
  const ids = $$('[data-act="compare"]').slice(0, 2).map(e => e.dataset.v);
  ids.forEach(id => click(byAct('compare', id)));
  click(byAct('goto', 'compare'));
  assert.ok($('table.cmp'), 'нет таблицы сравнения');
  assert.ok($$('.cmp tbody tr').length >= 8, 'мало параметров сравнения');
  assert.ok($$('.cmp tr.is-priority').length >= 1, 'приоритет пользователя не подсвечен');
  assert.ok($$('.cmp .win').length >= 1, 'лучшие значения не помечены');
  noUndef('compare');
});

t('изменение ответа пересчитывает выдачу и показывает, что изменилось', () => {
  click(byAct('goto', 'matches'));
  const before = $$('article .card__name').map(e => e.textContent.trim());
  click(byAct('edit', '6'));            // шаг «бюджет»
  assert.ok(text().includes('Правка ответа'));
  click(byAct('set:budget', 'grant'));
  click(byAct('saveEdit'));
  assert.ok(text().includes('Ответ изменён'), 'нет блока об изменениях');
  const after = $$('article .card__name').map(e => e.textContent.trim());
  assert.notDeepEqual(before, after, 'выдача не изменилась после смены бюджета');
  noUndef('after-edit');
});

t('смена пары профильных предметов меняет доступные программы', () => {
  const before = $$('article .card__name').map(e => e.textContent.trim());
  click(byAct('edit', '3'));
  click(byAct('set:pair', 'bio_chem'));
  click(byAct('saveEdit'));
  const after = $$('article .card__name').map(e => e.textContent.trim());
  assert.notDeepEqual(before, after, 'пара предметов ни на что не повлияла');
  click(byAct('edit', '3'));
  click(byAct('set:pair', 'math_phys'));
  click(byAct('saveEdit'));
});

t('маршрут строится, шаги отмечаются, прогресс растёт', () => {
  click(byAct('target'));
  click(byAct('goto', 'roadmap'));
  assert.ok(text().includes('Ваш план до августа 2027'));
  const steps = $$('.step');
  assert.ok(steps.length >= 10, 'шагов ' + steps.length);
  assert.ok($('.step.is-next'), 'не выделен следующий шаг');
  const width0 = $('.progress__fill').style.width;
  click($$('.step [data-act="done"]')[0]);
  assert.notEqual($('.progress__fill').style.width, width0, 'прогресс не изменился');
  noUndef('roadmap');
});

t('док «следующий шаг» всегда показывает один шаг', () => {
  const d = $('.dock');
  assert.ok(d, 'нет дока');
  assert.ok(d.textContent.includes('СЛЕДУЮЩИЙ ШАГ'));
  assert.ok(d.querySelector('[data-act="done"]'), 'в доке нет действия');
});

t('источники и пометки «демо» присутствуют', () => {
  assert.ok($$('a[target="_blank"]').length >= 1, 'нет ссылок на источники');
  assert.ok($$('.chip--demo').length >= 1, 'нет пометок демо-данных');
  assert.ok(text().includes('testcenter.kz'), 'нет ссылки на НЦТ');
});

t('состояние сохраняется в localStorage', () => {
  const raw = window.localStorage.getItem('bagyt.v1');
  assert.ok(raw, 'состояние не сохранено');
  const saved = JSON.parse(raw);
  assert.equal(saved.profile.pair, 'math_phys');
  assert.ok(Object.keys(saved.done).length >= 1);
});

t('станции маршрута отражают текущий этап', () => {
  assert.ok($('.station.is-now'), 'нет активной станции');
  assert.ok($$('.station.is-done').length >= 1, 'пройденные станции не отмечены');
});

t('конфликт пары предметов показывается и исправляется одним нажатием', () => {
  click(byAct('goto', 'matches'));
  click(byAct('edit', '1'));
  // перерисовка отсоединяет узлы, поэтому каждый раз ищем заново
  for (let i = 0; i < 20; i++) {
    const on = $$('[data-act="toggle:interests"].is-on')[0];
    if (!on) break;
    click(on);
  }
  click(byAct('toggle:interests', 'med'));
  click(byAct('saveEdit'));
  click(byAct('edit', '3'));
  click(byAct('set:pair', 'math_phys'));
  click(byAct('saveEdit'));
  assert.ok(text().includes('не сочетается с выбранным направлением'), 'нет блока о конфликте');
  const fix = byAct('fixPair');
  assert.ok(fix, 'нет кнопки замены пары');
  assert.ok($$('article.card').length >= 3, 'при конфликте меньше 3 вариантов');
  click(fix);
  assert.ok(!text().includes('не сочетается с выбранным направлением'), 'конфликт не снят');
  assert.ok($$('article .card__name').some(e => /медицин|Фармация|Стоматолог/i.test(e.textContent)),
    'замена пары не открыла медицинские программы');
  noUndef('conflict');
});

console.log('\n' + pass + ' UI-проверок пройдено');
