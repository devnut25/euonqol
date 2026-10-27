import { DevnutButton } from '@/components/DevnutButton';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { ClipboardCopy, Download } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useRef } from 'react';

interface QrCodeContentProps {
  /** Full URL to encode in the QR */
  url: string;
  /** If true shows a download-as-PNG button */
  allowDownload?: boolean;
  /** Add additional actions */
  actions?: React.ReactNode;
}

export function QrCodeContent({ url, allowDownload = false, actions }: QrCodeContentProps) {
  const copyToClipboard = useCopyToClipboard();

  const canvasRef = useRef<HTMLCanvasElement>(null);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Add white padding around the QR code via an offscreen canvas
    const padding = 24;
    const size = canvas.width + padding * 2;
    const offscreen = document.createElement('canvas');
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(canvas, padding, padding);
    const dataUrl = offscreen.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'qrcode.png';
    a.click();
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {/* Hidden canvas used for download; visible QRCodeCanvas is SVG-backed */}
      <div className="hidden">
        <QRCodeCanvas ref={canvasRef} value={url} size={512} marginSize={2} />
      </div>

      {/* Visible QR code */}
      <div className="rounded-lg border p-3 bg-white">
        {/* A canvas has no content for assistive technologies: name it (WCAG 1.1.1) */}
        <QRCodeCanvas
          value={url}
          size={200}
          marginSize={2}
          role="img"
          aria-label="QR code of the link shown below"
        />
      </div>

      <p className="text-xs text-muted-foreground text-center break-all max-w-full">{url}</p>

      <div className="flex flex-col sm:flex-row gap-2 w-full">
        <DevnutButton
          variant="outline"
          className="sm:flex-1 gap-2"
          onClick={() => copyToClipboard(url)}
        >
          <ClipboardCopy className="size-4" aria-hidden="true" />
          Copy link
        </DevnutButton>
        {allowDownload && (
          <DevnutButton variant="outline" className="sm:flex-1 gap-2" onClick={handleDownload}>
            <Download className="size-4" aria-hidden="true" />
            Download PNG
          </DevnutButton>
        )}
        {actions}
      </div>
    </div>
  );
}
