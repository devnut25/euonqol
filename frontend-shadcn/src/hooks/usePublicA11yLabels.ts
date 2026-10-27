import type { PublicUIStrings } from '@/pages/public/labels';
import React, { useContext, useEffect } from 'react';

interface PublicA11yLabelsContextType {
  /** Labels of the patient's language while the public questionnaire is open, otherwise null. */
  labels: PublicUIStrings | null;
  setLabels: (labels: PublicUIStrings | null) => void;
}

export const PublicA11yLabelsContext = React.createContext<PublicA11yLabelsContextType>({
  labels: null,
  setLabels: () => {},
});

/**
 * Read by the AccessibilityMenu: it is mounted once in App.tsx, outside the public page,
 * so it can't receive the patient's language as a prop.
 */
export const usePublicA11yLabels = () => useContext(PublicA11yLabelsContext).labels;

/** Called by the public questionnaire page with its labels (null while loading); cleared when the page unmounts. */
export const usePublishA11yLabels = (labels: PublicUIStrings | null) => {
  const { setLabels } = useContext(PublicA11yLabelsContext);

  useEffect(() => {
    setLabels(labels);
  }, [labels, setLabels]);

  useEffect(() => () => setLabels(null), [setLabels]);
};
