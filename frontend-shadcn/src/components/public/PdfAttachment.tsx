import {
  Attachment,
  AttachmentAction,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from '@/components/ui/attachment';
import { cn } from '@/lib/tailwind/utils';
import { buildDownloadUrl, filenameFromUrl } from '@/lib/file-url';
import { FileTextIcon, Trash2Icon } from 'lucide-react';

interface PdfAttachmentProps {
  url: string;
  label: string;
  /** Nome file originale (es. `content.pdf_filename`). Se assente, fallback sul nome estratto dall'URL. */
  filename?: string | null;
  className?: string;
  /** Se presente, mostra un pulsante per rimuovere l'allegato (es. t('form.pdf.remove')) */
  onRemove?: () => void;
  removeLabel?: string;
}

/**
 * Link ad allegato PDF nel flusso pubblico (presentation / privacy policy / study
 * info sheet). Indipendente da `ExistingFilePreview` (form system admin) ma riusa
 * gli stessi primitivi `Attachment*` di `@/components/ui/attachment` e ne segue
 * lo stesso layout (card + bottone elimina esterno, opzionale).
 */
export function PdfAttachment({ url, label, filename, className, onRemove, removeLabel }: PdfAttachmentProps) {
  const resolvedFilename = filename || filenameFromUrl(url);
  // Il backend forza sempre `Content-Disposition: attachment` su questo
  // endpoint (vedi downloadController.ts) — è quello che garantisce il
  // download anche su mobile, dove l'attributo `download` dell'anchor viene
  // ignorato dai browser per i PDF.
  const downloadUrl = buildDownloadUrl(url, resolvedFilename);
  return (
    <div className={cn('flex w-full gap-2', className)}>
      <Attachment className="w-full min-w-0 flex-1">
        <AttachmentMedia>
          <FileTextIcon />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{resolvedFilename}</AttachmentTitle>
          <AttachmentDescription>PDF</AttachmentDescription>
        </AttachmentContent>
        <AttachmentTrigger asChild>
          {/* Accessible name keeps the file name too — aria-label replaces the card text. */}
          <a
            href={downloadUrl}
            download={resolvedFilename}
            aria-label={`${label}: ${resolvedFilename} (PDF)`}
          />
        </AttachmentTrigger>
      </Attachment>
      {onRemove && (
        <AttachmentAction
          type="button"
          variant="destructive"
          aria-label={removeLabel}
          onClick={onRemove}
          className="h-auto w-10 shrink-0"
        >
          <Trash2Icon />
        </AttachmentAction>
      )}
    </div>
  );
}
