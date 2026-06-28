import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MathText } from './MathText';

/* `node:fs` is typed via the ambient shim in src/test/node-fs.d.ts (the app tsconfig
   deliberately excludes @types/node). Reading the source files is the reliable way to
   assert the CSS/import fixes: vitest applies no stylesheets and `*.css?raw` is empty. */

/*
 * Answer-choice math rendering guards for practice/lesson/race options.
 *
 * The choice WRAPS instead of scrolling: `.answer-option-copy` uses
 * `white-space: normal` + `overflow-wrap: break-word`, and `.answer-option-copy
 * .math-inline` is allowed to wrap so a too-wide equation breaks onto another line.
 *
 * KaTeX's own accessibility node (`.katex-mathml`) must stay: it is present in the
 * DOM but kept visually hidden by the imported `katex.min.css`.
 *
 * These guards lock in the fix:
 *  - the math still renders cleanly (real KaTeX, no error box),
 *  - the accessibility MathML node is preserved (not stripped),
 *  - `katex.min.css` is imported (the stylesheet that hides `.katex-mathml`),
 *  - `styles.css` makes the choice WRAP (no overflow-x scroll container).
 */

describe('answer-choice math rendering', () => {
  it.each(['$\\sqrt{2}$', '$2\\sqrt{2}$', '$\\sqrt{3}$'])(
    'renders %s as clean KaTeX',
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
    },
  );

  it('imports the KaTeX stylesheet that visually hides the .katex-mathml node', () => {
    // If this import is dropped, the MathML accessibility node renders visibly and the
    // math itself loses its fonts/layout (the "prime suspect" failure mode). Guard it.
    const mainTsx = readFileSync('src/main.tsx', 'utf8');
    expect(mainTsx).toMatch(/import\s+['"]katex\/dist\/katex\.min\.css['"]/);
  });

  it('makes answer choices wrap instead of horizontally scrolling', () => {
    const css = readFileSync('src/styles.css', 'utf8');

    // The choice wraps a too-wide formula/word onto multiple lines...
    expect(css).toMatch(/\.answer-option-copy\s*\{[^}]*white-space:\s*normal/);
    expect(css).toMatch(/\.answer-option-copy\s*\{[^}]*overflow-wrap:\s*break-word/);
    // ...and the rendered KaTeX math is allowed to break between atoms.
    expect(css).toMatch(/\.answer-option-copy \.math-inline\s*\{[^}]*white-space:\s*normal/);

    // The box wraps rather than using a horizontal-scroll container.
    expect(css).not.toMatch(/\.answer-option-copy\s*\{[^}]*overflow-x:\s*auto/);
    expect(css).not.toMatch(/\.answer-option-copy::-webkit-scrollbar/);
  });
});
