import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Values } from '@/hooks/useCrudDataTable';

export const useEligibilityFormSubmit = (
  onLoadingChange?: (loading: boolean) => void,
  onSuccess?: (response: { data: Values }) => void
) => {
  const { t } = useTranslation(['eligibility']);

  return async (fn: () => Promise<void>) => {
    onLoadingChange?.(true);
    try {
      await fn();
      toast.success(t('language_manager.success.added'));
      onSuccess?.({ data: {} });
    } catch (err) {
      toast.error(typeof err === 'string' ? err : t('language_manager.errors.save_failed'));
    } finally {
      onLoadingChange?.(false);
    }
  };
};
