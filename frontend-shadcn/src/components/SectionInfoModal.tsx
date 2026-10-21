import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Info } from 'lucide-react';
import { useState } from 'react';

interface SectionInfoModalProps {
  title: string;
  items: { heading: string; description: string }[];
}

export function SectionInfoModal({ title, items }: SectionInfoModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        aria-label={`Info about ${title}`}
      >
        <Info size={18} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info size={16} className="text-primary" />
              {title}
            </DialogTitle>
          </DialogHeader>
          <ul className="flex flex-col gap-3 mt-1">
            {items.map((item) => (
              <li key={item.heading} className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{item.heading}</span>
                <span className="text-sm text-muted-foreground">{item.description}</span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
