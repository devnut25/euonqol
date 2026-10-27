import { DevnutButton } from '@/components/DevnutButton';
import { PublicLayout } from '@/layouts/PublicLayout';
import { useTranslation } from 'react-i18next';
import type { PublicLabelsStatus } from './usePublicLabels';

interface PublicTextsGateProps {
  status: Exclude<PublicLabelsStatus, 'ready'>;
  onRetry: () => void;
}

/**
 * Full-page screen shown while the public page's texts (Settings › Languages) are loading,
 * or when they couldn't be loaded. Its own texts come from the locales: without the DB
 * texts there is nothing else to show.
 */
export function PublicTextsGate({ status, onRetry }: PublicTextsGateProps) {
  const { t } = useTranslation(['common']);

  if (status === 'loading') {
    return (
      <div role="status" className="flex items-center justify-center min-h-dvh bg-white">
        <div
          aria-hidden="true"
          className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"
        />
        <span className="sr-only">{t('public_texts.loading')}</span>
      </div>
    );
  }

  return (
    <PublicLayout>
      <div role="alert" className="text-center max-w-sm px-6 flex flex-col items-center gap-4">
        <h1 className="text-2xl font-semibold text-gray-800">{t('public_texts.error_title')}</h1>
        <p className="text-gray-700">{t('public_texts.error_description')}</p>
        <DevnutButton type="button" onClick={onRetry}>
          {t('public_texts.reload')}
        </DevnutButton>
      </div>
    </PublicLayout>
  );
}
