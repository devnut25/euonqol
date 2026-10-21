import React from 'react';
import type { A11yPreferences, A11yToggle, TextScale } from '@/lib/a11y-preferences';

interface AccessibilityContextType {
  prefs: A11yPreferences;
  setTextScale: (scale: TextScale) => void;
  toggle: (key: A11yToggle) => void;
  reset: () => void;
}

export const AccessibilityContext = React.createContext<AccessibilityContextType | undefined>(
  undefined
);

export const useAccessibilityPreferences = () => {
  const context = React.useContext(AccessibilityContext);

  if (!context) {
    throw new Error('useAccessibilityPreferences must be used within AccessibilityProvider');
  }

  return context;
};
