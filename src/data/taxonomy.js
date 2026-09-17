// Справочники предметной области: направления, профильные предметы ЕНТ,
// пороговые баллы, бюджетные уровни, города.
// Источники по пороговым баллам и формату ЕНТ указаны в SOURCES.

export const ENT_MAX = 140;

export const SOURCES = {
  entFormat: {
    label: 'НЦТ: формат и сроки ЕНТ-2026',
    url: 'https://testcenter.kz/',
  },
  thresholds: {
    label: 'Пороговые баллы ЕНТ-2026',
    url: 'https://www.nur.kz/society/2348017-porogovye-bally-i-granty-vypusknikam-kazahstana-raskryli-informaciyu-po-ent-2026/',
  },
  grantRules: {
    label: 'Правила конкурса на образовательный грант',
    url: 'https://egov.kz/',
  },
  cutoffs: {
    label: 'Проходные баллы на грант прошлых лет',
    url: 'https://univision.kz/grant/passing.html',
  },
};

// Направления. related — смежные направления для «частичного» совпадения.
export const FIELDS = [
  { id: 'it', name: 'Программирование и IT', acc: 'программирование', icon: '⌘', related: ['data', 'eng'] },
  { id: 'data', name: 'Данные, AI и аналитика', acc: 'анализ данных', icon: '∿', related: ['it', 'econ'] },
  { id: 'eng', name: 'Инженерия и производство', acc: 'инженерию', icon: '⚙', related: ['energy', 'build', 'it'] },
  { id: 'energy', name: 'Энергетика и нефтегаз', acc: 'энергетику', icon: '△', related: ['eng', 'build'] },
  { id: 'econ', name: 'Экономика и финансы', acc: 'экономику и финансы', icon: '₸', related: ['biz', 'data'] },
  { id: 'biz', name: 'Бизнес и менеджмент', acc: 'менеджмент', icon: '◫', related: ['econ', 'law'] },
  { id: 'law', name: 'Право', acc: 'право', icon: '§', related: ['biz', 'soc'] },
  { id: 'soc', name: 'Общество, политика, медиа', acc: 'медиа и общественные науки', icon: '◍', related: ['law', 'lang', 'design'] },
  { id: 'med', name: 'Медицина и здоровье', acc: 'медицину', icon: '✚', related: ['bio'] },
  { id: 'bio', name: 'Биология и химия', acc: 'биологию и химию', icon: '◇', related: ['med', 'agro'] },
  { id: 'edu', name: 'Педагогика', acc: 'педагогику', icon: '✎', related: ['lang', 'soc'] },
  { id: 'lang', name: 'Языки и перевод', acc: 'языки и перевод', icon: '⌥', related: ['edu', 'soc'] },
  { id: 'design', name: 'Дизайн и архитектура', acc: 'дизайн', icon: '◐', related: ['build', 'soc'] },
  { id: 'build', name: 'Строительство и архитектура', acc: 'строительство', icon: '⌂', related: ['eng', 'design'] },
  { id: 'agro', name: 'Агро и экология', acc: 'агронауки и экологию', icon: '♁', related: ['bio', 'eng'] },
];

export const fieldById = (id) => FIELDS.find((f) => f.id === id);
export const fieldAcc = (id) => (fieldById(id) ? fieldById(id).acc : id);

// Русская плюрализация: 1 балл, 2 балла, 5 баллов.
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
export const points = (n) => `${n} ${plural(n, 'балл', 'балла', 'баллов')}`;
export const fieldName = (id) => (fieldById(id) ? fieldById(id).name : id);

// Профильные предметы ЕНТ: абитуриент выбирает одну пару.
// Пара определяет, на какие группы образовательных программ он имеет право.
export const SUBJECT_PAIRS = [
  { id: 'math_phys', name: 'Математика — Физика' },
  { id: 'math_geo', name: 'Математика — География' },
  { id: 'math_inf', name: 'Математика — Информатика' },
  { id: 'bio_chem', name: 'Биология — Химия' },
  { id: 'bio_geo', name: 'Биология — География' },
  { id: 'chem_phys', name: 'Химия — Физика' },
  { id: 'hist_law', name: 'Всемирная история — Основы права' },
  { id: 'lang_hist', name: 'Иностранный язык — Всемирная история' },
  { id: 'kaz_lit', name: 'Казахский язык — Казахская литература' },
  { id: 'rus_lit', name: 'Русский язык — Русская литература' },
  { id: 'creative', name: 'Творческий экзамен' },
];

export const pairName = (id) => {
  const p = SUBJECT_PAIRS.find((s) => s.id === id);
  return p ? p.name : id;
};

// Пороговые баллы (общегосударственные, ЕНТ-2026).
// Национальные вузы — 65, остальные — 50; профильные исключения выше.
export const THRESHOLDS = {
  default: 50,
  national: 65,
  byField: {
    law: 75,
    edu: 75,
    med: 70,
    agro: 60,
  },
};

export function thresholdFor(program) {
  const byField = program.fields
    .map((f) => THRESHOLDS.byField[f])
    .filter(Boolean);
  const base = program.national ? THRESHOLDS.national : THRESHOLDS.default;
  return Math.max(base, ...byField, 0);
}

export const LANGS = [
  { id: 'kz', name: 'Казахский' },
  { id: 'ru', name: 'Русский' },
  { id: 'en', name: 'Английский' },
];

export const langName = (id) => {
  const l = LANGS.find((x) => x.id === id);
  return l ? l.name : id;
};

export const CITIES = [
  { id: 'almaty', name: 'Алматы' },
  { id: 'astana', name: 'Астана' },
  { id: 'shymkent', name: 'Шымкент' },
  { id: 'karaganda', name: 'Караганда' },
  { id: 'kaskelen', name: 'Каскелен' },
  { id: 'other', name: 'Другой регион' },
];

export const cityName = (id) => {
  const c = CITIES.find((x) => x.id === id);
  return c ? c.name : id;
};

export const MOBILITY = [
  { id: 'home', name: 'Только мой город' },
  { id: 'majors', name: 'Готов переехать в Алматы или Астану' },
  { id: 'any', name: 'Куда угодно по Казахстану' },
];

// Бюджет: максимум, который семья готова платить за год, в тенге.
export const BUDGETS = [
  { id: 'grant', name: 'Только грант', cap: 0 },
  { id: 'to1', name: 'До 1 млн ₸ в год', cap: 1_000_000 },
  { id: 'to2', name: 'До 2 млн ₸ в год', cap: 2_000_000 },
  { id: 'to4', name: 'До 4 млн ₸ в год', cap: 4_000_000 },
  { id: 'open', name: 'Без жёсткого ограничения', cap: 99_000_000 },
];

export const budgetById = (id) => BUDGETS.find((b) => b.id === id) || BUDGETS[0];

// Что для абитуриента важнее — влияет на сравнение и на порядок объяснений.
export const PRIORITIES = [
  { id: 'grant', name: 'Шансы на грант' },
  { id: 'quality', name: 'Репутация вуза' },
  { id: 'city', name: 'Город и близость к дому' },
  { id: 'cost', name: 'Стоимость обучения' },
  { id: 'lang', name: 'Язык обучения' },
  { id: 'career', name: 'Трудоустройство после выпуска' },
];

export const priorityName = (id) => {
  const p = PRIORITIES.find((x) => x.id === id);
  return p ? p.name : id;
};

export const GRADES = [
  { id: '9', name: '9 класс' },
  { id: '10', name: '10 класс' },
  { id: '11', name: '11 класс' },
  { id: 'grad', name: 'Уже выпустился' },
];

export const GPA_LEVELS = [
  { id: 'low', name: 'В основном тройки', bonus: -6 },
  { id: 'mid', name: 'Четвёрки и тройки', bonus: -2 },
  { id: 'good', name: 'В основном четвёрки', bonus: 2 },
  { id: 'top', name: 'Почти все пятёрки', bonus: 6 },
];

export const gpaBonus = (id) => {
  const g = GPA_LEVELS.find((x) => x.id === id);
  return g ? g.bonus : 0;
};
