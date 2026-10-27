import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import type { PublicUIStrings } from './labels';

// language_id → texts edited in Settings › Languages ('default' = English, used before a
// language is chosen). Shared by every screen, so switching screens doesn't refetch.
const cache = new Map<number | 'default', Promise<PublicUIStrings>>();

function fetchTranslations(languageId: number | null): Promise<PublicUIStrings> {
  const key = languageId ?? 'default';
  let request = cache.get(key);
  if (!request) {
    const query = languageId != null ? `?language_id=${languageId}` : '';
    request = axios
      .get(`/euonqol-api/public/ui-translations${query}`)
      .then((res) => res.data.data as PublicUIStrings)
      .catch((err) => {
        // Not cached on failure: retry() / the next mount fetches again.
        cache.delete(key);
        throw err;
      });
    cache.set(key, request);
  }
  return request;
}

export type PublicLabelsStatus = 'loading' | 'error' | 'ready';

export interface PublicLabelsState {
  /** Null until the texts of the requested language are loaded. */
  labels: PublicUIStrings | null;
  status: PublicLabelsStatus;
  retry: () => void;
}

/**
 * UI strings of the public questionnaire for a language (null = English), as edited by
 * the admin in Settings › Languages. The DB is the only source: there are no built-in
 * texts, so the page shows a loading / error screen until `status` is 'ready'.
 */
export function usePublicLabels(languageId: number | null | undefined): PublicLabelsState {
  const id = languageId ?? null;
  const [result, setResult] = useState<{
    languageId: number | null;
    labels: PublicUIStrings | null;
    failed: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchTranslations(id)
      .then((labels) => {
        if (!cancelled) setResult({ languageId: id, labels, failed: false });
      })
      .catch(() => {
        if (!cancelled) setResult({ languageId: id, labels: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);

  // Only the texts of the current language: never show the previous one's while loading
  const current = result && result.languageId === id ? result : null;
  const status: PublicLabelsStatus = !current ? 'loading' : current.failed ? 'error' : 'ready';
  return { labels: current?.labels ?? null, status, retry };
}
