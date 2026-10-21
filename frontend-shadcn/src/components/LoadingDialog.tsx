import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface LoadingDialogProps {
  open: boolean;
  title: string;
  description?: string;
}

/**
 * Blocking modal shown while a short async operation is running (no progress value
 * available — see the upload dialogs for the progress-bar variant). Cannot be dismissed
 * by the user: it closes when `open` goes back to false.
 */
export const LoadingDialog = ({ open, title, description }: LoadingDialogProps) => (
  <Dialog open={open} onOpenChange={() => {}}>
    <DialogContent
      className="sm:max-w-md flex flex-col items-center gap-6 py-10"
      onPointerDownOutside={(e) => e.preventDefault()}
      onInteractOutside={(e) => e.preventDefault()}
      onEscapeKeyDown={(e) => e.preventDefault()}
      showCloseButton={false}
    >
      <Loader2 aria-hidden="true" className="size-10 animate-spin text-primary" />
      <div className="flex flex-col items-center gap-2 text-center">
        {/* Visible title is the dialog name: no hidden duplicate read twice by screen readers */}
        <DialogTitle className="text-lg leading-normal font-semibold">{title}</DialogTitle>
        {description && (
          <DialogDescription className="text-sm text-muted-foreground">
            {description}
          </DialogDescription>
        )}
      </div>
    </DialogContent>
  </Dialog>
);
