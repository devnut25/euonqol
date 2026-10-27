import DevnutTypography from '@/components/DevnutTypography';
import { cn } from '@/lib/tailwind/utils';
import type { Key, ReactNode } from 'react';

interface DevnutItemListProps<T> {
  title?: string;
  emptyText: string;
  items: T[];
  getKey: (item: T, index: number) => Key;
  getText: (item: T) => ReactNode;
  getActive?: (item: T) => boolean | undefined;
}

export function DevnutItemList<T>({
  title,
  emptyText,
  items,
  getKey,
  getText,
  getActive,
}: DevnutItemListProps<T>) {
  return (
    <div className="w-full">
      {title && <DevnutTypography.SubTitle title={title} />}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((item, idx) => (
            <div key={getKey(item, idx)} className="flex items-center gap-3 py-1">
              <span className="text-xs font-mono text-gray-600 w-6 text-right shrink-0">
                {idx + 1}.
              </span>
              {getActive && (
                <div
                  className={cn(
                    'w-2.5 h-2.5 rounded-full shrink-0',
                    getActive(item) ? 'bg-green-500' : 'bg-gray-300'
                  )}
                >
                  {/* The dot colour alone doesn't convey the status (1.4.1) */}
                  <span className="sr-only">{getActive(item) ? 'Active' : 'Inactive'}</span>
                </div>
              )}
              <span className="text-sm flex-1">{getText(item)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
