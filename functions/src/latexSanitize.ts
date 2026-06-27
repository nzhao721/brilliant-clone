// ---------------------------------------------------------------------------
// LaTeX repair + sanitize for OpenAI structured-output corruption.
//
// OpenAI strict structured outputs intermittently MIS-ESCAPE the backslash of a
// LaTeX command in the JSON string. Once that JSON is parsed the backslash has
// collapsed into a CONTROL CHARACTER:
//   - the C-style escapes `\a \b \t \v \f \r \n` consume their letter and become
//     U+0007 / U+0008 / U+0009 / U+000B / U+000C / U+000D / U+000A respectively
//     (e.g. `\theta` -> TAB + "heta", `\frac` -> FF + "rac", `\nabla` -> LF + "abla");
//   - any OTHER `\<letter>` is an INVALID escape and collapses to U+0000 (NUL)
//     with the command letters intact (e.g. `\delta` -> NUL + "delta",
//     `\varepsilon` already uses `\v` -> VT + "arepsilon").
// Some pipelines instead drop a command to U+FFFD (the Unicode replacement char)
// or leave other stray C0/C1 bytes. ALL of these render as KaTeX "no glyph"
// (tofu) boxes if they reach the renderer.
//
// `repairLatexEscapes` maps every recoverable control char back to its
// `\<command>` form (the FULL `\a \b \f \n \r \t \v` set plus the NUL invalid-
// escape case). `stripNonRenderable` then removes anything still un-renderable
// (U+FFFD, residual C0/C1, lone surrogates, non-characters) so clean, correct
// LaTeX — and ONLY clean LaTeX — leaves the function. `sanitizeAiLatex` composes
// the two. The same logic is mirrored client-side as a safety net.
// ---------------------------------------------------------------------------

// Control char -> the backslash escape it was mangled from.
const CONTROL_TO_BACKSLASH: Record<string, string> = {
  '\u0000': '\\', // invalid escape (\d \e \l \s \c \i \m \o ...) -> NUL + letters
  '\u0007': '\\a', // \a  (\alpha, \approx, \arctan, \angle, \aleph, ...)
  '\u0008': '\\b', // \b  (\beta, \bar, \binom, \bmod, ...)
  '\u0009': '\\t', // \t  (\to, \theta, \times, \text, \tan, \tau, \top, ...)
  '\u000b': '\\v', // \v  (\vec, \varepsilon, \varphi, \vartheta, \vee, ...)
  '\u000c': '\\f', // \f  (\frac, \forall, \flat, ...)
  '\u000d': '\\r', // \r  (\rho, \rightarrow, \rangle, ...)
};

// KaTeX commands whose backslash is `\n`. The JSON `\n` escape ate the leading
// 'n', so the surviving body is the command WITHOUT it. We only restore `\n`
// when `n<body>` is a real command, so genuine newlines (followed by ordinary
// prose) are left as newlines and never corrupted into a broken `\n...` token.
const N_COMMAND_BODIES = new Set<string>([
  'abla', // \nabla
  'eq', 'eg', // \neq \neg
  'mid', 'shortmid', // \nmid \nshortmid
  'otin', // \notin
  'leq', 'geq', 'leqq', 'geqq', 'leqslant', 'geqslant', // \nleq \ngeq ...
  'subseteq', 'supseteq', 'subset', 'supset', // \nsubseteq ...
  'parallel', 'sim', 'cong', 'simeq', 'approx', 'equiv', // \nparallel \nsim ...
  'exists', // \nexists
  'rightarrow', 'leftarrow', 'leftrightarrow', // \nrightarrow ...
  'Rightarrow', 'Leftarrow', 'Leftrightarrow',
  'atural', // \natural
  'earrow', 'warrow', // \nearrow \nwarrow
  'vdash', 'Vdash', 'vDash', 'VDash', // \nvdash family
  'prec', 'succ', 'preceq', 'succeq', // \nprec \nsucc ...
]);

/**
 * Restores LaTeX commands whose backslashes OpenAI collapsed into control
 * characters. Recovers the entire `\a \b \f \n \r \t \v` C-escape set and the
 * NUL "invalid escape" case, so `\delta`, `\epsilon`, `\varepsilon`, `\text`,
 * `\frac`, `\nabla`, `\neq`, … all come back as real commands. Clean input (no
 * control chars) passes through untouched.
 */
export function repairLatexEscapes(value: string): string {
  if (!value) {
    return value;
  }
  // 1) `\n`-family: LF + a recognized command body -> `\n<body>`. Genuine
  //    newlines (body is ordinary prose, not a command) are left as the newline.
  let out = value.replace(/\u000A([a-zA-Z]+)/g, (match, body: string) =>
    N_COMMAND_BODIES.has(body) ? '\\n' + body : match,
  );
  // 2) Every other recoverable control char -> its backslash escape.
  // eslint-disable-next-line no-control-regex
  out = out.replace(/[\u0000\u0007\u0008\u0009\u000b\u000c\u000d]/g, (ch) => CONTROL_TO_BACKSLASH[ch] ?? ch);
  return out;
}

/**
 * Removes any code point KaTeX cannot render (which would otherwise draw a "no
 * glyph"/tofu box): residual C0 controls (except tab/newline/CR whitespace), DEL
 * + C1 controls, the Unicode replacement char U+FFFD, the non-characters
 * U+FFFE/U+FFFF, and lone surrogates. Valid astral characters (surrogate PAIRS)
 * are preserved because iteration is by code point.
 */
export function stripNonRenderable(value: string): string {
  if (!value) {
    return value;
  }
  let out = '';
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d) {
      out += ch; // keep ordinary whitespace
      continue;
    }
    if (cp <= 0x1f) continue; // other C0 controls
    if (cp >= 0x7f && cp <= 0x9f) continue; // DEL + C1 controls
    if (cp >= 0xd800 && cp <= 0xdfff) continue; // lone surrogate code unit
    if (cp === 0xfffd || cp === 0xfffe || cp === 0xffff) continue; // replacement + non-chars
    out += ch;
  }
  return out;
}

/**
 * Full cleanup for one AI-generated text field: repair mangled command
 * backslashes, then strip anything still non-renderable. Guarantees only clean,
 * KaTeX-safe LaTeX leaves the function.
 */
export function sanitizeAiLatex(value: string): string {
  return stripNonRenderable(repairLatexEscapes(value));
}
