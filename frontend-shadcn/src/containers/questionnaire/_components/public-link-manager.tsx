import apiClient from '@/api/client';
import { DevnutButton } from '@/components/DevnutButton';
import { DevnutToast } from '@/components/DevnutToast';
import { QrCodeContent } from '@/components/QrCodeContent';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApi } from '@/hooks/useApi';
import { Globe, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

interface PublicLinkManagerProps {
  open: boolean;
  onClose: () => void;
  surveyId: string | number;
  questionnaireId: string | number;
  onLinkChange?: () => void;
}

export const PublicLinkManager = ({
  open,
  onClose,
  surveyId,
  questionnaireId,
  onLinkChange,
}: PublicLinkManagerProps) => {
  const { t } = useTranslation(['assignment']);
  const { makeRequest } = useApi();

  const [publicLink, setPublicLink] = useState<string | null>(null);
  const [publicLinkLoading, setPublicLinkLoading] = useState(false);
  const [hasPolicies, setHasPolicies] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open || !surveyId || !questionnaireId) return;

    makeRequest(`/surveys/${surveyId}/privacy-policies`)
      .then((data) => setHasPolicies((data?.data?.length ?? 0) > 0))
      .catch(() => setHasPolicies(false));

    makeRequest(`/surveys/${surveyId}/questionnaires/${questionnaireId}/public-link`)
      .then((data) => setPublicLink(data?.data?.public_link ?? null))
      .catch(() => {
        // no public link yet (404) or other fetch failure — treat as "no link"
      });
  }, [open, surveyId, questionnaireId, makeRequest]);

  const handleGeneratePublicLink = useCallback(async () => {
    if (!surveyId || !questionnaireId) return;
    setPublicLinkLoading(true);
    try {
      const res = await apiClient.post(
        `/surveys/${surveyId}/questionnaires/${questionnaireId}/public-link`
      );
      setPublicLink(res.data.data?.public_link ?? null);
      DevnutToast.success(t('public_anonymous_link.toasts.generate_success'));
      onLinkChange?.();
    } catch (err: any) {
      if (err.response?.status === 409) {
        setPublicLink(err.response.data.public_link ?? null);
        onLinkChange?.();
      } else {
        DevnutToast.error(t('public_anonymous_link.toasts.generate_error'));
      }
    } finally {
      setPublicLinkLoading(false);
    }
  }, [surveyId, questionnaireId, t, onLinkChange]);

  const handleDeletePublicLink = useCallback(async () => {
    if (!surveyId || !questionnaireId) return;
    setPublicLinkLoading(true);
    try {
      await apiClient.delete(
        `/surveys/${surveyId}/questionnaires/${questionnaireId}/public-link`
      );
      setPublicLink(null);
      DevnutToast.success(t('public_anonymous_link.toasts.revoke_success'));
      onLinkChange?.();
    } catch {
      DevnutToast.error(t('public_anonymous_link.toasts.revoke_error'));
    } finally {
      setPublicLinkLoading(false);
    }
  }, [surveyId, questionnaireId, t, onLinkChange]);

  const renderContent = () => {
    if (hasPolicies === false) {
      return (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{t('public_anonymous_link.no_policies_banner.title')}</p>
            <p className="text-xs mt-0.5">
              <Trans
                ns="assignment"
                i18nKey="public_anonymous_link.no_policies_banner.description"
                components={{ strong: <strong /> }}
              />
            </p>
          </div>
        </div>
      );
    }

    // Buttons stay mounted while a request is in flight so keyboard focus is not lost.
    const spinner = <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />;

    if (publicLink) {
      return (
        <div className="border rounded-md p-4 bg-muted/30">
          <div className="flex flex-col items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              {t('public_anonymous_link.description')}
            </p>

            <QrCodeContent
              allowDownload
              url={`${window.location.origin}/q/${publicLink}`}
              actions={
                <DevnutButton
                  variant="destructive"
                  title={t('public_anonymous_link.revoke_button_title')}
                  onClick={() => !publicLinkLoading && handleDeletePublicLink()}
                  aria-busy={publicLinkLoading || undefined}
                  aria-disabled={publicLinkLoading || undefined}
                  className="flex-1 gap-2"
                >
                  {publicLinkLoading ? spinner : <Trash2 aria-hidden="true" />}
                  <div>Delete</div>
                </DevnutButton>
              }
            />
          </div>
        </div>
      );
    } else {
      return (
        <DevnutButton
          variant="outline"
          size="sm"
          className="shrink-0 gap-2"
          onClick={() => !publicLinkLoading && handleGeneratePublicLink()}
          disabled={!hasPolicies}
          aria-busy={publicLinkLoading || undefined}
          aria-disabled={publicLinkLoading || undefined}
        >
          {publicLinkLoading ? spinner : <Globe className="size-4" aria-hidden="true" />}
          {t('public_anonymous_link.generate_button')}
        </DevnutButton>
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('public_anonymous_link.title')}</DialogTitle>
        </DialogHeader>

        {renderContent()}
        <span role="status" className="sr-only">
          {publicLinkLoading ? 'Loading…' : ''}
        </span>
      </DialogContent>
    </Dialog>
  );
};
