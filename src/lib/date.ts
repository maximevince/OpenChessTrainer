/** Small date-formatting helpers for PGN tags and downloaded filenames. */

const pad = (n: number) => String(n).padStart(2, '0');

/** PGN `Date` tag, e.g. "2026.07.05". */
export function pgnDate(d: Date): string {
	return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/** Compact stamp for filenames, e.g. "20260705-1432". */
export function fileStamp(d: Date): string {
	return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
