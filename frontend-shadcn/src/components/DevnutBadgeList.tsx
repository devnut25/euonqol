import { DevnutBadge } from '@/components/DevnutBadge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/tailwind/utils';
import type { Key, ReactNode } from 'react';

interface DevnutBadgeListProps<T> {
  label: string;
  items: T[];
  getKey: (item: T) => Key;
  getText: (item: T) => ReactNode;
  emphasized?: boolean;
}

/** Labelled row of outline badges, one per item; "—" when the list is empty. */
export function DevnutBadgeList<T>({
  label,
  items,
  getKey,
  getText,
  emphasized,
}: DevnutBadgeListProps<T>) {
  const renderItems = () => {
    if (items.length === 0) {
      return <span className="text-sm text-muted-foreground">—</span>;
    }

    return items.map((item) => (
      <DevnutBadge key={getKey(item)} variant="outline" className="text-xs font-normal bg-white">
        {getText(item)}
      </DevnutBadge>
    ));
  };

  return (
    <div className="w-full flex justify-between items-start gap-12">
      {label && (
        <Label className={cn(emphasized ? 'font-bold text-primary' : 'text-black')}>{label}</Label>
      )}
      <div className="flex flex-wrap gap-1.5 justify-end ml-auto">{renderItems()}</div>
    </div>
  );
}
