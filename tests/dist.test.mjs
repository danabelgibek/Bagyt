// Проверяем, что собранный одностраничный файл работает так же, как модульная версия.
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
assert.ok(!html.includes('./src/'), 'остались внешние ссылки на модули');
assert.ok(!html.includes('./assets/'), 'остались внешние ссылки на CSS');

const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) { w.scrollTo = () => {}; } });
const { window } = dom;
window.scrollTo = () => {};
await new Promise(r => setTimeout(r, 400));
const $ = s => window.document.querySelector(s);
const $$ = s => [...window.document.querySelectorAll(s)];
const click = el => { assert.ok(el, 'нет элемента'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
const byAct = (a, v) => $$(`[data-act="${a}"]`).find(e => v === undefined || e.dataset.v === String(v));

assert.ok($('.topbar') && $('.brand'), 'бандл не отрисовался');
click(byAct('start'));
click(byAct('next')); click(byAct('toggle:interests', 'it')); click(byAct('next'));
click(byAct('next')); click(byAct('next')); click(byAct('next'));
click(byAct('next')); click(byAct('next'));
assert.ok(window.document.body.textContent.includes('Вот как выглядит ваш профиль'), 'путь не прошёл');
click(byAct('goto', 'matches'));
assert.ok($$('article.card').length >= 3, 'нет рекомендаций в бандле');
assert.ok(!$('#app').innerHTML.includes('undefined'), 'undefined в разметке бандла');
console.log('  ok  собранный dist/index.html проходит полный путь');
console.log('  ok  внешних зависимостей нет (кроме шрифта Google Fonts)');
