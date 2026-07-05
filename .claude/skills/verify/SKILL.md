---
name: verify
description: How to build, launch and drive OpenChessTrainer for end-to-end verification.
---

# Verifying OpenChessTrainer

SvelteKit SPA (SSR off, static adapter). Everything runs client-side in the browser.

## Launch

```bash
npm install          # postinstall copies the stockfish WASM engine
npm run dev -- --port 5199   # background; ready in ~1s
```

Open `http://localhost:5199/train` or `/review` with the chrome-devtools MCP tools.

## Driving the board

The board is chessground — squares are NOT in the a11y tree, so `click(uid)` can't move pieces.
Dispatch synthetic mouse events on `cg-board` instead (click-click move):

```js
const board = document.querySelector('cg-board');
const rect = board.getBoundingClientRect(), sq = rect.width / 8;
// white orientation: x = file*sq, y = (7-rank)*sq; black orientation flips both
const px = (s) => { const f = s.charCodeAt(0) - 97, r = Number(s[1]) - 1;
  return { x: rect.left + (7 - f) * sq + sq / 2, y: rect.top + r * sq + sq / 2 }; }; // black orient.
for (const type of ['mousedown', 'mouseup'])
  board.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
```

Wait ~1.5s between moves for the bot reply (engine + 400ms sleep).

## Gotchas

- Svelte 5 batches renders: after a programmatic `button.click()`, `await` ~100ms before reading the DOM.
- To capture a PGN download, patch `URL.createObjectURL` to grab the Blob and
  `HTMLAnchorElement.prototype.click` to suppress the real download; blob URLs are revoked ~1s after export.
- Engine analysis: pick "Fast" and wait for `.accuracy` to appear (poll, ~10s for a short game).
- Panel state reads well via `document.querySelector('.panel').innerText`.
- Stale MCP Chrome holding the profile → `ps aux | grep chrome-devtools-mcp`, kill the parent.
