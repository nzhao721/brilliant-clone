export const formalDerivativeFormulaToken = '[[formal-derivative-formula]]';

export function FormalDerivativeFormula() {
  return (
    <span
      aria-label="f prime of a equals the limit as h approaches 0 of f of a plus h minus f of a over h"
      className="formal-derivative-formula"
    >
      <span>
        <span className="math-variable">f</span>
        <sup className="formal-prime">&prime;</sup>(<span className="math-variable">a</span>) =
      </span>
      <span className="formal-limit">
        <span className="formal-limit-word">lim</span>
        <span className="formal-limit-subscript">
          <span className="math-variable">h</span> &rarr; 0
        </span>
      </span>
      <span className="formal-fraction">
        <span className="formal-fraction-numerator">
          <span className="math-variable">f</span>(<span className="math-variable">a</span> +{' '}
          <span className="math-variable">h</span>) - <span className="math-variable">f</span>(
          <span className="math-variable">a</span>)
        </span>
        <span className="formal-fraction-denominator">
          <span className="math-variable">h</span>
        </span>
      </span>
    </span>
  );
}
