/**
 * Shared TypeScript types for the scoring engine.
 *
 * These types define the canonical output format stored in
 * survey_questionnaire_patients_assignment.scores (JSONB) and
 * returned by the /complete API endpoint.
 */

export type ScaleScoreStatus =
  | 'computed'
  | 'missing_too_many_items'
  | 'pending_external_cat'
  | 'cat_error'
  | 'not_applicable'
  | 'no_norms';

/** One CTT scale result for a single patient assignment */
export interface CttScaleScore {
  scale: string;
  score_system: 'CTT';
  raw_0_100_score: number | null;
  t_score: number | null;
  missing_items: number;
  total_items: number;
  status: ScaleScoreStatus;
}

/** One IRT dimension result (from CAT API) */
export interface IrtDimensionScore {
  dimension: string;
  /** The dynamic module's ScaleCode this dimension's CAT session was driven by. */
  scale?: string;
  irt: number | null;
  information: number | null;
  missing_items: number;
  total_items: number;
  status: ScaleScoreStatus;
}

/** Full scoring result for one module */
export interface ModuleScoreResult {
  type: 'static' | 'dynamic' | 'feedback';
  module_name: string;
  completed_at: string;
  /** CTT scale scores — populated for static modules, empty array for dynamic */
  ctt_scales: CttScaleScore[];
  /**
   * IRT dimension scores from CAT API.
   * null means CAT was not invoked (not_applicable) or is not yet available.
   */
  irt_dimensions: IrtDimensionScore[] | null;
  irt_status: ScaleScoreStatus;
  /** Traceable reference to the CTT norms version used for T-score computation */
  ctt_norms_version_id: number | null;
  ctt_norms_version_name: string | null;
}

/** Full scores payload stored in assignment.scores */
export type SurveyScorePayload = Record<`module_${number}`, ModuleScoreResult>;
