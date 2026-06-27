// ---------------------------------------------------------------------------
// LaTeX repair + sanitize for OpenAI structured-output corruption.
//
// OpenAI strict outputs intermittently mis-escape a LaTeX command's backslash in
// the JSON string; once parsed, the backslash has collapsed into a CONTROL CHAR:
//   - C-style escapes `\a \b \t \v \f \r \n` consume their letter (e.g. `\theta`
//     -> TAB + "heta", `\nabla` -> LF + "abla");
//   - any other `\<letter>` is an invalid escape and collapses to U+0000 (NUL)
//     with the command letters intact (e.g. `\delta` -> NUL + "delta").
// Some pipelines instead drop a command to U+FFFD or stray C0/C1 bytes. All of
// these render as KaTeX "tofu" boxes.
//
// `repairLatexEscapes` maps every recoverable control char back to its
// `\<command>`; `stripNonRenderable` removes anything still un-renderable; and
// `sanitizeAiLatex` composes the two. Mirrored client-side as a safety net.
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
 * Restores LaTeX commands whose backslashes collapsed into control chars (the
 * full `\a \b \f \n \r \t \v` C-escape set plus the NUL invalid-escape case).
 * Clean input passes through untouched.
 */
export function repairLatexEscapes(value: string): string {
  if (!value) {
    return value;
  }
  // `\n`-family: only restore LF + a recognized command body, so genuine newlines
  // (followed by ordinary prose) are left alone.
  let out = value.replace(/\u000A([a-zA-Z]+)/g, (match, body: string) =>
    N_COMMAND_BODIES.has(body) ? '\\n' + body : match,
  );
  // eslint-disable-next-line no-control-regex
  out = out.replace(/[\u0000\u0007\u0008\u0009\u000b\u000c\u000d]/g, (ch) => CONTROL_TO_BACKSLASH[ch] ?? ch);
  return out;
}

/**
 * Removes code points KaTeX can't render (tofu boxes): residual C0 controls
 * (except tab/newline/CR), DEL + C1 controls, U+FFFD, the U+FFFE/U+FFFF
 * non-characters, and lone surrogates. Astral chars (surrogate PAIRS) survive
 * because iteration is by code point.
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
 * backslashes, then strip anything still non-renderable.
 */
export function sanitizeAiLatex(value: string): string {
  return stripNonRenderable(repairLatexEscapes(value));
}
