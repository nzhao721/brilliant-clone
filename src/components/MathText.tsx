import { Fragment } from 'react';
import { BlockMath, InlineMath } from 'react-katex';
import {
  FormalDerivativeFormula,
  formalDerivativeFormulaToken,
} from './FormalDerivativeFormula';

type MathSegment =
  | {
      kind: 'text';
      value: string;
    }
  | {
      kind: 'math';
      display: boolean;
      value: string;
    };

type MathTextProps = {
  text: string;
};

const delimiterPattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;

function renderTextSegment(value: string, segmentIndex: number) {
  const parts = value.split(formalDerivativeFormulaToken);

  return parts.map((part, partIndex) => (
    <Fragment key={`${segmentIndex}-text-${partIndex}`}>
      {part}
      {partIndex < parts.length - 1 ? <FormalDerivativeFormula /> : null}
    </Fragment>
  ));
}

function parseMathText(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(delimiterPattern)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      segments.push({ kind: 'text', value: text.slice(lastIndex, index) });
    }

    const display = token.startsWith('$$') || token.startsWith('\\[');
    const value = display ? token.replace(/^(\$\$|\\\[)|(\$\$|\\\])$/g, '') : token.replace(/^(\$|\\\()|(\$|\\\))$/g, '');

    segments.push({ kind: 'math', display, value });
    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: 'text', value: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ kind: 'text', value: text }];
}

export function MathText({ text }: MathTextProps) {
  return (
    <>
      {parseMathText(text).map((segment, index) => {
        if (segment.kind === 'text') {
          return <Fragment key={`${index}-${segment.value}`}>{renderTextSegment(segment.value, index)}</Fragment>;
        }

        return segment.display ? (
          <BlockMath key={`${index}-${segment.value}`} math={segment.value} />
        ) : (
          <InlineMath key={`${index}-${segment.value}`} math={segment.value} />
        );
      })}
    </>
  );
}
