#!/usr/bin/env python3
import ast
import pathlib
import re

HTML = (pathlib.Path(__file__).parent.parent / "index.html").read_text()


def read_const(name):
    marker = f"const {name} ="
    start = HTML.index(marker) + len(marker)
    while HTML[start].isspace():
        start += 1
    opening = HTML[start]
    closing = {"[": "]", "{": "}"}[opening]
    depth = 0
    quote = None
    escaped = False
    end = None
    for index in range(start, len(HTML)):
        char = HTML[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in "'\"":
            quote = char
        elif char == opening:
            depth += 1
        elif char == closing:
            depth -= 1
            if depth == 0:
                end = index + 1
                break
    assert end, f"{name} is not closed"
    source = re.sub(r"/\*.*?\*/|//[^\n]*", "", HTML[start:end], flags=re.S)
    source = re.sub(r"([,{]\s*)([A-Za-z_$][\w$]*)(\s*:)", r'\1"\2"\3', source)
    source = re.sub(r"\btrue\b", "True", source)
    source = re.sub(r"\bfalse\b", "False", source)
    source = re.sub(r"\bnull\b", "None", source)
    return ast.literal_eval(source)


prices = read_const("PRICES")
recipes = read_const("RECIPES")
steps = read_const("STEPS")
nutrition = read_const("NUT")

assert len(recipes) == 100, "the built-in library must contain 100 recipes"
assert len({recipe["t"] for recipe in recipes}) == len(recipes), "recipe titles must be unique"

errors = []
for recipe in recipes:
    if not steps.get(recipe["t"]):
        errors.append(f'{recipe["t"]}: missing steps')
    for ingredient, quantity, unit in recipe["ing"]:
        if ingredient not in prices:
            errors.append(f'{recipe["t"]}: no price for {ingredient}')
        elif prices[ingredient]["u"] != unit:
            errors.append(f'{recipe["t"]}: {ingredient} uses {unit}, price book uses {prices[ingredient]["u"]}')
        if ingredient not in nutrition:
            errors.append(f'{recipe["t"]}: no nutrition for {ingredient}')
        if quantity <= 0:
            errors.append(f'{recipe["t"]}: {ingredient} has an invalid quantity')

recipe_titles = {recipe["t"] for recipe in recipes}
for title in steps:
    if title not in recipe_titles:
        errors.append(f"{title}: steps have no matching recipe")

assert not errors, "\n".join(errors)
assert "WeekPlate v31" in HTML
assert 'id="allergens"' in HTML
assert "user-scalable=no" not in HTML
root = pathlib.Path(__file__).parent.parent
for required in ["manifest.webmanifest", "service-worker.js", "icons/icon-192.png", "icons/icon-512.png", "icons/home-hero.jpg", "icons/og-weekplate.jpg", "tests/planner-simulation.html"]:
    assert (root / required).exists(), f"missing {required}"
print(f"WeekPlate integrity checks passed: {len(recipes)} recipes, {len(prices)} prices, {len(nutrition)} nutrition entries.")
