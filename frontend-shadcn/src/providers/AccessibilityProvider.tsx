import { AccessibilityContext } from '@/hooks/useAccessibilityPreferences';
import {
  applyA11yPreferences,
  DEFAULT_A11Y_PREFERENCES,
  loadA11yPreferences,
  saveA11yPreferences,
  type A11yPreferences,
  type A11yToggle,
  type TextScale,
} from '@/lib/a11y-preferences';
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Stato condiviso del pannello accessibilità: Navbar desktop e mobile sono montate
 * insieme (nascoste via CSS), quindi le preferenze non possono vivere nel componente.
 */
export const AccessibilityProvider = ({ children }: { children: React.ReactNode }) => {
  const [prefs, setPrefs] = useState<A11yPreferences>(loadA11yPreferences);

  useEffect(() => {
    applyA11yPreferences(prefs);
    saveA11yPreferences(prefs);
  }, [prefs]);

  const setTextScale = useCallback((textScale: TextScale) => {
    setPrefs((prev) => ({ ...prev, textScale }));
  }, []);

  const toggle = useCallback((key: A11yToggle) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const reset = useCallback(() => setPrefs(DEFAULT_A11Y_PREFERENCES), []);

  const value = useMemo(
    () => ({ prefs, setTextScale, toggle, reset }),
    [prefs, setTextScale, toggle, reset]
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
};
