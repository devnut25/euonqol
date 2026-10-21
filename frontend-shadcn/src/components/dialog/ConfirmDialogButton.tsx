import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  description?: string;
  confirmText?: string;
  requireInput?: boolean;
  inputText?: string;
  loading?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText,
  requireInput = false,
  inputText = "DELETE",
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation(["common"]);

  const [inputValue, setInputValue] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  const canConfirm = requireInput ? inputValue === inputText : true;

  const confirmButtonText = confirmText ?? t("buttons.deleteConfirm.text");
  const dialogTitle = title ?? t("buttons.deleteConfirm.title");
  const dialogDescription =
    description ?? t("buttons.deleteConfirm.description");

  const handleConfirm = async () => {
    if (!canConfirm || isConfirming) return;

    setIsConfirming(true);
    try {
      await onConfirm();
      setInputValue("");
      onOpenChange(false);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancel = () => {
    setInputValue("");
    onOpenChange(false);
  };

  return (
    // TODO: da completare la configurazione applicando gli stili Devnut, creando un componente dedicato
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <p>{dialogDescription}</p>

            {requireInput && (
              <div className="space-y-2 pt-2">
                <Label htmlFor="confirm-input" className="text-sm font-medium">
                  Digita{" "}
                  <span className="font-mono font-bold">{inputText}</span> per
                  confermare
                </Label>
                <Input
                  id="confirm-input"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={inputText}
                  autoComplete="off"
                  className="font-mono"
                />
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isConfirming}>
            {t("buttons.deleteConfirm.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!canConfirm || isConfirming}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isConfirming
              ? t("buttons.deleteConfirm.deleting")
              : confirmButtonText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
