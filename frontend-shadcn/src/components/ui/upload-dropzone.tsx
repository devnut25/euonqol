import { cn } from "@/lib/tailwind/utils";
import { t } from "i18next";
import { Upload } from "lucide-react";
import { type Ref, useId, useImperativeHandle, useState } from "react";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";

export interface UploadDropzoneProps {
  id?: string;
  /** Root element ref (e.g. RHF `field.ref`, so focus-on-error can reach the dropzone). */
  ref?: Ref<HTMLDivElement>;
  ariaLabel?: string;
  /** Id of a visible label naming the dropzone; takes precedence over `ariaLabel`. */
  ariaLabelledBy?: string;
  /** Extra ids describing the dropzone (e.g. the field error message). */
  ariaDescribedBy?: string;
  /** aria-required is not allowed on role="button": announced through the description. */
  ariaRequired?: boolean;
  hasError?: boolean;
  disabled?: boolean;
  accept?: Accept;
  maxSize?: number;
  multiple?: boolean;
  defaultText?: string;
  otherText?: string;
  className?: string;
  onDrop: (files: File[]) => void;
  /**
   * Called when files are rejected (wrong type, too large, too many). When omitted, the
   * reason is shown in an alert under the dropzone so the rejection is never silent.
   */
  onDropRejected?: (rejections: FileRejection[], message: string) => void;
}

/** Human-readable reason for the first rejected file. */
export const getRejectionMessage = (rejections: FileRejection[], maxSize?: number) => {
  const error = rejections[0]?.errors[0];
  switch (error?.code) {
    case "file-invalid-type":
      return t("common:upload_dropzone.invalid_type");
    case "file-too-large":
      return maxSize
        ? t("common:upload_dropzone.too_large_size", {
            size: Math.round((maxSize / (1024 * 1024)) * 10) / 10,
          })
        : t("common:upload_dropzone.too_large");
    case "too-many-files":
      return t("common:upload_dropzone.too_many");
    default:
      return error?.message ?? t("common:upload_dropzone.generic");
  }
};

export const UploadDropzone = ({
  id,
  ref,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaRequired,
  hasError,
  disabled,
  accept,
  maxSize,
  multiple = false,
  defaultText = t("common:upload_dropzone.default_text"),
  otherText,
  className,
  onDrop,
  onDropRejected,
}: UploadDropzoneProps) => {
  const baseId = useId();
  const textId = `${baseId}-text`;
  const otherTextId = `${baseId}-other`;
  const rejectionId = `${baseId}-rejection`;
  const requiredId = `${baseId}-required`;
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);

  const { getRootProps, getInputProps, isDragActive, rootRef } = useDropzone({
    onDrop: (accepted) => {
      if (accepted.length > 0) {
        setRejectionMessage(null);
        onDrop(accepted);
      }
    },
    onDropRejected: (rejections) => {
      const message = getRejectionMessage(rejections, maxSize);
      if (onDropRejected) onDropRejected(rejections, message);
      else setRejectionMessage(message);
    },
    accept,
    maxSize,
    multiple,
    disabled,
  });

  // Exposes the dropzone root (attached by getRootProps through react-dropzone's rootRef) to the
  // caller's ref, e.g. RHF `field.ref` for focus-on-error, without mutating the hook's own ref.
  useImperativeHandle(ref, () => rootRef.current as HTMLDivElement, [rootRef]);

  const hasName = !!(ariaLabelledBy || ariaLabel);
  const describedBy =
    [
      // Without an explicit name the instructions text already is the name
      hasName && textId,
      ariaRequired && requiredId,
      otherText && otherTextId,
      ariaDescribedBy,
      rejectionMessage && rejectionId,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  const invalid = hasError || !!rejectionMessage;

  return (
    <>
      <div
        {...getRootProps({
          id,
          role: "button",
          "aria-label": ariaLabelledBy ? undefined : (ariaLabel ?? defaultText),
          "aria-labelledby": ariaLabelledBy,
          "aria-describedby": describedBy,
          "aria-invalid": invalid || undefined,
          "aria-disabled": disabled || undefined,
          className: cn(
            "border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors",
            "flex flex-col justify-center items-center gap-2",
            isDragActive && "border-primary bg-primary/5",
            !isDragActive && !invalid && "border-muted-foreground/70 hover:border-primary",
            invalid && "border-destructive",
            disabled && "opacity-50 cursor-not-allowed",
            className,
          ),
        })}
      >
        <Upload aria-hidden="true" className="size-6 text-muted-foreground" />
        <p id={textId} className="text-sm text-muted-foreground">
          {defaultText}
        </p>
        {otherText && (
          <p id={otherTextId} className="text-xs text-muted-foreground">
            {otherText}
          </p>
        )}
        {ariaRequired && (
          <span id={requiredId} className="sr-only">
            {t("common:errors.required")}
          </span>
        )}
      </div>
      {/* Fuori dal role="button": un controllo dentro un altro non è ammesso (axe nested-interactive).
          Il nome e l'interazione sono già sul contenitore, l'input serve solo al file picker. */}
      <input {...getInputProps({ "aria-hidden": true })} />
      {rejectionMessage && (
        <p id={rejectionId} role="alert" className="mt-1 text-sm text-destructive">
          {rejectionMessage}
        </p>
      )}
    </>
  );
};
