import { DevnutToast } from '@/components/DevnutToast';
import copy from 'copy-to-clipboard';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Copies text to the clipboard and shows the shared success toast.
 * Centralizes the CopyToClipboard + DevnutToast pattern used by
 * QrCodeContent and table action buttons.
 */
export function useCopyToClipboard() {
  const { t } = useTranslation(['common']);

  const copyToClipboard = useCallback(
    (text: string) => {
      copy(text);
      DevnutToast.success(t('common:buttons.copyLink.success'));
    },
    [t]
  );

  return copyToClipboard;
}
