import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/tailwind/utils';
import type { ReactNode } from 'react';

export interface DevnutAccordionSection {
  value: string;
  title: string;
  content: ReactNode;
  hidden?: boolean;
}

interface DevnutAccordionProps {
  sections: DevnutAccordionSection[];
  /** Values of the sections open on mount; all visible sections when omitted. */
  defaultOpen?: string[];
  className?: string;
}

/** Groups detail sections into collapsible panels. */
export function DevnutAccordion({ sections, defaultOpen, className }: DevnutAccordionProps) {
  const visible = sections.filter((section) => !section.hidden);

  return (
    <Accordion
      type="multiple"
      defaultValue={defaultOpen ?? visible.map((section) => section.value)}
      className={cn('w-full flex flex-col gap-4', className)}
    >
      {visible.map((section) => (
        <AccordionItem
          key={section.value}
          value={section.value}
          className="rounded-md border last:border-b px-4"
        >
          <AccordionTrigger className="text-lg font-semibold text-black hover:no-underline">
            {section.title}
          </AccordionTrigger>
          <AccordionContent>{section.content}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
