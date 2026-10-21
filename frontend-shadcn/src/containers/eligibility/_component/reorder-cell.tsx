import { SimpleTooltip } from '@/components/ui/tooltip';
import { DevnutButton } from '@/components/DevnutButton';
import { useApi } from '@/hooks/useApi';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Question } from '../utils/types';

interface ReorderCellProps {
  item: Question;
  items: Question[];
  surveyId: string;
  reload: () => void;
}

// Survives a remount of the row after reload, so focus can be restored on the moved question.
let pendingFocus: { id: Question['id']; direction: 'up' | 'down' } | null = null;

// Blocco condiviso da tutte le righe: dopo uno spostamento le posizioni restano vecchie finché
// `reload` (che non è attendibile) non porta la lista aggiornata. Un secondo spostamento in quel
// lasso — doppio clic o clic su un'altra riga — userebbe order_position superate e scambierebbe
// le domande sbagliate. Il blocco si rilascia quando la lista cambia, in caso di errore o,
// come rete di sicurezza, dopo un timeout.
const REORDER_LOCK_TIMEOUT_MS = 5000;
let reorderLock: { signature: string; timer: ReturnType<typeof setTimeout> } | null = null;

const releaseReorderLock = () => {
  if (reorderLock) clearTimeout(reorderLock.timer);
  reorderLock = null;
};

// Timeout: la lista non è cambiata (reload fallito o nessuna modifica). Va scartato anche il
// focus in sospeso, altrimenti resterebbe "armato" e sposterebbe il focus su quella domanda
// al successivo cambio di indice o remount, anche molto più tardi.
const expireReorderLock = () => {
  releaseReorderLock();
  pendingFocus = null;
};

const getOrderSignature = (list: Question[]) =>
  list.map((q) => `${q.id}:${q.order_position}`).join(',');

const truncate = (text: string, max = 40) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export const ReorderCell = ({ item, items, surveyId, reload }: ReorderCellProps) => {
  const { makeRequest } = useApi();
  const [loading, setLoading] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);

  const index = items.findIndex((i) => i.id === item.id);
  const canMoveUp = index > 0;
  const canMoveDown = index >= 0 && index < items.length - 1;

  const questionText = truncate(
    item.translations?.find((tr) => tr.is_fallback)?.question_text ??
      item.translations?.[0]?.question_text ??
      `Question ${index + 1}`
  );

  useEffect(() => {
    if (pendingFocus?.id !== item.id) return;
    const target = pendingFocus.direction === 'up' ? upRef.current : downRef.current;
    if (target && document.activeElement !== target) target.focus();
    pendingFocus = null;
  }, [index, item.id]);

  // Lista aggiornata arrivata dopo il reload: si può spostare di nuovo
  const orderSignature = getOrderSignature(items);
  useEffect(() => {
    if (reorderLock && reorderLock.signature !== orderSignature) releaseReorderLock();
  }, [orderSignature]);

  const move = async (direction: 'up' | 'down') => {
    if (reorderLock) return;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    const target = items[swapIndex];
    if (!target) return;

    // Preso in modo sincrono: blocca anche un secondo clic arrivato prima del re-render
    reorderLock = {
      signature: orderSignature,
      timer: setTimeout(expireReorderLock, REORDER_LOCK_TIMEOUT_MS),
    };
    setLoading(true);
    try {
      await makeRequest(`/surveys/${surveyId}/eligibility-questions/reorder`, 'put', {
        order: [
          { id: item.id, order_position: target.order_position },
          { id: target.id, order_position: item.order_position },
        ],
      });
      pendingFocus = { id: item.id, direction };
      setAnnouncement(`Moved "${questionText}" to position ${swapIndex + 1} of ${items.length}`);
      reload();
    } catch (error) {
      // Nessuna modifica salvata: la lista non cambierà, il blocco va rilasciato subito
      releaseReorderLock();
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-0.5">
      <SimpleTooltip label="Move up" side="left">
        <DevnutButton
          ref={upRef}
          variant="ghost"
          size="icon"
          className="size-6 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
          aria-disabled={!canMoveUp || loading}
          onClick={() => canMoveUp && move('up')}
          aria-label={`Move "${questionText}" up`}
        >
          <ChevronUp className="size-3" aria-hidden="true" />
        </DevnutButton>
      </SimpleTooltip>
      <SimpleTooltip label="Move down" side="left">
        <DevnutButton
          ref={downRef}
          variant="ghost"
          size="icon"
          className="size-6 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
          aria-disabled={!canMoveDown || loading}
          onClick={() => canMoveDown && move('down')}
          aria-label={`Move "${questionText}" down`}
        >
          <ChevronDown className="size-3" aria-hidden="true" />
        </DevnutButton>
      </SimpleTooltip>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
};
