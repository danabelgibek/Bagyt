#!/usr/bin/env python3
"""Сборка одного самодостаточного файла dist/index.html.

Зачем: репозиторий разложен на ES-модули, но для деплоя и офлайн-демо удобно
иметь единственный файл без сборщика и без зависимостей. Скрипт склеивает
модули в порядке зависимостей, снимает import/export и вставляет CSS внутрь.
Никакой минификации — собранный файл остаётся читаемым.
"""
import re
import pathlib

ROOT = pathlib.Path(__file__).parent
ORDER = [
    "src/data/taxonomy.js",
    "src/data/programs.js",
    "src/lib/scoring.js",
    "src/lib/plan.js",
    "src/lib/store.js",
    "src/ui/screens.js",
    "src/app.js",
]

IMPORT_RE = re.compile(r"^import\s+[\s\S]*?from\s+'[^']+';\s*$", re.MULTILINE)
EXPORT_RE = re.compile(r"^export\s+(?=(const|let|function|class)\b)", re.MULTILINE)


def strip_module(src: str) -> str:
    src = IMPORT_RE.sub("", src)
    src = EXPORT_RE.sub("", src)
    leftover = [n for n, l in enumerate(src.splitlines(), 1)
                if re.match(r"^\s*(import|export)\b", l)]
    if leftover:
        raise SystemExit(f"не удалось снять import/export в строках {leftover}")
    return src.strip()


def main() -> None:
    parts = []
    for rel in ORDER:
        code = (ROOT / rel).read_text(encoding="utf-8")
        parts.append(f"/* ===== {rel} ===== */\n{strip_module(code)}")
    bundle = "\n\n".join(parts)
    css = (ROOT / "assets/styles.css").read_text(encoding="utf-8")
    html = (ROOT / "index.html").read_text(encoding="utf-8")

    html = html.replace('<link rel="stylesheet" href="./assets/styles.css">',
                        f"<style>\n{css}\n</style>")
    # Классический script, а не module: собранный файл тогда открывается
    # даже двойным щелчком с диска, без локального сервера.
    html = html.replace('<script type="module" src="./src/app.js"></script>',
                        f"<script>\n(function () {{\n'use strict';\n{bundle}\n}})();\n</script>")
    if "./src/app.js" in html or "./assets/styles.css" in html:
        raise SystemExit("подстановка не сработала — проверьте index.html")

    out = ROOT / "dist"
    out.mkdir(exist_ok=True)
    (out / "index.html").write_text(html, encoding="utf-8")
    kb = len(html.encode()) / 1024
    print(f"dist/index.html собран: {kb:.0f} КБ, модулей {len(ORDER)}")


if __name__ == "__main__":
    main()
