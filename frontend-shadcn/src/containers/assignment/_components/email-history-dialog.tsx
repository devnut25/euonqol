import apiClient from '@/api/client';
import { DevnutBadge } from '@/components/DevnutBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/tailwind/utils';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface EmailLog {
  id: number;
  status: 'sent' | 'failed';
  error_message: string | null;
  attempted_at: string;
}

interface EmailHistoryDialogProps {
  assignmentId: number | null;
  onClose: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  sent: 'bg-blue-100 text-blue-800',
  failed: 'bg-red-100 text-red-800',
};

export function EmailHistoryDialog({ assignmentId, onClose }: EmailHistoryDialogProps) {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (assignmentId === null) return;
    setLoading(true);
    apiClient
      .get(`/assignments/${assignmentId}/email-logs`)
      .then((res) => setLogs(res.data?.data?.logs ?? []))
      .finally(() => setLoading(false));
  }, [assignmentId]);

  return (
    <Dialog open={assignmentId !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Email send history</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div role="status" className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              <span className="sr-only">Loading…</span>
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No send attempts recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {logs.map((log) => (
                <li key={log.id} className="py-3 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <DevnutBadge className={cn('font-medium capitalize', STATUS_STYLES[log.status])}>
                      {log.status}
                    </DevnutBadge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.attempted_at).toLocaleString()}
                    </span>
                  </div>
                  {log.error_message && (
                    <p className="text-sm text-red-700">{log.error_message}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
