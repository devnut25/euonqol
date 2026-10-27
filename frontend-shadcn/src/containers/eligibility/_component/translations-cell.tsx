import { DevnutBadge } from '@/components/DevnutBadge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/tailwind/utils';
import { Star } from 'lucide-react';
import type { Question } from '../utils/types';

interface TranslationsCellProps {
  row: Question;
}

export const TranslationsCell = ({ row }: TranslationsCellProps) => {
  const translations = row.translations ?? [];

  if (translations.length === 0) {
    return <span className="text-xs text-muted-foreground italic">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {translations.map((tr) => (
        <Popover key={tr.language_id}>
          <PopoverTrigger asChild>
            <button type="button">
              <DevnutBadge
                className={cn(
                  'text-xs gap-1 cursor-pointer',
                  tr.is_fallback && 'bg-amber-100 text-amber-800'
                )}
              >
                {tr.is_fallback && (
                  <Star className="size-2.5 fill-amber-700 text-amber-700" aria-hidden="true" />
                )}
                {tr.language}
                {tr.is_fallback && <span className="sr-only"> (fallback)</span>}
              </DevnutBadge>
            </button>
          </PopoverTrigger>
          <PopoverContent className="text-sm">
            <p className="font-medium mb-1">{tr.question_text}</p>
            <p className="text-xs text-muted-foreground italic">
              ↳ {tr.disqualification_message}
            </p>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
};
