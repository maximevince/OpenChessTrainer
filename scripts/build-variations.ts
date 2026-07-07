/**
 * Attach `variations` (and any missing forced/trap nodes) to already-built
 * opening books WITHOUT re-querying the Lichess explorer. Use this to add or
 * refresh hand-named lines (`spec.namedLines`) when you don't have a token or
 * don't want to rebuild the whole tree.
 *
 * Run with: npx tsx scripts/build-variations.ts [id ...]  (default: all)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { OPENINGS } from './openings.config';
import { attachVariations } from './variations';
import type { OpeningTree } from '../src/lib/openings/types';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const OUT_DIR = join(ROOT, 'static', 'openings');

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const specs = OPENINGS.filter(
	(s) => (s.namedLines?.length || s.repertoirePgn) && (only.length === 0 || only.includes(s.id))
);

if (specs.length === 0) {
	console.log('No openings with namedLines or a repertoire PGN to process.');
	process.exit(0);
}

for (const spec of specs) {
	const file = join(OUT_DIR, `${spec.id}.json`);
	if (!existsSync(file)) {
		console.warn(`  ${spec.id}: ${file} not found — build it first; skipping.`);
		continue;
	}
	const tree = JSON.parse(readFileSync(file, 'utf8')) as OpeningTree;
	attachVariations(tree, spec); // throws on an illegal named line
	writeFileSync(file, JSON.stringify(tree));
	console.log(`  ${spec.id}: attached ${tree.variations?.length ?? 0} variations → ${spec.id}.json`);
}
