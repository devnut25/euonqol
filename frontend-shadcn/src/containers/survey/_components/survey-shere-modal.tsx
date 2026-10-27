import apiClient from '@/api/client';
import { DevnutButton } from '@/components/DevnutButton';
import { DevnutToast } from '@/components/DevnutToast';
import { Form } from '@/components/form/form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { Check, Crown, Loader2, Search, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

type ShareTab = 'shared' | 'invite';

interface Manager {
  id: string;
  username?: string | null;
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

interface Invitation {
  id: number;
  manager: Manager;
  accessType: string;
  invitedAt: string;
}

interface InviteFormValues {
  manager_ids: string[];
}

interface SurveyShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surveyId: number | string;
  surveyName: string;
}

/** "First Last", falling back to username, then email. */
function displayName(m: Manager): string {
  const fullName = [m.first_name, m.last_name].filter(Boolean).join(' ').trim();
  return fullName || m.username || m.email || '';
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
  const [creator, setCreator] = useState<Manager | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<ShareTab>('shared');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [results, setResults] = useState<Manager[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const usersRequestId = useRef(0);

  const form = useForm<InviteFormValues>({ defaultValues: { manager_ids: [] } });
  const selectedIds = form.watch('manager_ids');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    form.reset();
    setSearch('');
    setDebouncedSearch('');
    loadShareData({ initial: true });
  }, [open, surveyId]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    loadUsers(1);
  }, [open, debouncedSearch]);

  /**
   * `initial` (modal opening) shows the full-body spinner and picks the starting tab;
   * later refreshes are silent so tabs and footer stay mounted.
   */
  async function loadShareData({ initial = false } = {}) {
    if (initial) setLoading(true);
    try {
      const res = await apiClient.get(`/surveys/${surveyId}/managers`);
      const invited: Invitation[] = res.data.invitedManagers ?? [];
      setInvitations(invited);
      setCreator(res.data.creator ?? null);
      // Not shared yet: open straight on the invite tab
      if (initial) setTab(invited.length > 0 ? 'shared' : 'invite');
    } catch {
      setError(t('share.load_error', 'Failed to load sharing data'));
    } finally {
      if (initial) setLoading(false);
    }
  }

  async function loadUsers(nextPage: number) {
    const requestId = ++usersRequestId.current;
    setLoadingUsers(true);
    try {
      const res = await apiClient.get('/users', {
        params: {
          'filter[user_type]': 'manager',
          search: debouncedSearch || undefined,
          sort: 'full_name',
          page: nextPage,
          per_page: PAGE_SIZE,
        },
      });
      // A newer search was fired meanwhile: drop this stale response
      if (requestId !== usersRequestId.current) return;

      const users: Manager[] = (res.data.data ?? []).map((u: any) => ({
        id: u.id,
        username: u.username ?? null,
        email: u.email ?? null,
        first_name: u.first_name ?? null,
        last_name: u.last_name ?? null,
      }));
      setResults((prev) => (nextPage === 1 ? users : [...prev, ...users]));
      setPage(nextPage);
      setLastPage(res.data.meta?.last_page ?? 1);
    } catch {
      if (requestId === usersRequestId.current) {
        setError(t('share.load_error', 'Failed to load sharing data'));
      }
    } finally {
      if (requestId === usersRequestId.current) setLoadingUsers(false);
    }
  }

  function toggleManager(id: string) {
    const ids = form.getValues('manager_ids');
    form.setValue('manager_ids', ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id], {
      shouldDirty: true,
    });
  }

  /**
   * Invites every selected manager independently: the ones that succeed leave the selection,
   * the failed ones stay selected so the user can retry. Failures are thrown as `{ message }`
   * so that Form shows them in its standard error toast.
   */
  async function handleInvite({ manager_ids }: InviteFormValues) {
    if (manager_ids.length === 0) return;
    setError(null);

    const outcomes = await Promise.allSettled(
      manager_ids.map((managerId) =>
        apiClient.post(`/surveys/${surveyId}/managers`, {
          manager_id: managerId,
          access_type: 'edit',
        })
      )
    );
    const succeededIds = manager_ids.filter((_, i) => outcomes[i].status === 'fulfilled');
    const failedIds = manager_ids.filter((_, i) => outcomes[i].status === 'rejected');

    if (succeededIds.length > 0) {
      await loadShareData();
      DevnutToast.success(t('share.invite_success', { count: succeededIds.length }));
    }

    if (failedIds.length === 0) {
      form.reset();
      setTab('shared');
      return;
    }

    form.setValue('manager_ids', failedIds, { shouldDirty: true });

    // Backend replies `{ success: false, message }`: keep its messages, deduplicated
    const reasons = [
      ...new Set(
        outcomes.flatMap((o) =>
          o.status === 'rejected' && o.reason?.response?.data?.message
            ? [String(o.reason.response.data.message)]
            : []
        )
      ),
    ];
    const fallback = t('share.invite_error', 'Failed to invite manager');
    const message =
      failedIds.length === 1
        ? (reasons[0] ?? fallback)
        : [
            t('share.invite_partial_error', '{{failed}} of {{total}} invitations failed', {
              failed: failedIds.length,
              total: manager_ids.length,
            }),
            ...reasons,
          ].join(' — ');
    throw { message };
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

  // Current user, survey creator and already invited managers cannot be selected
  const invitedIds = new Set(invitations.map((inv) => inv.manager.id));
  const availableManagers = results.filter(
    (m) => m.id !== user?.sub && m.id !== creator?.id && !invitedIds.has(m.id)
  );
  const hasMore = page < lastPage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-dvh max-w-full flex-col gap-0 rounded-none border-0 p-0 sm:h-[640px] sm:max-h-[90vh] sm:max-w-2xl sm:rounded-lg sm:border">
        <DialogHeader className="border-b px-4 pt-5 pb-4 pr-12 text-left sm:px-6">
          <DialogTitle>{t('share.title', 'Share Survey')}</DialogTitle>
          <DialogDescription className="truncate">{surveyName}</DialogDescription>
        </DialogHeader>

        <Form
          {...form}
          noHtmlForm
          onSubmit={handleInvite}
          messages={{ error: t('share.invite_error', 'Failed to invite manager') }}
          submitter={{
            render: (helpers) =>
              tab === 'invite' &&
              !loading && (
                <DialogFooter className="flex-row justify-end border-t px-4 py-3 sm:px-6">
                  <DevnutButton
                    variant="outline"
                    className="text-sm"
                    disabled={selectedIds.length === 0 || helpers.isSubmitting}
                    onClick={() => form.reset()}
                  >
                    {t('share.clear_selection', 'Clear')}
                  </DevnutButton>
                  <DevnutButton
                    className="flex-1 text-sm sm:flex-none"
                    disabled={selectedIds.length === 0 || helpers.isSubmitting}
                    onClick={helpers.submit}
                  >
                    {helpers.isSubmitting ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <UserPlus className="size-4" aria-hidden="true" />
                    )}
                    {selectedIds.length > 0
                      ? t('share.invite_count', 'Invite ({{count}})', { count: selectedIds.length })
                      : t('share.invite', 'Invite')}
                  </DevnutButton>
                </DialogFooter>
              ),
          }}
        >
          {loading ? (
            <div role="status" className="flex flex-1 items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">{t('share.loading', 'Loading…')}</span>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pt-4 sm:px-6">
              {/* Owner info */}
              {creator && (
                <div className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <Crown className="size-4 shrink-0 text-amber-700" aria-hidden="true" />
                  <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-2">
                    <span className="truncate">
                      <span className="text-muted-foreground">{t('share.owner', 'Owner')}: </span>
                      <span className="font-medium">{displayName(creator)}</span>
                    </span>
                    {creator.email && (
                      <span className="truncate text-xs text-muted-foreground sm:ml-auto">
                        {creator.email}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <Tabs
                value={tab}
                onValueChange={(v) => setTab(v as ShareTab)}
                className="min-h-0 flex-1 gap-3"
              >
                <TabsList className="w-full">
                  <TabsTrigger value="shared">
                    {t('share.shared_with', 'Shared with')}
                    <Badge className="min-w-5 px-1.5">{invitations.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="invite">
                    <UserPlus aria-hidden="true" />
                    {t('share.tab_invite', 'Add managers')}
                  </TabsTrigger>
                </TabsList>

                {/* Invited managers list */}
                <TabsContent value="shared" className="min-h-0 overflow-y-auto pb-4">
                  {invitations.length > 0 ? (
                    <div className="divide-y rounded-md border">
                      {invitations.map((inv) => (
                        <div key={inv.manager.id} className="flex items-center gap-3 px-3 py-2">
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-medium">
                              {displayName(inv.manager)}
                            </span>
                            {inv.manager.email && (
                              <span className="truncate text-xs text-muted-foreground">
                                {inv.manager.email}
                              </span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0 text-destructive hover:text-destructive"
                            disabled={removingId === inv.manager.id}
                            aria-label={t('share.revoke_aria', 'Revoke access for {{name}}', {
                              name: displayName(inv.manager),
                            })}
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
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-8 text-center">
                      <p className="text-sm text-muted-foreground">
                        {t('share.not_shared', 'This survey is not shared with anyone yet.')}
                      </p>
                      <Button variant="outline" size="sm" onClick={() => setTab('invite')}>
                        <UserPlus className="size-4" aria-hidden="true" />
                        {t('share.tab_invite', 'Add managers')}
                      </Button>
                    </div>
                  )}
                </TabsContent>

                {/* Managers search + multi-select list */}
                <TabsContent
                  value="invite"
                  className="flex min-h-0 flex-col gap-2 data-[state=inactive]:hidden"
                >
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t('share.search_placeholder', 'Search by name or email…')}
                      aria-label={t('share.search_placeholder', 'Search by name or email…')}
                      className="pl-9"
                    />
                  </div>

                  <div
                    role="group"
                    aria-label={t('share.select_managers', 'Select managers to invite')}
                    aria-busy={loadingUsers}
                    className="mb-4 min-h-0 flex-1 divide-y overflow-y-auto rounded-md border"
                  >
                    {availableManagers.map((m) => {
                      const isSelected = selectedIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => toggleManager(m.id)}
                          className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : ''}`}
                        >
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-medium">{displayName(m)}</span>
                            {m.email && (
                              <span className="truncate text-xs text-muted-foreground">
                                {m.email}
                              </span>
                            )}
                          </div>
                          {isSelected && (
                            <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })}

                    {loadingUsers && (
                      <div role="status" className="flex items-center justify-center py-4">
                        <Loader2
                          className="size-4 animate-spin text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="sr-only">{t('share.loading', 'Loading…')}</span>
                      </div>
                    )}

                    {!loadingUsers && availableManagers.length === 0 && (
                      <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                        {debouncedSearch
                          ? t('share.no_results', 'No managers match your search.')
                          : t(
                              'share.no_managers_available',
                              'No other managers available to invite.'
                            )}
                      </p>
                    )}

                    {!loadingUsers && hasMore && (
                      <div className="flex justify-center p-2">
                        <Button variant="ghost" size="sm" onClick={() => loadUsers(page + 1)}>
                          {t('share.load_more', 'Load more')}
                        </Button>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </Form>
      </DialogContent>
    </Dialog>
  );
}
