# WeekPlate — Project Handover

**What it is:** a single-file, offline-first meal-planning web app. One `index.html` (~223 KB) containing all HTML, CSS, JS, a 100-recipe library, a price book, a nutrition table, and a self-written PDF engine. No build step, no backend, no dependencies. Runs by opening the file in a browser or dropping it on static hosting (Netlify Drop).

**Current version:** v33 (shown as a badge next to the logo, and in the Guide footer).

**v33:** added per-meal scheduling controls during plan review. Meals can move to open nights or swap days with another dinner, while cook-double meals stay paired with leftovers. Each calendar night can also have its own time limit; choosing a shorter limit automatically finds an eligible faster recipe for that night.

**v32:** added per-person allergen entry beside each person's dietary chips in Setup and onboarding. Individual allergens are identified with the person but excluded from the entire shared plan for safety; the whole-household allergen field remains available.

**v31:** added a dedicated whole-household allergens field in Setup, separate from dislikes. The offline planner excludes matching recipe titles and ingredients, with aliases for common allergen groups such as shellfish, dairy, wheat/gluten, soy, fish, and peanuts.

**v30:** added a mobile weekly dinner calendar and an explicit plan-review stage. New or changed plans must be approved before the shopping list opens; review controls support swapping, locking, resizing, reshuffling, and removing meals.

**v29:** added a discreet, confirmation-protected testing reset under Setup → Saving & backup → Testing tools. It clears this device's saved data and relaunches the app as a brand-new user for onboarding tests.

**v28:** added a four-step, mobile-first onboarding guide for new users covering household needs, planning style, store, and budget. Existing users are not interrupted, and the guide can be reopened from Setup.

**v27:** simplified the home hero by removing the “Private · practical · less waste” eyebrow copy.

**v26:** redesigned empty-plan home screen with an original food-photography hero, clearer primary action, plan summary, and three-step product explanation.

**v25:** installable PWA shell with offline caching and home-screen icons; pantry added/use-by dates with expiry-aware planner weighting; and a browser simulation harness covering 160 randomized planner scenarios.

**v24 takeover note:** the visible AI web-search mode was removed because a static browser app cannot safely hold an API credential, and the existing unauthenticated requests could not succeed reliably. Planning now consistently uses the private, offline library. The dormant legacy functions remain temporarily to keep this release low-risk and can be deleted in a later cleanup.

**Target audience for the app:** the owner and his family, on iPhones, via a Netlify URL added to the Home Screen.

---

## 1. How to run / deploy

- **Locally:** open `index.html` in any modern browser. That's it.
- **Deploy:** drag `index.html` onto https://app.netlify.com/drop . It serves as-is. To update, re-drop the file; users' saved data is unaffected (it lives in their browser, not the file).
- **iPhone install:** open the Netlify URL in Safari → Share → Add to Home Screen → runs full-screen like a native app.

There is no `npm install`, no bundler, no transpile. Everything is vanilla ES2020+ in one `<script>` tag. If you split it into modules for Codex, keep a build step that re-inlines to a single file, because **single-file + no-backend is the core product constraint** — it's what makes it deployable anywhere and privately owned per-device.

---

## 2. Architecture at a glance

Single global state object `S` (see `DEFAULTS` near line 341). Everything reads/writes `S`. `save()` persists it; `render()` redraws the current tab from it. There is no framework — UI is built by functions returning HTML strings assigned to `#main.innerHTML`, with `onclick="..."` handlers calling global functions. Crude but dependency-free and easy to follow.

**Data flow:**
1. `loadState()` on boot → hydrates `S` from storage, runs `migrate()`.
2. User acts → handler mutates `S` → calls `save()` (debounced) and `render()`.
3. `render()` → `renderNav()` + one of the `viewX()` functions.

**Five tabs** (bottom nav): Plan, Shopping, Pantry, Setup, Guide. Tab state is the `tab` variable; `render()` dispatches on it.

---

## 3. Code map (line numbers approximate, single file)

| Section | ~Line | Purpose |
|---|---|---|
| CSS | 20–330 | All styling. CSS variables at `:root`. Mobile-first, max-width 560px. |
| `DEFAULTS` / `S` | 341 | The entire data model. **Read this first.** |
| Storage layer | 367–500 | `rawGet/rawSet` (artifact API → localStorage → memory), `save`, `saveNow`, `loadState`, `migrate`, `exportBackup`, `restoreFromText`. |
| Helpers | 502–524 | `$`, `esc`, `money`, `toast`, `ageFactor`, `targetServings`, `effectiveDiets`, `personLabel`. |
| Legacy Claude API | 526–582 | Dormant since v24; retained temporarily for a low-risk release and safe to delete in a cleanup pass. |
| **PRICES** | 585 | Price book: `{ingredient: {pkg,q,u,w,a,cat}}`. `w`=Walmart, `a`=Aldi price per package; `q`=qty per package in unit `u`; `cat`=aisle category. 141 entries. |
| **RECIPES** | 736 | Library: `{t:title, m:minutes, p:protein-group, tags:[...], ing:[[name,qty4,unit],...]}`. `qty4` = quantity for 4 servings. 100 entries. |
| **STEPS** | 839 | `{title: [step, step, ...]}`. 100 entries, 1:1 with RECIPES. |
| Offline planner | 942–1237 | The heart. `libBuild()` is the main planner. See §4. |
| PDF engine | 1393–1590 | `MiniPDF()` writes raw PDF bytes by hand (no library). `buildPDFDoc()` lays out calendar + recipe pages + shopping list. |
| PDF delivery | 1591–1697 | `makePDF` (share sheet → download → in-app viewer fallbacks), `exportForPDF` (chat-bridge), `shareList`. |
| **NUT** | 1699 | Nutrition per unit: `{ingredient:{c,p,b,f}}` = calories, protein, carbs, fat. 140 entries. |
| Nutrition/cost helpers | 1769–1812 | `recipeNutrition`, `recipeNut4`, `recipeCost4`, `unitPriceOf`, `macroOK`, caches. |
| Aisle ordering | 1814–1877 | `AISLES` (per-store walk order), `SUB` (within-category order), `sortByAisle`, `shopStore`. |
| Receipt OCR | 1878–2042 | `matchIngredient` (fuzzy match receipt text → library ingredient), `parseReceiptText`, `scanReceipt` (Tesseract.js from CDN), review UI, `saveReceipt`. |
| Custom recipes | 2043–2118 | `applyCustomRecipes` (merges `S.customRecipes` into RECIPES/STEPS at boot), form UI, save/delete. |
| Shop mode | 2119–2201 | Full-screen shopping checklist with wake-lock. `renderShop`. |
| Share plan | 2202–2363 | Encode plan into URL hash (`buildSharePayload` → deflate/base64), `checkSharedLink` on boot, `acceptShared` rebuilds it. |
| Meal photos | 2364–2411 | `compressPhoto` (canvas downscale to ~400px JPEG), `addPhoto`, `photoOf`. |
| Make now | 2412–2523 | `makeNowMatches` scores recipes vs pantry, `cookNow` deducts. |
| Rendering | 2524–end | `render`, `renderNav`, and all `viewX()` functions per tab. |

---

## 4. The planner (`libBuild`, ~line 970) — most important logic

Entry points: `libPlan()` (fresh), `libReshuffle()` (keep locked, re-roll rest), `libSwap(i)` (one dinner). All funnel into `libBuild(fixed, keepWeekOf, avoidTitles)` then `finalizeWeek()`.

What it juggles, all at once:
- **Horizon** `S.horizon` (1 or 2 weeks) → plans `dinners × horizon` nights.
- **Leftover nights** `S.leftoverNights` → picks reheat-friendly dishes (`reheatsWell()`), cooks them double (`rec.double=true`), assigns the next day as `rec.leftoverDay`. Reduces cook count.
- **Per-person diets** — each `S.household[i].diet` is a list. A main dish may violate a person only if that person has "alternate allowance" left; otherwise it's filtered out. Allowance = `S.altNights × horizon`, but **0 if no other household member eats a broader set of dishes** (prevents cooking a pointless alternate when everyone shares the restriction, and prevents stranding a person whose restriction is a superset). This subset logic is subtle — see the `safeSet` block. Alternates are generated in `finalizeWeek` for people bumped off ≥1 night.
- **Budget** `S.budgetCap` → paces spend against `budget × horizon`, discourages recipes that blow the running pace. Uses `recipeCost4` (marginal cost, honoring receipt-override prices).
- **Macros** `S.macro` → `mode:'day'` filters each dinner through `macroOK()` (with progressive tolerance relaxation if too strict); `mode:'week'` paces sums. Protein is a minimum, cal/carbs/fat maximums.
- **Favorites** `S.favorites` → each favorite gets a per-week ~34% "promotion" roll; promoted → strong boost, unpromoted → mild suppression, netting ~1-in-3-weeks appearance.
- **Blocklist** `S.blocked` → excluded from the pool entirely.
- **Pantry** `S.pantry` → recipes using pantry items (esp. perishables) get scored up, to use them before they're wasted.
- **Variety** — protein-group cap per week, avoids repeating last week's titles (`S.lastTitles`).

`consolidate()` (line 1333) merges duplicate ingredients across the week, subtracts pantry on hand, and produces the shopping list. `libPrice()` applies prices (receipt overrides in `S.priceBook` beat built-in `PRICES`). `finishWeek()` (1361) rolls purchase leftovers back into the pantry.

**When editing recipe scoring, test with the simulation harness (see §7).** The interactions between diet/leftover/budget/macro are where bugs hide.

---

## 5. Storage & persistence (critical, was the #1 bug source)

`S` is persisted by `rawSet()` which tries, in order:
1. `window.storage` — Claude artifact API. **Only exists inside the Claude app viewer.** Do not assume it exists.
2. `window.localStorage` — works on Netlify / Safari / normal browsers. This is the real backend for deployed use.
3. In-memory only — data lost on close. `storageBackend` variable tracks which won; surfaced in the UI ("✓ Saving (this browser)" / "⚠️ Not saving").

**Gotcha that bit us hard:** the original code only used `window.storage` inside a silent `try/catch`, so on Netlify every save failed invisibly and nothing persisted. If you refactor storage, keep: (a) the fallback chain, (b) flush-on-background via `visibilitychange`/`pagehide`/`beforeunload` (iOS kills backgrounded web apps before a debounce fires), (c) the visible status indicator, (d) export/restore backup as the manual escape hatch.

Photos live in `S.photos` and are the main storage-size risk — hence hard compression. localStorage cap is ~5 MB; a save that would exceed it fails and the UI warns.

---

## 6. Environment quirks discovered the hard way

This app was built inside the Claude iOS app's artifact viewer, which is a **locked sandbox**. These failed there and only work in a real browser (Netlify + Safari):
- `fetch()` to the Claude API (blocked) → why "Library" mode is the default and AI mode is optional/degrades to library.
- File downloads and the print dialog (blocked) → why the PDF engine writes bytes in-JS and delivery tries share-sheet → download → in-app iframe viewer.
- `localStorage` (blocked) → why the storage fallback chain and backup export exist.
- CDN script loads (blocked) → affects Tesseract.js OCR and formerly jsPDF (now removed).
- `navigator.share`, wake-lock — may be blocked.

**None of this is a limitation on Netlify/Safari.** If Codex is testing, test on real static hosting, not inside a restricted webview. The app is written to degrade gracefully and report what it can't do rather than fail silently.

External dependency still present: **Tesseract.js** loaded from `cdn.jsdelivr.net` on first receipt scan only. Everything else is self-contained. If you want zero external deps, receipt OCR is the one thing to replace or drop.

---

## 7. How to test (no framework, but there IS a method)

Throughout development, logic was validated by extracting the `<script>` into a `check.js` and running it in Node with a small DOM/`window` stub, then driving `S` directly and asserting on outcomes across hundreds of simulated weeks. This caught real bugs (diet-stranding, macro unit errors, budget adherence, share cross-contamination). Recommend Codex keep this approach or port it to a proper test runner:

```bash
# extract script
python3 -c "import re;h=open('index.html').read();open('check.js','w').write(re.findall(r'<script>([\s\S]*?)</script>',h)[0])"
# stub window/document, require check.js, then set S and call libPlan(), assert on S.week
```

PDFs were validated by generating bytes and parsing with `pypdf`, plus rasterizing with `pdftoppm` for visual spot-checks.

Key invariants worth regression-testing:
- Every RECIPES ingredient has a PRICES entry with matching unit, and a NUT entry. (One-off sweep script.)
- STEPS is 1:1 with RECIPES.
- Diet: solo-restricted household never gets an off-diet dinner; shared restriction produces no spurious alternates; subset restriction (vegan in a veg household) keeps the shared floor.
- Budget/macro caps hold within tolerance across many runs.
- Share: importing a plan on device B reproduces device A's exact shopping list and never mutates B's pantry/settings.
- cookNow/finishWeek pantry math deducts correctly.

---

## 8. Known limitations / honest state

- **Prices are estimates**, not live data. Walmart/Aldi have no public price API and block scraping (CORS + bot detection), so live pull is impossible from a static file. Receipt scanning is the accurate path — it stores the user's real local prices as overrides. Don't let anyone re-request scraping; it can't work here.
- **Nutrition is approximate** — typical-value table, fine for portion sense, not clinical.
- **Sharing is a snapshot, not live sync.** Real-time (both phones seeing check-offs update) needs a backend — a small cloud DB + a family code. That's the one feature that would justify breaking the no-backend rule, if ever wanted.
- **Data is per-device.** No cross-device sync except manual backup export/restore or the share link.
- **Receipt OCR** on thermal receipts is imperfect by nature — hence the mandatory review-before-save step.

---

## 9. Suggested next features (backlog, in priority order)

1. **Pantry expiry tracking** — log entry date per pantry item, flag aging perishables, weight planner to use them first. Completes the anti-waste system; currently the pantry has no sense of time.
2. **Prep-ahead guidance** — a "Sunday prep" view that batches shared prep across the week ("chop 3 onions, cook 4 cups rice"). The app plans meals but doesn't help *prep*, despite the name.
3. Rate-a-dinner (feeds favorites automatically), ingredient substitutions, split shopping list between two shoppers, seasonal-produce awareness.

---

## 10. Migration notes for Codex

- The whole app is one file; there's no hidden state or config.
- If modularizing: separate concerns are already section-commented (`/* ===== X ===== */`). Natural modules: data (PRICES/RECIPES/STEPS/NUT), planner, pricing, PDF, storage, receipt-OCR, share, and per-tab views. **Re-inline to one file for deployment.**
- Preserve the global-`S` + `render()` model or migrate wholesale to a framework — but a half-migration will be painful because handlers are inline `onclick` strings referencing globals.
- Data tables (PRICES/RECIPES/STEPS/NUT) are hand-authored and cross-validated; keep the validation sweep if you edit them.
- Version badge: search the file for the current `v27` label (two spots: the header badge and the Guide footer) and bump on each release.
