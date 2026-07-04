# OpenChessTrainer

Free, open-source chess opening trainer that runs 100% in your browser — no
backend, no account, no tracking.

**Live: https://www.veemax.be/OpenChessTrainer/**

Pick an opening and either **learn to play it** (you play it, the bot defends
with realistic replies) or **learn to refute it** (the bot plays it — traps
included — and you counter). Every move you make gets instant feedback.

## Features

- **Opening book bot** — bundled opening trees built from the
  [Lichess Opening Explorer](https://lichess.org/analysis#explorer), weighted
  by real games in club-level rating bands. The bot samples the book: a
  variability slider goes from "always the main line" to "explore sidelines".
- **Openings (v1)**: London System, Caro-Kann Defence, Wayward Queen Attack,
  Fried Liver Attack.
- **Per-move feedback** — book moves get instant badges with real play
  percentages; other moves are graded by Stockfish (Best / Good / Inaccuracy /
  Mistake / Blunder).
- **Hints** — green arrow for the top book move, blue arrow for the engine's
  suggestion once out of book.
- **Take back & navigation** — rewind your last move and retry it, or browse
  the game with arrow keys / the move list.
- **Adjustable strength** — Elo 400–2800 via Stockfish (`UCI_Elo`, with
  Skill Level mapping below the engine's 1320 floor).
- **Game review** — fetch your recent games from Chess.com or Lichess and
  analyze them locally: per-move quality badges, per-player accuracy
  (Lichess formulas), and a clickable eval graph. Your games never leave
  your browser.
- **Fully static** — Stockfish 18 (lite single-threaded NNUE WASM) runs in a
  Web Worker; opening data is plain JSON. Works offline once loaded, deploys
  on any static host (no COOP/COEP headers needed).

## Development

```sh
npm install        # also copies the engine into static/stockfish/
npm run dev        # dev server
npm test           # unit tests (pure logic: sampling, UCI parsing, classification)
npm run build      # static production build in build/
BASE_PATH=/OpenChessTrainer npm run preview   # preview under a subpath
```

Stack: SvelteKit + Svelte 5 (runes) with `adapter-static`, TypeScript,
[chessground](https://github.com/lichess-org/chessground),
[chess.js](https://github.com/jhlywa/chess.js),
[stockfish](https://github.com/nmrugg/stockfish.js), Vitest.

## Rebuilding the opening books

The trees in `static/openings/` are generated and committed. To rebuild or add
openings, edit `scripts/openings.config.ts` (seed lines define the system;
rating bands, depth and pruning are per opening), then:

```sh
LICHESS_TOKEN=lip_xxx npm run build:openings          # all openings
LICHESS_TOKEN=lip_xxx npm run build:openings london   # one opening
npm run build:openings -- --seed-only                 # offline: seed lines only
```

The Lichess explorer requires authentication — create a personal token (no
scopes needed) at https://lichess.org/account/oauth/token. The script queries
serially at ~1 req/s with backoff and caches responses in `scripts/.cache/`
(gitignored), so re-runs only pay for new positions.

## Deployment

Pushes to `main` deploy to GitHub Pages via
`.github/workflows/deploy.yml` (builds with `BASE_PATH=/<repo-name>`).

## License & credits

GPL-3.0 (see `LICENSE`) — required by chessground and Stockfish.

- [Chessground](https://github.com/lichess-org/chessground) board (GPL-3.0)
  and the cburnett piece set by Colin M.L. Burnett (CC BY-SA 3.0).
- [Stockfish](https://stockfishchess.org/) engine with NNUE, WASM port by
  [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js) (GPL-3.0).
- [chess.js](https://github.com/jhlywa/chess.js) rules engine (BSD-2-Clause).
- Opening statistics from the
  [Lichess Opening Explorer](https://lichess.org/analysis#explorer)
  (data CC0).
