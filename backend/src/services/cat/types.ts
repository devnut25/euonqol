/**
 * TypeScript types for CAT API integration
 * Based on API documentation at https://cat.eortc.org/api
 */

/**
 * Session struct containing the setting and current state of a questionnaire session
 */
export interface CatSession {
  study: string;
  token: string;
  dimensionOrder: string[];
  progress: CatProgress;
  createdAt: number; // Unix timestamp
}

/**
 * Progress struct containing the current state of a questionnaire session
 */
export interface CatProgress {
  currentDimensionIndex: number;
  dimensions: CatDimensionProgress[];
  usedItems: CatUsedItem[];
  revisitedItemIndex?: Record<string, any>;
}

/**
 * Progress for a specific dimension
 */
export interface CatDimensionProgress {
  name: string;
  instrument: string;
  itemKeys: string[];
  // `null` on a freshly-created session (no item served for this dimension
  // yet), NOT `[]` — every reader must null-coalesce, not assume an array.
  usedItemKeys: string[] | null;
  responses: Record<string, number>;
  itemsUsedInSubCat?: Record<string, any>;
  setting: CatDimensionSetting;
  transformedSetting?: {
    quantile: number;
  };
  score?: CatScore;
  information?: number;
  irtScores?: number[];
}

/**
 * Score estimation result
 */
export interface CatScore {
  method: string;
  irtScore: number;
  probabilities: number[];
}

/**
 * Used item in the session
 */
export interface CatUsedItem {
  key: string;
  dimensionName: string;
}

/**
 * CAT Setting configuration
 */
export interface CatSetting {
  name: string;
  dimensions: Record<string, CatDimensionSetting>;
  dimensionOrder: string[];
}

/**
 * Dimension-specific setting
 */
export interface CatDimensionSetting {
  itemsTable: string;
  estimationMethod: string;
  itemSelectionMethod: string;
  informationEstimationMethod: string;
  useSubcategories?: boolean;
  minUsedItemsInSubcategories?: number;
  maxWeightedInformationItemSelectorConfidenceInterval?: number;
  mininumNumberOfAnsweredItemsCriterion?: {
    enable: boolean;
    value: number;
  };
  maximumNumberOfAskedItemsCriterion?: {
    enable: boolean;
    value: number;
  };
  minimumNextItemInformation?: {
    enable: boolean;
    value: number;
  };
  minimumInformationCriterion?: {
    enable: boolean;
    value: number;
  };
  irtScoreCut?: {
    enable: boolean;
    confidenceInterval: number;
    criterion: number;
  };
  irtScoreMaxDifference?: {
    enable: boolean;
    numberOfIrtScoresToCompare: number;
    criterion: number;
  };
  startItems?: string[];
  requiredItems?: string[];
  lowestPointOfInterestIrtScore?: number;
  highestPointOfInterestIrtScore?: number;
  upperBoundery?: CatBoundary;
  lowerBoundery?: CatBoundary;
}

/**
 * Boundary configuration
 */
export interface CatBoundary {
  enable: boolean;
  firstItemAnswers?: number;
}

/**
 * Response to get next item
 */
export interface CatNextItemResponse {
  itemKey: string;
  response: number;
  session: CatSession;
}

/**
 * Estimates response (IRT scores and information for all dimensions)
 */
export interface CatEstimatesResponse {
  [dimensionName: string]: {
    irt: number;
    information: number;
  };
}

/**
 * Create session response
 */
export interface CatCreateSessionResponse {
  session: CatSession;
}

/**
 * Error response from CAT API
 */
export interface CatApiError {
  error: string;
  message?: string;
  statusCode?: number;
}
