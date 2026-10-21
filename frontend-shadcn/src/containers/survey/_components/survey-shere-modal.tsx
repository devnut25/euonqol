import apiClient from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { Check, Crown, Loader2, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Manager {
  id: string;
  username: string;
  email: string;
}

interface Invitation {
  id: number;
  manager: Manager;
  accessType: string;
  invitedAt: string;
}

interface SurveyShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surveyId: number | string;
  surveyName: string;
}

export function SurveyShareModal({
  open,
  onOpenChange,
  surveyId,
  surveyName,
}: SurveyShareModalProps) {
  const { t } = useTranslation(['survey']);
  const { user } = useAuth();

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [allManagers, setAllManagers] = useState<Manager[]>([]);
  const [creator, setCreator] = useState<Manager | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSelectedIds(new Set());
    loadData();
  }, [open, surveyId]);

  async function loadData() {
    setLoading(true);
    try {
      const [invRes, usersRes] = await Promise.all([
        apiClient.get(`/surveys/${surveyId}/managers`),
        apiClient.get('/users', { params: { 'filter[user_type]': 'manager', limit: 500 } }),
      ]);
      const surveyCreator: Manager | null = invRes.data.creator ?? null;
      setInvitations(invRes.data.invitedManagers ?? []);
      setCreator(surveyCreator);

      const users: Manager[] = (usersRes.data.data ?? []).map((u: any) => ({
        id: u.id,
        username: u.username ?? u.full_name ?? u.email,
        email: u.email,
      }));
      // Exclude current user and the survey creator from the selectable list
      setAllManagers(users.filter((m) => m.id !== user?.sub && m.id !== surveyCreator?.id));
    } catch {
      setError(t('share.load_error', 'Failed to load sharing data'));
    } finally {
      setLoading(false);
    }
  }

  function toggleManager(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleInvite() {
    if (selectedIds.size === 0) return;
    setInviting(true);
    setError(null);
    try {
      await Promise.all(
        Array.from(selectedIds).map((managerId) =>
          apiClient.post(`/surveys/${surveyId}/managers`, {
            manager_id: managerId,
            access_type: 'edit',
          })
        )
      );
      setSelectedIds(new Set());
      await loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? t('share.invite_error', 'Failed to invite manager');
      setError(msg);
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(managerId: string) {
    setRemovingId(managerId);
    setError(null);
    try {
      await apiClient.delete(`/surveys/${surveyId}/managers/${managerId}`);
      setInvitations((prev) => prev.filter((inv) => inv.manager.id !== managerId));
    } catch {
      setError(t('share.revoke_error', 'Failed to revoke access'));
    } finally {
      setRemovingId(null);
    }
  }

  const invitedIds = new Set(invitations.map((inv) => inv.manager.id));
  const availableManagers = allManagers.filter((m) => !invitedIds.has(m.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('share.title', 'Share Survey')}</DialogTitle>
          <p className="text-sm text-muted-foreground">{surveyName}</p>
        </DialogHeader>

        {/* Owner info */}
        {creator && (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
            <Crown className="size-4 text-amber-700 shrink-0" />
            <span className="text-muted-foreground">{t('share.owner', 'Owner')}:</span>
            <span className="font-medium">{creator.username}</span>
            {creator.email && (
              <span className="text-xs text-muted-foreground ml-auto">{creator.email}</span>
            )}
          </div>
        )}

        {loading ? (
          <div role="status" className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Loading…</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Available managers multi-select list */}
            {availableManagers.length > 0 ? (
              <div className="flex flex-col gap-1">
                <p
                  id="share-select-managers-label"
                  className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                >
                  {t('share.select_managers', 'Select managers to invite')}
                </p>
                <div
                  role="group"
                  aria-labelledby="share-select-managers-label"
                  className="rounded-md border divide-y max-h-48 overflow-y-auto"
                >
                  {availableManagers.map((m) => {
                    const selected = selectedIds.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleManager(m.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/50 ${selected ? 'bg-primary/5' : ''}`}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{m.username}</span>
                          {m.email && (
                            <span className="text-xs text-muted-foreground">{m.email}</span>
                          )}
                        </div>
                        {selected && <Check className="size-4 text-primary shrink-0" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
                <Button
                  onClick={handleInvite}
                  disabled={selectedIds.size === 0 || inviting}
                  size="sm"
                  className="self-end"
                >
                  {inviting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UserPlus className="size-4" />
                  )}
                  {selectedIds.size > 0
                    ? t('share.invite_count', 'Invite ({{count}})', { count: selectedIds.size })
                    : t('share.invite', 'Invite')}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('share.no_managers_available', 'No other managers available to invite.')}
              </p>
            )}

            {/* Error */}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            {/* Invited managers list */}
            {invitations.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('share.shared_with', 'Shared with')}
                </p>
                <div className="rounded-md border divide-y">
                  {invitations.map((inv) => (
                    <div
                      key={inv.manager.id}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{inv.manager.username}</span>
                        <span className="text-xs text-muted-foreground">{inv.manager.email}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        disabled={removingId === inv.manager.id}
                        aria-label={`Revoke access for ${inv.manager.username}`}
                        onClick={() => handleRevoke(inv.manager.id)}
                      >
                        {removingId === inv.manager.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {invitations.length === 0 && availableManagers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                {t('share.not_shared', 'This survey is not shared with anyone yet.')}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
