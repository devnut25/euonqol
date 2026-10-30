/**
 * Condivisione della sessione tra tab. I token stanno in sessionStorage, che è separato
 * per ogni tab: una tab nuova senza token li chiede alle tab già aperte (stessa origine)
 * tramite BroadcastChannel e se li copia nel proprio sessionStorage.
 */
const CHANNEL_NAME = 'euonqol-auth';

export interface SharedTokens {
  access_token: string;
  refresh_token: string;
}

type AuthTabMessage = { type: 'token-request' } | ({ type: 'token-response' } & SharedTokens);

/** Chiede i token alle tab aperte; `null` se nessuna risponde entro `timeoutMs`. */
export const requestTokensFromOpenTabs = (timeoutMs = 300): Promise<SharedTokens | null> => {
  if (typeof BroadcastChannel === 'undefined') return Promise.resolve(null);

  return new Promise((resolve) => {
    const channel = new BroadcastChannel(CHANNEL_NAME);

    const finish = (tokens: SharedTokens | null) => {
      clearTimeout(timer);
      channel.close();
      resolve(tokens);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    channel.onmessage = (event: MessageEvent<AuthTabMessage>) => {
      const data = event.data;
      if (data?.type === 'token-response' && data.access_token && data.refresh_token) {
        finish({ access_token: data.access_token, refresh_token: data.refresh_token });
      }
    };

    channel.postMessage({ type: 'token-request' } satisfies AuthTabMessage);
  });
};

/** Risponde alle richieste delle altre tab se questa ha una sessione. Restituisce il cleanup. */
export const respondToTokenRequests = (): (() => void) => {
  if (typeof BroadcastChannel === 'undefined') return () => {};

  const channel = new BroadcastChannel(CHANNEL_NAME);

  channel.onmessage = (event: MessageEvent<AuthTabMessage>) => {
    if (event.data?.type !== 'token-request') return;

    const access_token = sessionStorage.getItem('access_token');
    const refresh_token = sessionStorage.getItem('refresh_token');
    if (!access_token || !refresh_token) return;

    channel.postMessage({
      type: 'token-response',
      access_token,
      refresh_token,
    } satisfies AuthTabMessage);
  };

  return () => channel.close();
};
