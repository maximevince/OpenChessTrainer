# OpenChessTrainer — Svelte static chess trainer + game review

## Context

Free, fully static, open-source chess webapp running 100% in the browser (no backend; third-party public APIs allowed). Two modes: **Trainer** (priority) — play vs bots that practice a specific opening against you, with difficulty/variability sliders, hints, and instant move feedback; **Review** (later) — fetch public games by username from Chess.com/Lichess and analyze locally (badges, accuracy, eval graph), à la Chess.com Game Review. Chess.com-inspired look (green/cream board, dark chrome). KISS/DRY, phased, trainer first.

Work happens in the existing empty git repo `/home/vinz/Projects/Chess/OpenChessTrainer` (branch `master`, no commits).

## Decisions (agreed with user)

- **Stack:** Svelte 5 (runes) + SvelteKit + `adapter-static`, TypeScript, Vitest for pure logic only. No state/UI libraries.
- **Board:** Chessground (lichess lib) + chess.js for rules → app licensed **GPL-3.0**.
- **Engine:** `stockfish` npm package, **lite single-threaded NNUE build** in a classic Web Worker — no SharedArrayBuffer → no COOP/COEP headers → works on GitHub Pages. Difficulty via `UCI_LimitStrength`/`UCI_Elo` (floor ~1320; map lower slider range to `Skill Level 0–5`).
- **Opening data:** precomputed bundled JSON trees; Node build script queries Lichess Opening Explorer once, output committed. Runtime fully offline.
- **v1 openings:** London System (bot White), Caro-Kann (both sides), trap lines — Wayward Queen/Scholar's Mate, Fried Liver (bot plays aggressor; user practices refuting). Trap lines use low rating bands (400–1200) + hand-seeded `forced` lines.
- Global `ssr = false`, `prerender = true` (client-only app; avoids window/worker guards everywhere).
- Auto-queen promotion in Phase 1; picker in polish phase.

## Structure (end state)

```
scripts/openings.config.ts     # per-opening spec (data)
scripts/build-openings.ts      # npx tsx; writes static/openings/*.json + index.json
static/openings/               # generated, committed
static/stockfish/              # engine .js+.wasm copied from node_modules (postinstall)
static/pieces/cburnett/*.svg   # free piece set (lichess, CC BY-SA)
src/app.css                    # theme tokens: chrome #262421, panel #312e2b, accent #81b64c
src/routes/+layout.svelte      # nav Train|Review; +layout.ts: prerender=true, ssr=false
src/routes/train/+page.svelte
src/routes/review/+page.svelte # Phase 4+
src/lib/game.svelte.ts         # shared chess.js game state (fen, history, dests, move/undo)
src/lib/board/Board.svelte     # thin chessground wrapper (props: fen, orientation, dests, shapes; onUserMove)
src/lib/board/board-theme.css  # cg base css + inline-SVG 2-tone board bg (#779556/#ebecd2) + piece rules
src/lib/engine/engine.ts       # singleton UCI worker wrapper, promise-based, FIFO queue
src/lib/openings/{types,tree,sampling}.ts
src/lib/trainer/{trainer.svelte.ts, classify.ts, FeedbackPanel.svelte, TrainerControls.svelte}
src/lib/review/{fetch,analyse,accuracy}.ts + EvalGraph/MoveList/GamePicker  # Phase 4–5
```

## Phase 1 — Scaffold + board + engine: play full game vs Stockfish

- `npx sv create` (SvelteKit, TS, Vitest); add `@sveltejs/adapter-static`, `chessground`, `chess.js`, `stockfish`. Add GPL-3.0 `LICENSE` now (chessground forces it). `svelte.config.js`: `paths.base = process.env.BASE_PATH ?? ''`.
- `Board.svelte`: chessground instance in onMount/attachment; `$effect` syncs props → `cg.set()`. Board bg = inline-SVG data URI (no binary asset, no base-path issue). Copy cburnett piece SVGs; CSS-relative URLs.
- `engine.ts`: postinstall copies `stockfish-17-lite-single.js/.wasm` → `static/stockfish/`; `new Worker(\`${base}/stockfish/...js\`)`. API: `init()`, `setStrength({elo}|{full})`, `bestMove(fen,{movetimeMs})`, `evaluate(fen,{depth|movetimeMs}) → {cp?, mate?, bestUci, pv}`. FIFO queue, one `go` in flight. **Normalize scores to White's perspective in one place** (classic bug).
- `/train` v0: side picker, Elo slider, New Game; user move → engine reply (~400ms movetime + small delay); game-over banner via chess.js.

**Verify:** full games both colors; Elo 1320 vs 2800 differ; `npm run build && npm run preview` incl. `BASE_PATH=/OpenChessTrainer`; engine loads offline, no COOP/COEP warnings.

## Phase 2 — Opening pipeline + book bot

- **Tree schema:** nested by move path (not FEN — no transposition handling in v1). Node: `{uci, san, weight (game count), wdl?, forced, children[]}`. Root file: `{id, name, botSide, source, root}`. Plus `index.json` manifest for picker.
- `tree.ts`: `loadOpening(id)` (fetch+cache), `follow(root, uciMoves) → node|null`.
- `sampling.ts` (pure): `pickMove(children, temperature)` — t=0 argmax; else `p ∝ weight^(1/T)`, T mapped to [0.3, 1.5]; drop children <1% of max unless `forced`. Injectable RNG.
- **Out-of-book:** once `follow` returns null/leaf → `inBook=false` permanently, chip "Out of book — engine (Elo N) takes over", engine plays rest. No re-entry.
- **Build script:** spec per opening `{id, name, botSide, seedLines (SAN, forced), ratings, speeds, maxDepthPlies, minGames, branchFraction, topMovesPerNode}`. Endpoint `https://explorer.lichess.ovh/lichess?variant=standard&play=<uci,...>&ratings=...&speeds=...&moves=8&topGames=0&recentGames=0`. BFS from root + seed prefixes; prune bot-to-move nodes harder (top 3–4), keep user-to-move nodes broader. chess.js validates SAN↔UCI. **Etiquette:** serial, ~1 req/s, 60s backoff on 429, descriptive User-Agent, disk cache `scripts/.cache/`. Output committed.
- `trainer.svelte.ts` runes class: `opening, userSide, elo, variability, inBook, phase: idle|userTurn|botThinking|gameOver`.

**Verify:** Vitest sampling tests (t=0 deterministic; seeded distribution ≈ weights; forced retained). Spot-check london.json + wayward-queen.json (trap lines present). 10 manual games: low variability repeats mainline, deviation triggers out-of-book chip.

## Phase 3 — Feedback + hints (trainer complete)

- Per user move: **book check first (free)** — child of pre-move node → Book/Book-best badge with sibling stats; else engine delta: `evaluate(fenBefore)` + `evaluate(fenAfter)` at full strength (~400ms each), `delta` in user perspective.
- `classify.ts` (pure): ≤20 Best, ≤60 Good, ≤120 Inaccuracy, ≤250 Mistake, >250 Blunder (cp); mate-throw/allow → Blunder. No "Brilliant" (needs sacrifice detection — skip).
- Feedback runs concurrently with bot reply (queue serializes). Badge feed in right panel.
- Hint button: in book → green arrow on top book move (`drawable.autoShapes`); out of book → engine best, blue arrow. One function, two sources.
- "Undo & retry" after Mistake/Blunder (undo 2 plies) — highest-value training feature, cheap.

**Verify:** classify tests incl. mate + perspective flips; hung queen → Blunder; book badge instant, no engine call; hint arrow matches book/PV.

## Phase 4 — Review: fetch + replay

- `fetch.ts`: Chess.com `api.chess.com/pub/player/{u}/games/archives` → last 1–2 months (CORS, no auth); Lichess `lichess.org/api/games/user/{u}?max=30&pgnInJson=true&opening=true` NDJSON. Normalize to `ReviewGame{site,white,black,result,date,timeControl,pgn}`. Filter non-standard variants. 404 → friendly error. Remember last username in localStorage.
- `/review` v0: username + site toggle → game list → viewer: reused `Board`, clickable move list, ←/→ nav, flip.

**Verify:** real accounts on both sites replay correctly (castling/promotions); offline → clean error.

## Phase 5 — Review: local analysis

- `analyse.ts`: sequential full-strength `evaluate` per ply, movetime user-pick 150/300/600ms (predictable total, ~25s normal for 80 plies); progress rune; cancellable.
- `accuracy.ts` (pure, lichess published formulas): `winPct = 50 + 50*(2/(1+exp(-0.00368208*cp)) - 1)` (clamp ±1000); move accuracy `103.1668*exp(-0.04354*(wBefore-wAfter)) - 3.1669` clamp [0,100]; game accuracy = plain mean (documented approx). Classification by win% drop: 0–2 Best, 2–5 Good, 5–10 Inaccuracy, 10–20 Mistake, >20 Blunder; "Book" via `follow()` on bundled trees (DRY); "Best" when move == bestUci.
- `EvalGraph.svelte`: inline SVG (~60 lines), y = winPct, area split at 50%, click-to-jump.

**Verify:** accuracy tests (cp 0→50%, cp 100→~59%, boundaries); compare a lichess-analyzed game — accuracy within a few points, same blunders flagged.

## Phase 6 — Polish + deploy

- GH Actions → Pages: `BASE_PATH=/OpenChessTrainer npm run build`, upload `build/`. Audit all runtime URLs through `$app/paths` `base` (openings JSON, stockfish worker, pieces). **Per user's global rules: before writing the workflow, WebFetch each action's /releases page and pin current latest major (node24-compatible); `actions/configure-pages` with `enablement: true`.**
- `LICENSE` (GPL-3.0, already from Phase 1) + `CREDITS.md` (chessground, Stockfish+NNUE, cburnett CC BY-SA, Lichess explorer data) + README with `build:openings` instructions.
- localStorage persist trainer settings; promotion picker; responsive (<800px panel below board); title/meta/favicon.

**Verify:** live Pages smoke test both modes, desktop + mobile; fresh-clone `npm ci && npm run build`.

## Gotchas

1. Chessground renders nothing without base CSS + board bg + piece rules — verify first in Phase 1.
2. Never let Vite bundle the engine; serve verbatim from `static/stockfish/`, Worker URL via `base`.
3. UCI scores are side-to-move relative — normalize once in `engine.ts`, unit-test the flip.
4. `UCI_Elo` floor ~1320 — map lower difficulty to `Skill Level`.
5. High-rating explorer buckets lack trap moves (2.Qh5) — low bands + `forced` seed lines mitigate; eyeball generated JSON.
6. No commit trailers (user rule: no Co-Authored-By).
