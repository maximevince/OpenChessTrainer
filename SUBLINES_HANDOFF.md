# Sub-line picker — handoff & follow-up todos

Handoff for continuing the "see forking points / pick a sub-line" work in
OpenChessTrainer. Hand this file to a Claude agent (`claude` in the repo root)
to pick up where the first pass left off.

Branch: `claude/chess-trainer-video-sublines-h79w2g` (already pushed).

---

## What this feature does

Trainees can now **see the forking points in an opening and drill a specific
sub-line** — motivated by the different early-queen-attack refutations taught in
Gotham Chess / Remote Chess Academy videos.

Key fact discovered during research: the opening book was **already a branching
tree** (`BookNode.children`), so forks existed natively. The gaps were the
*content* (named refutation lines) and the *UI* to surface/select them.

## What's already done (this branch)

**Data / schema**
- `src/lib/openings/types.ts` — `OpeningTree` gained optional
  `variations?: OpeningVariation[]` (`{ name, uci[], trap? }`). Backward compatible.
- `scripts/openings.config.ts` — `OpeningSpec.namedLines?: { name, moves, trap? }[]`.
  The **Wayward Queen** is seeded with 5 named lines (clean refutation, a
  queen-trade sideline, and 3 punishment traps).
- `scripts/variations.ts` — shared `attachVariations(tree, spec)` helper: emits
  `variations` and guarantees each named line's forced/trap nodes exist.
- `scripts/build-openings.ts` — calls `attachVariations` on full rebuilds.
- `scripts/build-variations.ts` + `npm run build:variations` — **no-token**
  post-processor that injects variations into already-built JSON (used here
  because this env has no `LICHESS_TOKEN`).
- `static/openings/wayward-queen.json` — regenerated with `variations`.

**Logic**
- `src/lib/openings/pinning.ts` (+ `pinning.test.ts`) — pure helpers:
  `resolvePinnedMove`, `isOnPinnedLine`, `namedBranchesAt`. A single strict-prefix
  rule makes deviation / take-back / line-exhaustion fall back to sampling.
- `src/lib/trainer/trainer.svelte.ts` — `pinnedLine`/`pinnedName` state,
  `pinVariation` / `pinNextMove` / `clearPin`, `onPinnedLine` derived, and a
  one-line `botMove()` hook that follows the pin deterministically (variability
  applies only once off the pinned prefix).

**UI**
- `src/lib/trainer/ForkPanel.svelte` — lists live book branches with play %,
  `main`/`trap`/`theory` badges and named-line labels; click to pin.
- `src/routes/train/+page.svelte` — setup **Variation** dropdown (persisted to
  localStorage), a pinned-status chip, and an opt-in "show all branches as
  arrows" board overlay.

**Verification done:** `npm test` (59/59, incl. new pinning tests), `npm run
build` clean, and a headless-Chromium end-to-end drive confirming the dropdown,
deterministic pinned bot moves, the 5-way fork panel with correct badges, and
branch arrows.

## How to run / verify locally

```sh
npm install
npm test                 # unit tests
npm run dev              # open /train, pick "Wayward Queen" -> "Learn to refute it"
                         #   -> Variation dropdown -> New Game
```
In refute mode you play Black; pin "Clean refutation" and the bot (White) follows
that exact line. Leave it on "Any" and after 1.e4 e5 2.Qh5 the fork panel shows
Black's 5 book options. `npm run build:variations wayward-queen` refreshes the
named-line data without an explorer token.

---

## TODO — follow-ups (prioritised)

### 1. Add the other early queen attacks as openings
Add new entries to `OPENINGS` in `scripts/openings.config.ts`, each with
`seedLines`, `trapLines`, and `namedLines`. Candidates:
- **Napoleon Attack** — `1.e4 e5 2.Qf3` (and `2.Nf3 ... 3.Qf3`), threatening
  Qxf7#; refuted by `...Nf6`/`...Nc6` developing with tempo.
- **Danvers / Parham** — overlaps Wayward Queen (`2.Qh5`); may just be more
  `namedLines` on the existing opening rather than a new one.
- **Black's `...Qh4`** tries vs `1.e4`/`1.d4` (e.g. `1.e4 e5 2.Nf3 Qh4?!`) — a
  Black-side "early queen attack" to refute as White.

After editing config, rebuild:
```sh
LICHESS_TOKEN=lip_xxx npm run build:openings <id>   # full (needs a token)
# or, offline seed-only then attach names:
npm run build:openings -- --seed-only && npm run build:variations
```
Then add the new opening to any UI copy if needed and re-run the E2E check.

### 2. Swap in exact lines from specific videos
If you want the moves to match a specific Gotham/RCA video verbatim, paste the
line (PGN or SAN) and replace/extend the relevant `namedLines[].moves` in
`scripts/openings.config.ts`, then `npm run build:variations <id>`. The build
throws loudly on an illegal SAN, so mistakes surface immediately.

### 3. Make "Hint" prefer the pinned move
`Trainer.showHint()` currently shows the top book move (argmax weight). While
`onPinnedLine` is true, prefer the pinned next user move so the green arrow
matches the line being drilled. File: `src/lib/trainer/trainer.svelte.ts`.

### 4. Optional: "lock the whole line from a fork"
Clicking a fork currently pins one ply (`pinNextMove`) unless the branch begins a
named line. Consider an explicit "drill from here" that walks
`pickMove(children, 0)` to a leaf and pins that full path. Files:
`ForkPanel.svelte`, `trainer.svelte.ts`.

### 5. Housekeeping
- Delete this file before opening a PR (it's a scratch handoff).
- Open a PR when ready (the first pass intentionally did **not** create one).
- Pre-existing `svelte-check` errors in `vite.config.ts` are missing
  `@types/node` types — unrelated to this feature; optionally add
  `@types/node` as a dev dep to silence them.

## Key files map
| Concern | Path |
|---|---|
| Variation schema | `src/lib/openings/types.ts` |
| Pure pin/fork logic (+tests) | `src/lib/openings/pinning.ts`, `pinning.test.ts` |
| Trainer state + botMove hook | `src/lib/trainer/trainer.svelte.ts` |
| Fork panel UI | `src/lib/trainer/ForkPanel.svelte` |
| Setup picker / arrows / chip | `src/routes/train/+page.svelte` |
| Named-line authoring | `scripts/openings.config.ts` |
| Variation emit (shared) | `scripts/variations.ts` |
| Full build / no-token build | `scripts/build-openings.ts`, `scripts/build-variations.ts` |
