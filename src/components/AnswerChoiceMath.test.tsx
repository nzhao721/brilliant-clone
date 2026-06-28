import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MathText } from './MathText';

/* `node:fs` is typed via the ambient shim in src/test/node-fs.d.ts (the app tsconfig
   deliberately excludes @types/node). Reading the source files is the reliable way to
   assert the CSS/import fixes: vitest applies no stylesheets and `*.css?raw` is empty. */

/*
 * Regression: practice/lesson/race answer choices used to show small spurious
 * LEFT/RIGHT triangle controls (◀ ▶ / ◁ ▷) under each option's math (e.g. √2, 2√2, √3).
 *
 * Root cause (confirmed by dumping the rendered DOM): those glyphs were never in the
 * DOM at all — they are the Windows-native horizontal scrollbar's end-buttons.
 * `.answer-option` is display:flex, so its child `.answer-option-copy` is a blockified
 * flex item; `overflow-x: auto` makes it a scroll container that the inline KaTeX math
 * overflows by a sub-pixel, so the OS paints a horizontal scrollbar (whose ◀ ▶ buttons
 * appear beneath every option). The fix keeps the box scrollable but hides the
 * scrollbar chrome so nothing can paint.
 *
 * KaTeX's own accessibility node (`.katex-mathml`) is NOT the culprit and must stay:
 * it is present in the DOM but kept visually hidden by the imported `katex.min.css`.
 *
 * These guards lock in every half of the fix:
 *  - the math still renders cleanly (real KaTeX, no error box, no stray arrow glyphs),
 *  - the accessibility MathML node is preserved (not stripped),
 *  - `katex.min.css` is imported (the stylesheet that hides `.katex-mathml`),
 *  - `styles.css` keeps the choice scrollable while suppressing the scrollbar chrome.
 */

const ARROW_GLYPHS = ['\u25C0', '\u25B6', '\u25C1', '\u25B7']; // ◀ ▶ ◁ ▷

describe('answer-choice math renders without spurious scrollbar arrows', () => {
  it.each(['$\\sqrt{2}$', '$2\\sqrt{2}$', '$\\sqrt{3}$'])(
    'renders %s as clean KaTeX with no arrow glyphs in the DOM',
    (label) => {
      // Mirror the real PracticePage / LessonPlayer / RaceView option markup.
      const { container } = render(
        <label className="answer-option">
          <input type="radio" name="q" />
          <span className="answer-option-copy">
            <MathText text={label} />
          </span>
        </label>,
      );

      const copy = container.querySelector('.answer-option-copy');
      // Math actually rendered (not leaked source / error box).
      expect(copy?.querySelector('.katex')).toBeInTheDocument();
      expect(copy?.querySelector('.katex-error')).not.toBeInTheDocument();
      // Accessibility MathML node is preserved (it is hidden by katex.min.css, not removed).
      expect(copy?.querySelector('.katex-mathml')).toBeInTheDocument();

      // No stray triangle glyphs anywhere in the rendered choice: not in the visible
      // text, not in the hidden MathML, not anywhere in the serialized markup.
      const text = copy?.textContent ?? '';
      const html = copy?.innerHTML ?? '';
      for (const glyph of ARROW_GLYPHS) {
        expect(text).not.toContain(glyph);
        expect(html).not.toContain(glyph);
      }
    },
  );

  it('imports the KaTeX stylesheet that visually hides the .katex-mathml node', () => {
    // If this import is dropped, the MathML accessibility node renders visibly and the
    // math itself loses its fonts/layout (the "prime suspect" failure mode). Guard it.
    const mainTsx = readFileSync('src/main.tsx', 'utf8');
    expect(mainTsx).toMatch(/import\s+['"]katex\/dist\/katex\.min\.css['"]/);
  });

  it('keeps the answer-choice scroll box but hides its scrollbar chrome', () => {
    const css = readFileSync('src/styles.css', 'utf8');

    // The box stays a scroll container (wide formulas still scroll in place)...
    expect(css).toMatch(/\.answer-option-copy\s*\{[^}]*overflow-x:\s*auto/);
    // ...but renders no visible scrollbar, so the ◀ ▶ buttons can't paint.
    expect(css).toMatch(/\.answer-option-copy\s*\{[^}]*scrollbar-width:\s*none/);
    expect(css).toMatch(/\.answer-option-copy::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  });
});
