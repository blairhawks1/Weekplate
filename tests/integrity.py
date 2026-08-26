#!/usr/bin/env python3
import ast
import json
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

assert len(recipes) == 150, "the built-in library must contain 150 recipes"
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
assert "Sous Chef Shuffle v46" in HTML
assert "WeekPlate v" not in HTML
assert 'class="onboard-brand">Week' not in HTML
assert 'class="onboard-brand">Sous Chef <span>Shuffle</span>' in HTML
assert "let STORE_KEY='weekplate-state'" in HTML  # preserve existing users' on-device data
assert 'id="allergens"' in HTML
assert "p.allergens" in HTML
assert "openMoveMeal" in HTML and "setNightLimit" in HTML
assert "submitWeekFeedback" in HTML and "mealFeedback" in HTML
assert "viewRecipes" in HTML and "addGroceryItem" in HTML and "openGroceryEdit" in HTML
assert "savePlanTemplate" in HTML and "loadPlanTemplate" in HTML and "planTemplates" in HTML
assert "editPlanTemplate" in HTML and "renamePlanTemplate" in HTML and "duplicatePlanTemplate" in HTML
assert "Personal Care" in HTML and "Household supplies" in HTML and 'id="gic"' in HTML
assert "exportCalendar" in HTML and "mealCalendarDate" in HTML and "text/calendar" in HTML
assert "setMealCook" in HTML and "READ-ONLY SHARED PLAN" in HTML and "Save a copy in my Sous Chef Shuffle" in HTML
assert "sundayPrepTasks" in HTML and "openSundayPrep" in HTML and "togglePrepTask" in HTML
assert "SUNDAY PREP MODE" in HTML and "Food-safety note" in HTML and "prepDone" in HTML
assert "createHouseholdSync" in HTML and "joinHouseholdSync" in HTML and "pullHouseholdSync" in HTML
assert "Household account" in HTML and "schema:2,account" in HTML and "syncBanner" in HTML
assert "RECIPE_CATEGORIES" in HTML and "recipeCategories" in HTML and "Group by type" in HTML
assert "weeklyCategories" in HTML and "nightCategories" in HTML and "setNightCategory" in HTML
assert "buildPantryFirst" in HTML and "parseRecipeImport" in HTML and "priorityPantry" in HTML
assert "user-scalable=no" not in HTML
root = pathlib.Path(__file__).parent.parent
for required in ["manifest.webmanifest", "service-worker.js", "worker.js", "icons/icon-192.png", "icons/icon-512.png", "icons/home-hero.jpg", "icons/og-sous-chef-shuffle.png", "tests/planner-simulation.html"]:
    assert (root / required).exists(), f"missing {required}"
worker = (root / "worker.js").read_text()
config = json.loads((root / "wrangler.jsonc").read_text())
assert config["main"] == "worker.js"
assert config["assets"]["run_worker_first"] == ["/api/sync/*"]
assert config["durable_objects"]["bindings"][0]["class_name"] == "HouseholdRoom"
assert config["exports"]["HouseholdRoom"]["storage"] == "sqlite"
assert "crypto.getRandomValues" in worker and "Math.random" not in worker
assert "baseRevision" in worker and "MAX_BODY_BYTES" in worker and "async alarm()" in worker
assert "state_chunks" in worker and "transactionSync" in worker and "CHUNK_CHARACTERS" in worker
print(f"Sous Chef Shuffle integrity checks passed: {len(recipes)} recipes, {len(prices)} prices, {len(nutrition)} nutrition entries.")
