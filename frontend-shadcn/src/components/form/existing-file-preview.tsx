import {
  Attachment,
  AttachmentAction,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from '@/components/ui/attachment';
import { buildDownloadUrl, filenameFromUrl } from '@/lib/file-url';
import { cn } from '@/lib/tailwind/utils';
import { FileTextIcon, Trash2Icon } from 'lucide-react';

interface ExistingFilePreviewProps {
  /** URL del file già caricato (es. `initialValues.pdf_url`) */
  url: string;
  /** Testo accessibile per l'azione "apri" (es. t('form.pdf.current')) */
  label: string;
  /** Nome file originale (es. `initialValues.pdf_filename`). Se assente, fallback sul nome estratto dall'URL. */
  filename?: string | null;
  className?: string;
  /** Se presente, mostra un pulsante per rimuovere l'allegato esistente (es. t('form.pdf.remove')) */
  onRemove?: () => void;
  removeLabel?: string;
  /** "card" (default): Attachment completo con icona e rimozione. "link": solo testo cliccabile, per readonly. */
  variant?: 'card' | 'link';
}

/**
 * Preview "da allegato" per un file già caricato su un record esistente,
 * basata sul componente shadcn `Attachment` (@/components/ui/attachment).
 * Usata da `FieldFile` per mostrare l'allegato esistente accanto al nuovo file
 * eventualmente selezionato (variant "card") o come link semplice in readonly
 * (variant "link").
 *
 * Il backend forza sempre `Content-Disposition: attachment` su questi url
 * (vedi downloadController.ts) — niente `target="_blank"` (aprirebbe solo una
 * tab vuota prima del download), si usa `download` + `buildDownloadUrl` per
 * ottenere il nome file originale invece dell'hash generato server-side.
 */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function ExistingFilePreview({
  url,
  label,
  filename,
  className,
  onRemove,
  removeLabel,
  variant = 'card',
}: ExistingFilePreviewProps) {
  const downloadUrl = buildDownloadUrl(url, filename);
  const displayName = filename || filenameFromUrl(url);
  const isImage = isImageUrl(url);

  if (variant === 'link') {
    return (
      <a
        href={downloadUrl}
        download={filename ?? undefined}
        className={cn('underline text-primary', className)}
      >
        {displayName}
      </a>
    );
  }

  return (
    <div className={cn('flex w-full items-center gap-2', className)}>
      <Attachment className="w-full min-w-0 flex-1">
        <AttachmentMedia variant={isImage ? 'image' : 'icon'}>
          {isImage ? <img src={url} alt={displayName} /> : <FileTextIcon />}
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{displayName}</AttachmentTitle>
          <AttachmentDescription>{isImage ? 'Image' : 'PDF'}</AttachmentDescription>
        </AttachmentContent>
        <AttachmentTrigger asChild>
          <a href={downloadUrl} download={filename ?? undefined} aria-label={label} />
        </AttachmentTrigger>
      </Attachment>
      {onRemove && (
        <AttachmentAction
          type="button"
          variant="destructive"
          size="icon-lg"
          aria-label={removeLabel}
          onClick={onRemove}
          // className="shrink-0"
        >
          <Trash2Icon />
        </AttachmentAction>
      )}
    </div>
  );
}
