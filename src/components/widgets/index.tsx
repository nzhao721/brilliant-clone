/*
 * Widget registry + dispatch. To add a widget type, register it in both the
 * `NewInteractiveVisual` union and the `widgetRegistry` map (TypeScript enforces
 * the map covers exactly the union).
 */

import type { ComponentType } from 'react';

import { AreaAccumulation, type AreaAccumulationVisual } from './AreaAccumulation';
import { AreaBetweenCurves, type AreaBetweenCurvesVisual } from './AreaBetweenCurves';
import { ConicSection, type ConicSectionVisual } from './ConicSection';
import { FunctionExplorer, type FunctionExplorerVisual } from './FunctionExplorer';
import { HorizontalLineTest, type HorizontalLineTestVisual } from './HorizontalLineTest';
import { IntervalOfConvergence, type IntervalOfConvergenceVisual } from './IntervalOfConvergence';
import { ParametricCurve, type ParametricCurveVisual } from './ParametricCurve';
import { PolarCurve, type PolarCurveVisual } from './PolarCurve';
import { RiemannSum, type RiemannSumVisual } from './RiemannSum';
import { SequencePlot, type SequencePlotVisual } from './SequencePlot';
import { SlopeField, type SlopeFieldVisual } from './SlopeField';
import { SolidOfRevolution, type SolidOfRevolutionVisual } from './SolidOfRevolution';
import { TaylorApproximation, type TaylorApproximationVisual } from './TaylorApproximation';
import { UnitCircle, type UnitCircleVisual } from './UnitCircle';

/**
 * The new interactive visual variants; the course-wide `InteractiveVisual` union
 * in `src/data/lessons.ts` is the original 7 plus this set.
 */
export type NewInteractiveVisual =
  | RiemannSumVisual
  | AreaAccumulationVisual
  | AreaBetweenCurvesVisual
  | SolidOfRevolutionVisual
  | SlopeFieldVisual
  | SequencePlotVisual
  | TaylorApproximationVisual
  | IntervalOfConvergenceVisual
  | ParametricCurveVisual
  | PolarCurveVisual
  | ConicSectionVisual
  | UnitCircleVisual
  | HorizontalLineTestVisual
  | FunctionExplorerVisual;

export type {
  AreaAccumulationVisual,
  AreaBetweenCurvesVisual,
  ConicSectionVisual,
  FunctionExplorerVisual,
  HorizontalLineTestVisual,
  IntervalOfConvergenceVisual,
  ParametricCurveVisual,
  PolarCurveVisual,
  RiemannSumVisual,
  SequencePlotVisual,
  SlopeFieldVisual,
  SolidOfRevolutionVisual,
  TaylorApproximationVisual,
  UnitCircleVisual,
};

/** The concrete visual variant that matches a given `type` string. */
type VisualForType<TType extends NewInteractiveVisual['type']> = Extract<
  NewInteractiveVisual,
  { type: TType }
>;

/**
 * type -> component map (one entry per widget type, each typed to its visual
 * variant). Every widget also accepts `onInteractionComplete` and `demonstrate`.
 */
type WidgetRegistry = {
  [TType in NewInteractiveVisual['type']]: ComponentType<{
    visual: VisualForType<TType>;
    onInteractionComplete?: () => void;
    demonstrate?: number;
  }>;
};

export const widgetRegistry: WidgetRegistry = {
  'riemann-sum': RiemannSum,
  'area-accumulation': AreaAccumulation,
  'area-between-curves': AreaBetweenCurves,
  'solid-of-revolution': SolidOfRevolution,
  'slope-field': SlopeField,
  'sequence-plot': SequencePlot,
  'taylor-approximation': TaylorApproximation,
  'interval-of-convergence': IntervalOfConvergence,
  'parametric-curve': ParametricCurve,
  'polar-curve': PolarCurve,
  'conic-section': ConicSection,
  'unit-circle': UnitCircle,
  'horizontal-line-test': HorizontalLineTest,
  'function-explorer': FunctionExplorer,
};

/**
 * Dispatch a new-style visual to its widget. `InteractiveGraph` delegates here for
 * any `visual.type` outside the original 7 graph types.
 */
export function WidgetRenderer({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: NewInteractiveVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  /* Narrow the union of component types to the runtime variant (one shared cast). */
  const Widget = widgetRegistry[visual.type] as ComponentType<{
    visual: NewInteractiveVisual;
    onInteractionComplete?: () => void;
    demonstrate?: number;
  }>;
  return (
    <Widget
      visual={visual}
      onInteractionComplete={onInteractionComplete}
      demonstrate={demonstrate}
    />
  );
}
