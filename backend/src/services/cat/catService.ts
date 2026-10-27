/**
 * CAT Service - Integration with external CAT API
 * Handles adaptive question selection and scoring for dynamic questionnaires
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { AppSettingsDefaults, AppSettingsKeys, AppSettingsService } from '../AppSettingsService.js';
import {
  CatSession,
  CatCreateSessionResponse,
  CatNextItemResponse,
  CatEstimatesResponse,
  CatApiError,
} from './types';

/**
 * Resolves the current CAT API url/key from `app_settings` (admin-editable at
 * runtime, e.g. rotating an expiring key from the UI). The env only seeds the
 * table on the first boot, see AppSettingsService.initialiseFromEnv.
 */
async function resolveCatConfig(): Promise<{ url: string; key: string }> {
  const [url, key] = await Promise.all([
    AppSettingsService.get(AppSettingsKeys.CAT_API_URL),
    AppSettingsService.get(AppSettingsKeys.CAT_API_KEY),
  ]);

  return {
    url: url || AppSettingsDefaults[AppSettingsKeys.CAT_API_URL],
    key: key || '',
  };
}

function buildCatApiClient(url: string, key: string): AxiosInstance {
  if (!key) {
    console.warn('⚠️  CAT API key not configured. CAT functionality will not work.');
  }

  const client = axios.create({
    baseURL: url,
    timeout: 30000, // 30 seconds
    headers: {
      'Content-Type': 'application/json',
      'api-key': key,
    },
  });

  // Request interceptor for logging
  client.interceptors.request.use(
    (config) => {
      console.log(`[CAT API] ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    },
    (error) => {
      console.error('[CAT API] Request error:', error);
      return Promise.reject(error);
    }
  );

  // Response interceptor for error handling
  client.interceptors.response.use(
    (response) => {
      console.log(`[CAT API] Response: ${response.status} ${response.config.url}`);
      return response;
    },
    (error: AxiosError) => {
      const apiError: CatApiError = {
        error: 'CAT API Error',
        message: error.message,
        statusCode: error.response?.status,
      };

      if (error.response) {
        console.error(`[CAT API] Error ${error.response.status}:`, error.response.data);
        apiError.message = (error.response.data as any)?.error || error.message;
      } else if (error.request) {
        console.error('[CAT API] No response received:', error.message);
        apiError.message = 'CAT service not reachable';
      } else {
        console.error('[CAT API] Request setup error:', error.message);
      }

      return Promise.reject(apiError);
    }
  );

  return client;
}

let cachedClient: { client: AxiosInstance; signature: string } | null = null;

/**
 * Returns the CAT API client for the current config, rebuilding it only when the
 * url/key actually changed since the last call (e.g. an admin just rotated the key) —
 * avoids reconnecting on every single request.
 */
async function getCatApiClient(): Promise<AxiosInstance> {
  const { url, key } = await resolveCatConfig();
  const signature = `${url}::${key}`;

  if (!cachedClient || cachedClient.signature !== signature) {
    cachedClient = { client: buildCatApiClient(url, key), signature };
  }

  return cachedClient.client;
}

/**
 * Verifies connectivity/credentials against the CAT API without touching the cached
 * client — used by the admin "Test connection" action, including testing a url/key
 * the admin hasn't saved yet.
 */
export async function testConnection(overrideUrl?: string, overrideKey?: string): Promise<string> {
  const config = await resolveCatConfig();
  const client = buildCatApiClient(overrideUrl ?? config.url, overrideKey ?? config.key);
  const response = await client.get<string>('/runner/version');
  return response.data;
}

/**
 * Create a new CAT session using a predefined setting key
 * @param settingKey - The CAT setting key to use (e.g., 'CatValidationSetting')
 * @returns Promise with the created session
 */
export async function createSessionByKey(settingKey: string): Promise<CatSession> {
  try {
    const response = await (await getCatApiClient()).get<CatCreateSessionResponse>(
      `/runner/createSession/${settingKey}`
    );
    return response.data.session || response.data;
  } catch (error) {
    console.error(`Failed to create CAT session with key ${settingKey}:`, error);
    throw error;
  }
}

/**
 * Extracts the local `cat_settings.api_configuration` shape (name, dimensionOrder,
 * per-dimension settings) from a session the external CAT API returned — shared by
 * the manual "Fetch from CAT API" admin action and any auto-create path (dynamic
 * kit-version upload, bulk-create) so both populate the exact same JSON shape.
 */
export function buildApiConfigurationFromSession(
  settingKey: string,
  session: CatSession
): Record<string, any> {
  const apiConfiguration: Record<string, any> = {
    name: settingKey,
    dimensionOrder: session.dimensionOrder ?? [],
    dimensions: {},
  };

  if (Array.isArray(session.progress?.dimensions)) {
    for (const dim of session.progress.dimensions) {
      if (dim.name && dim.setting) {
        apiConfiguration.dimensions[dim.name] = dim.setting;
      }
    }
  }

  return apiConfiguration;
}

/**
 * Fetches a settingKey's full configuration from the external CAT API by creating a
 * throwaway session and extracting its dimension settings — this is the "Fetch from
 * CAT API" action, reusable outside the admin form (e.g. auto-creating a cat_settings
 * row while importing a dynamic kit version, so it doesn't end up with a bare
 * name/setting_key and no configuration).
 */
export async function fetchApiConfiguration(settingKey: string): Promise<Record<string, any>> {
  const session = await createSessionByKey(settingKey);
  return buildApiConfigurationFromSession(settingKey, session);
}

/**
 * Create a new CAT session using a custom setting object
 * @param setting - The CAT setting configuration
 * @returns Promise with the created session
 */
export async function createSessionBySetting(setting: any): Promise<CatSession> {
  try {
    const response = await (await getCatApiClient()).post<CatCreateSessionResponse>(
      '/runner/createSession',
      setting
    );
    return response.data.session || response.data;
  } catch (error) {
    console.error('Failed to create CAT session with custom setting:', error);
    throw error;
  }
}

/**
 * Get the next item (question) in the CAT session
 * @param session - Current CAT session state
 * @returns Promise with next item key and updated session
 */
export async function getNextItem(session: CatSession): Promise<CatNextItemResponse> {
  try {
    const response = await (await getCatApiClient()).post<CatNextItemResponse>(
      '/runner/item/next',
      session
    );
    return response.data;
  } catch (error) {
    console.error('Failed to get next item from CAT:', error);
    throw error;
  }
}

/**
 * Get the current item (question) in the CAT session
 * @param session - Current CAT session state
 * @returns Promise with current item key and session
 */
export async function getCurrentItem(session: CatSession): Promise<CatNextItemResponse> {
  try {
    const response = await (await getCatApiClient()).post<CatNextItemResponse>(
      '/runner/item/current',
      session
    );
    return response.data;
  } catch (error) {
    console.error('Failed to get current item from CAT:', error);
    throw error;
  }
}

/**
 * Set a response for the current item and get updated session
 * @param session - Current CAT session state
 * @param response - The response value, as stored locally (1-indexed: 1..N
 *   for an N-option item — the same convention answer_options.value uses for
 *   CTT scoring, e.g. extent_4's "Per niente"=1 … "Moltissimo"=4)
 * @returns Promise with updated session
 */
export async function setResponse(session: CatSession, response: number): Promise<CatSession> {
  try {
    // The EORTC CAT API expects a 0-indexed response (0..N-1) — one less than
    // our own locally-stored, 1-indexed answer_options.value. Sending the raw
    // 1-indexed value shifts every answer up by one option (e.g. picking the
    // 3rd option, "Quite a bit"/"Parecchio", gets recorded as the 4th, "Very
    // much"/"Moltissimo") without the API ever rejecting it. This is the one
    // place that boundary crossing happens, so every caller (saveResponses,
    // recreateSession's replay) can keep passing the value exactly as
    // stored/displayed locally.
    const result = await (await getCatApiClient()).post<CatSession>(
      `/runner/response/${response - 1}`,
      session
    );
    return result.data;
  } catch (error) {
    console.error(`Failed to set response ${response} in CAT:`, error);
    throw error;
  }
}

/**
 * Get IRT estimates (scores) for all dimensions in the session
 * @param session - Current CAT session state
 * @returns Promise with estimates for each dimension
 */
export async function getEstimates(session: CatSession): Promise<CatEstimatesResponse> {
  try {
    const response = await (await getCatApiClient()).post<CatEstimatesResponse>(
      '/runner/estimates',
      session
    );
    return response.data;
  } catch (error) {
    console.error('Failed to get estimates from CAT:', error);
    throw error;
  }
}

/**
 * Get the current active dimension name
 * @param session - Current CAT session state
 * @returns Promise with dimension name
 */
export async function getCurrentDimensionName(session: CatSession): Promise<string> {
  try {
    const response = await (await getCatApiClient()).post<string>(
      '/runner/currentDimensionName',
      session
    );
    return response.data;
  } catch (error) {
    console.error('Failed to get current dimension name from CAT:', error);
    throw error;
  }
}

/**
 * Get list of used items in the session
 * @param session - Current CAT session state
 * @returns Promise with array of used items
 */
export async function getUsedItems(
  session: CatSession
): Promise<Array<{ key: string; dimensionName: string }>> {
  try {
    const response = await (await getCatApiClient()).post<Array<{ key: string; dimensionName: string }>>(
      '/runner/useditems',
      session
    );
    return response.data;
  } catch (error) {
    console.error('Failed to get used items from CAT:', error);
    throw error;
  }
}

/**
 * Check service health
 * @returns Promise with version string if service is alive
 */
export async function checkVersion(): Promise<string> {
  try {
    const response = await (await getCatApiClient()).get<string>('/runner/version');
    return response.data;
  } catch (error) {
    console.error('Failed to check CAT service version:', error);
    throw error;
  }
}

/**
 * Recreate a CAT session from saved responses
 * Useful when resuming a session or when CAT session token is lost
 * @param settingKey - The CAT setting key
 * @param responses - Array of previous responses with itemKey and response value
 * @returns Promise with recreated session
 */
export async function recreateSession(
  settingKey: string,
  responses: Array<{ itemKey: string; response: number }>
): Promise<CatSession> {
  try {
    // Create new session
    let session = await createSessionByKey(settingKey);

    // Replay responses one by one. createSessionByKey does NOT auto-serve a
    // starting item — the session has no "current item" until getNextItem is
    // called — so each response must be preceded by a getNextItem call to
    // serve the item it answers, in both the first and every later iteration.
    // Calling setResponse first (as this used to) fails with "There is no
    // current item to assign the response too" on the very first response.
    for (const resp of responses) {
      const nextItem = await getNextItem(session);
      session = nextItem.session;
      session = await setResponse(session, resp.response);
    }

    console.log(`[CAT] Session recreated with ${responses.length} responses`);
    return session;
  } catch (error) {
    console.error('Failed to recreate CAT session:', error);
    throw error;
  }
}

/**
 * Get IRT estimates directly from a set of item responses, without creating
 * or replaying a session (stateless scoring).
 * @param instrument - The item bank / instrument key (e.g. 'QLQ-CAT')
 * @param body - One entry per dimension, keyed by dimension name
 * @returns Promise with estimates for each dimension present in the body
 */
export async function getResponseEstimates(
  instrument: string,
  body: Record<
    string,
    {
      scoreEstimationMethod: string;
      informationEstimationMethod: string;
      itemSelectionMethod?: string;
      // Item responses as stored locally (1-indexed: 1..N — see setResponse).
      responses: Record<string, number | null>;
      lastScoreEstimation?: { Irt: number };
    }
  >
): Promise<CatEstimatesResponse> {
  try {
    // Same 0-indexed-vs-1-indexed boundary correction as setResponse (see its
    // comment) — applied per item response, `null` (missing) left untouched.
    const adjustedBody = Object.fromEntries(
      Object.entries(body).map(([dimensionName, dimensionBody]) => [
        dimensionName,
        {
          ...dimensionBody,
          responses: Object.fromEntries(
            Object.entries(dimensionBody.responses).map(([itemKey, value]) => [
              itemKey,
              value === null || value === undefined ? value : value - 1,
            ])
          ),
        },
      ])
    );
    const response = await (await getCatApiClient()).post<CatEstimatesResponse>(
      `/runner/estimates/${instrument}`,
      adjustedBody
    );
    return response.data;
  } catch (error) {
    console.error(`Failed to get response estimates for instrument ${instrument}:`, error);
    throw error;
  }
}

/**
 * Check if stopping criteria are met for a session
 * @param session - Current CAT session state
 * @returns true if all dimensions are complete
 */
export function isSessionComplete(session: CatSession): boolean {
  if (!session.progress?.dimensions) {
    return false;
  }

  // Check each dimension for completion
  for (const dimension of session.progress.dimensions) {
    const setting = dimension.setting;
    let triggered = false;

    // Check maximum items criterion — served/ASKED count, not answered. Can
    // become true the moment the last item is SERVED, before it's answered.
    if (setting.maximumNumberOfAskedItemsCriterion?.enable) {
      const maxItems = setting.maximumNumberOfAskedItemsCriterion.value;
      // usedItemKeys is `null` (not `[]`) on a freshly-created session that
      // hasn't served a single item yet — the pre-check in getNextCatQuestion
      // now calls isSessionComplete right after session creation, before this
      // array has ever been populated, so this can no longer assume an array.
      if ((dimension.usedItemKeys?.length ?? 0) >= maxItems) {
        triggered = true;
      }
    }

    // Check minimum information criterion
    if (!triggered && setting.minimumInformationCriterion?.enable) {
      const minInfo = setting.minimumInformationCriterion.value;
      if (dimension.information && dimension.information >= minInfo) {
        triggered = true;
      }
    }

    // Check minimum ANSWERED items criterion — the external API's own name
    // for this field ("mininum") is a typo, kept verbatim to match. Distinct
    // from `dimension.usedItemKeys` (items served): `dimension.responses` is
    // only populated by real setResponse calls (see setResponse below), so
    // this is genuinely "how many were answered", not "how many were asked".
    const minAnswered = setting.mininumNumberOfAnsweredItemsCriterion;
    const answeredCount = Object.keys(dimension.responses ?? {}).length;
    if (!triggered && minAnswered?.enable && answeredCount >= minAnswered.value) {
      triggered = true;
    }

    if (!triggered) {
      // If we reach here, at least one dimension is not complete
      return false;
    }

    // Gate: even when a DIFFERENT criterion is what triggered completion
    // above (typically maximumNumberOfAskedItemsCriterion, which can be true
    // right after the last item is served, before it's answered), a scale
    // configured with mininumNumberOfAnsweredItemsCriterion must still have
    // that many REAL answers before it's genuinely done — otherwise a
    // still-pending last item gets reported complete one answer too early
    // (this was the root cause of a real navigation bug: reloading on that
    // unanswered last item silently skipped the whole scale on resume).
    if (minAnswered?.enable && answeredCount < minAnswered.value) {
      return false;
    }
  }

  return true;
}

export default {
  createSessionByKey,
  createSessionBySetting,
  getNextItem,
  getCurrentItem,
  setResponse,
  getEstimates,
  getResponseEstimates,
  getCurrentDimensionName,
  getUsedItems,
  checkVersion,
  testConnection,
  recreateSession,
  isSessionComplete,
  buildApiConfigurationFromSession,
  fetchApiConfiguration,
};
