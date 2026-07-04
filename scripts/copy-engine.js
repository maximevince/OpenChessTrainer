// Copies the Stockfish lite single-threaded build (no SharedArrayBuffer needed)
// from node_modules into static/ so it is served verbatim, never bundled by Vite.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish', 'bin');
const dest = join(root, 'static', 'stockfish');

mkdirSync(dest, { recursive: true });
for (const file of ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']) {
	copyFileSync(join(src, file), join(dest, file));
}
console.log('Copied Stockfish engine to static/stockfish/');
