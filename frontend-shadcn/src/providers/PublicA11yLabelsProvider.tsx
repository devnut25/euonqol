import { PublicA11yLabelsContext } from '@/hooks/usePublicA11yLabels';
import type { PublicUIStrings } from '@/pages/public/labels';
import { useMemo, useState, type ReactNode } from 'react';

/** Lets the public questionnaire page hand its language's labels to the AccessibilityMenu. */
export const PublicA11yLabelsProvider = ({ children }: { children: ReactNode }) => {
  const [labels, setLabels] = useState<PublicUIStrings | null>(null);
  const value = useMemo(() => ({ labels, setLabels }), [labels]);

  return <PublicA11yLabelsContext value={value}>{children}</PublicA11yLabelsContext>;
};
