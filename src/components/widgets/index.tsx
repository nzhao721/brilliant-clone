// Widget registry + dispatch for the chapter 5-11 interactive widgets.
//
// This is a SHARED file. It already references every widget up front, so a
// builder implementing a single widget never needs to touch it. To add a brand
// new widget type later: create its file, then register it in BOTH the
// `NewInteractiveVisual` union and the `widgetRegistry` map below (TypeScript
// enforces that the map covers exactly the union).

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
 * Every NEW interactive visual variant added for chapters 5-11. The course-wide
 * `InteractiveVisual` union in `src/data/lessons.ts` is the existing 7 variants
 * plus this set.
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
 * type -> component map. The mapped type forces this object to contain exactly
 * one entry per new widget type, each typed to its own visual variant. Every
 * widget also accepts the optional `onInteractionComplete` callback used by the
 * lesson-player interaction gating (fired once when the learner performs the
 * widget's required action) and the optional `demonstrate` counter used by the
 * "Show me" self-demonstration (incremented each time the learner asks the
 * figure to animate itself to the position that illustrates the concept).
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
 * Dispatch a new-style visual to its widget component. `InteractiveGraph`
 * delegates here for any `visual.type` outside the original 7 graph types, and
 * forwards the optional `onInteractionComplete` gating callback plus the
 * `demonstrate` self-demonstration counter to the widget.
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
  // The lookup yields a union of component types; narrow it to the runtime
  // variant. This single cast lives in the shared registry so widget builders
  // never have to deal with it.
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
