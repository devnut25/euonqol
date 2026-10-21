/**
 * Preferenze del pannello accessibilità: applicate come classi/font-size su <html>
 * e salvate in localStorage. Tenere allineato lo script inline in index.html, che le
 * applica prima del primo paint (niente flash).
 */
export const TEXT_SCALES = [100, 125, 150, 200] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export interface A11yPreferences {
  textScale: TextScale;
  contrast: boolean;
  grayscale: boolean;
  highlightLinks: boolean;
  stopAnimations: boolean;
}

export type A11yToggle = Exclude<keyof A11yPreferences, 'textScale'>;

export const A11Y_STORAGE_KEY = 'a11y-prefs';

export const DEFAULT_A11Y_PREFERENCES: A11yPreferences = {
  textScale: 100,
  contrast: false,
  grayscale: false,
  highlightLinks: false,
  stopAnimations: false,
};

const TOGGLE_CLASSES: Record<A11yToggle, string> = {
  contrast: 'a11y-contrast',
  grayscale: 'a11y-grayscale',
  highlightLinks: 'a11y-links',
  stopAnimations: 'a11y-no-motion',
};

export function loadA11yPreferences(): A11yPreferences {
  try {
    const raw = localStorage.getItem(A11Y_STORAGE_KEY);
    if (!raw) return DEFAULT_A11Y_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<A11yPreferences>;
    return {
      textScale: TEXT_SCALES.includes(parsed.textScale as TextScale)
        ? (parsed.textScale as TextScale)
        : DEFAULT_A11Y_PREFERENCES.textScale,
      contrast: parsed.contrast === true,
      grayscale: parsed.grayscale === true,
      highlightLinks: parsed.highlightLinks === true,
      stopAnimations: parsed.stopAnimations === true,
    };
  } catch {
    return DEFAULT_A11Y_PREFERENCES;
  }
}

export function saveA11yPreferences(prefs: A11yPreferences) {
  try {
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage non disponibile (navigazione privata, cookie bloccati): vale solo per la sessione
  }
}

export function applyA11yPreferences(prefs: A11yPreferences) {
  const root = document.documentElement;
  // L'app usa unità rem: scalare il font della radice ingrandisce testo e layout (WCAG 1.4.4)
  root.style.fontSize = prefs.textScale === 100 ? '' : `${prefs.textScale}%`;
  // Letto dai breakpoint ridefiniti in index.css, che così scalano insieme al testo
  if (prefs.textScale === 100) delete root.dataset.textScale;
  else root.dataset.textScale = String(prefs.textScale);
  (Object.keys(TOGGLE_CLASSES) as A11yToggle[]).forEach((key) => {
    root.classList.toggle(TOGGLE_CLASSES[key], prefs[key]);
  });
}
