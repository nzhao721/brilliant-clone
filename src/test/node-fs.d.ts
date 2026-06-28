/*
 * Ambient shim for the one Node API our tests use to read source files from disk.
 *
 * `@types/node` is intentionally NOT part of the app's tsconfig program: keeping Node
 * globals out means e.g. `setTimeout` stays the browser `number` type instead of
 * `NodeJS.Timeout`. A couple of regression tests still need to assert source-level
 * fixes (CSS rules in `styles.css`, the KaTeX stylesheet import in `main.tsx`), and
 * vitest serves `*.css?raw` imports as empty strings — so reading the file via
 * `node:fs` is the only reliable way.
 *
 * This declares ONLY the `node:fs` module (not the `NodeJS` globals), so it does not
 * change any global types. At runtime vitest resolves the real Node builtin.
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
