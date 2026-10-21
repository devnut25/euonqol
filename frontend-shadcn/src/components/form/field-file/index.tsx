import DevnutSection from '@/components/DevnutSection';
import {
  Attachment,
  AttachmentAction,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from '@/components/ui/attachment';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { UploadDropzone } from '@/components/ui/upload-dropzone';
import { useFormField } from '@/hooks/useForm';
import { useFormReadOnly } from '@/hooks/useFormReadOnly';
import { cn } from '@/lib/tailwind/utils';
import { FileTextIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useMemo, useState, type ComponentProps, type Ref } from 'react';
import type { Accept } from 'react-dropzone';
import {
  Controller,
  useFormContext,
  type ControllerFieldState,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { ExistingFilePreview } from '../existing-file-preview';
import type { FieldProps } from '../form-field-controller';
import { FormFieldError } from '../form-field-error';
import { useDescribedBy } from '../use-described-by';

export type FieldFileProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = FieldProps<
  TFieldValues,
  TName,
  TTransformedValues,
  {
    type: 'file';
    /** MIME type map for react-dropzone e.g. `{ "application/vnd.ms-excel": [".xls", ".xlsx"] }` */
    acceptedFileTypes?: Accept;
    defaultText?: string;
    otherText?: string;
    maxSize?: number;
    onFileChange?: (file: File | null) => void;
    containerProps?: ComponentProps<'div'>;
    /** Pulisce automaticamente l'errore RHF sul campo quando l'utente cambia il file (default true) */
    clearErrorsOnChange?: boolean;
    /** File già salvato su un record esistente, mostrato come preview accanto al nuovo file eventualmente selezionato */
    existingFile?: { url: string; label: string; filename?: string | null; removeLabel?: string };
  }
>;

export const FieldFile = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>(
  props: FieldFileProps<TFieldValues, TName, TTransformedValues>
) => {
  const {
    name,
    type: _type,
    disabled,
    defaultValue,
    shouldUnregister,
    control,
    containerProps,
    size: _size,
    readonly,
    acceptedFileTypes = {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    defaultText = 'Select or drag and drop your file here',
    otherText,
    maxSize = 10 * 1024 * 1024,
    onFileChange,
    clearErrorsOnChange = true,
    existingFile,
  } = props;

  const ctx = useFormField();
  const describedBy = useDescribedBy();
  const formReadOnly = useFormReadOnly();
  const { clearErrors, setError, setValue } = useFormContext();
  const finalReadOnly = readonly ?? formReadOnly ?? false;
  const hasLabel = !!ctx.label;
  const [existingRemoved, setExistingRemoved] = useState(false);

  return (
    <Controller
      name={name}
      control={control}
      disabled={disabled}
      defaultValue={defaultValue}
      shouldUnregister={shouldUnregister}
      render={({ field, fieldState }) => {
        if (finalReadOnly) {
          return (
            <FieldFileReadOnly
              containerProps={containerProps}
              fieldState={fieldState}
              field={field}
              existingFile={existingFile}
            />
          );
        }

        return (
          <DevnutSection.Grid
            {...containerProps}
            className={cn(
              'w-full items-start gap-2 md:gap-0',
              hasLabel ? 'grid-cols-1 md:grid-cols-4' : '',
              containerProps?.className
            )}
          >
            {hasLabel && (
              <Label id={ctx.labelId} className="gap-1">
                {ctx.label}
                {ctx.required && (
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                )}
              </Label>
            )}
            <div className={cn('w-full', hasLabel ? 'md:col-span-3' : '')}>
              <DropZoneInput
                ref={field.ref}
                id={ctx.id}
                ariaLabel={ctx.label}
                ariaLabelledBy={hasLabel ? ctx.labelId : undefined}
                ariaDescribedBy={describedBy(!!fieldState.error)}
                ariaRequired={ctx.required}
                hasError={!!fieldState.error}
                disabled={disabled}
                value={field.value as File | null}
                acceptedFileTypes={acceptedFileTypes}
                defaultText={defaultText}
                otherText={otherText}
                maxSize={maxSize}
                existingFile={existingRemoved ? undefined : existingFile}
                onRemoveExisting={() => {
                  setExistingRemoved(true);
                  setValue(`${name}_removed` as any, true, { shouldDirty: true });
                }}
                onChange={(file) => {
                  if (clearErrorsOnChange && fieldState.error) {
                    clearErrors(name);
                  }
                  field.onChange(file);
                  onFileChange?.(file);
                }}
                onDropRejected={(message) => setError(name, { type: 'validate', message })}
              />
              <FormFieldError />
            </div>
          </DevnutSection.Grid>
        );
      }}
    />
  );
};

// ─── DropZoneInput ────────────────────────────────────────────────────────────

interface DropZoneInputProps {
  id?: string;
  ref?: Ref<HTMLDivElement>;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaRequired?: boolean;
  hasError?: boolean;
  disabled?: boolean;
  value: File | null;
  acceptedFileTypes: Accept;
  defaultText: string;
  otherText?: string;
  maxSize: number;
  existingFile?: { url: string; label: string; filename?: string | null; removeLabel?: string };
  onRemoveExisting?: () => void;
  onChange: (file: File | null) => void;
  /** Receives the reason a dropped file was rejected (type, size). */
  onDropRejected?: (message: string) => void;
}

const DropZoneInput = ({
  id,
  ref,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaRequired,
  hasError,
  disabled,
  value,
  acceptedFileTypes,
  defaultText,
  otherText,
  maxSize,
  existingFile,
  onRemoveExisting,
  onChange,
  onDropRejected,
}: DropZoneInputProps) => {
  // Object URL locale per permettere di aprire/scaricare il file appena
  // selezionato prima ancora che sia stato inviato al backend (non ha un
  // `url` server-side finché il form non viene salvato).
  const objectUrl = useMemo(() => (value ? URL.createObjectURL(value) : null), [value]);
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  return (
    <>
      <UploadDropzone
        ref={ref}
        id={id}
        ariaLabel={ariaLabel}
        ariaLabelledBy={ariaLabelledBy}
        ariaDescribedBy={ariaDescribedBy}
        ariaRequired={ariaRequired}
        hasError={hasError}
        disabled={disabled}
        accept={acceptedFileTypes}
        maxSize={maxSize}
        defaultText={defaultText}
        otherText={otherText}
        onDrop={(files) => onChange(files[0] ?? null)}
        onDropRejected={onDropRejected ? (_, message) => onDropRejected(message) : undefined}
      />

      {existingFile && (
        <ExistingFilePreview
          url={existingFile.url}
          label={existingFile.label}
          filename={existingFile.filename}
          className="mt-2"
          onRemove={onRemoveExisting}
          removeLabel={existingFile.removeLabel}
        />
      )}

      {value && (
        <div className="flex w-full items-center gap-2 mt-2">
          <Attachment className="w-full min-w-0 flex-1">
            <AttachmentMedia variant={value.type.startsWith('image/') ? 'image' : 'icon'}>
              {value.type.startsWith('image/') && objectUrl ? (
                <img src={objectUrl} alt={value.name} />
              ) : (
                <FileTextIcon />
              )}
            </AttachmentMedia>
            <AttachmentContent>
              <div className="flex items-center gap-2">
                <AttachmentTitle>{value.name}</AttachmentTitle>
                {existingFile && <Badge variant="secondary">New</Badge>}
              </div>
              <AttachmentDescription>{(value.size / 1024).toFixed(1)} KB</AttachmentDescription>
            </AttachmentContent>
            {objectUrl && (
              <AttachmentTrigger asChild>
                <a href={objectUrl} download={value.name} aria-label={value.name} />
              </AttachmentTrigger>
            )}
          </Attachment>
          <AttachmentAction
            type="button"
            variant="destructive"
            size="icon-lg"
            aria-label="Remove"
            onClick={() => onChange(null)}
          >
            <Trash2Icon />
          </AttachmentAction>
        </div>
      )}
    </>
  );
};

// ─── ReadOnly ─────────────────────────────────────────────────────────────────

export const FieldFileReadOnly = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  containerProps,
  fieldState,
  field,
  existingFile,
}: {
  containerProps?: ComponentProps<'div'>;
  fieldState: ControllerFieldState;
  field: ControllerRenderProps<TFieldValues, TName>;
  existingFile?: { url: string; label: string; filename?: string | null; removeLabel?: string };
}) => {
  const ctx = useFormField();

  const fileValue =
    field.value != null && typeof field.value === 'object' && 'name' in field.value
      ? (field.value as File).name
      : null;

  const displayValue =
    fileValue ?? existingFile?.filename ?? existingFile?.label ?? field.value ?? '—';
  const showExistingLink = !fileValue && !!existingFile;

  return (
    <>
      <div
        {...containerProps}
        className={cn('flex justify-between items-center', containerProps?.className)}
      >
        {ctx.label && (
          <Label htmlFor={ctx.id} className="text-primary font-bold">
            {ctx.label}
          </Label>
        )}
        <div
          id={ctx.id}
          aria-describedby={fieldState.error ? ctx.errorId : undefined}
          className="ml-auto font-light"
        >
          {showExistingLink && existingFile ? (
            <ExistingFilePreview
              variant="link"
              url={existingFile.url}
              label={existingFile.label}
              filename={existingFile.filename}
            />
          ) : (
            displayValue
          )}
        </div>
      </div>
      <Separator className="mt-2" />
    </>
  );
};
