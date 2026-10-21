import apiClient from '@/api/client';
import type { CrudDataTableType, Values } from '@/hooks/useCrudDataTable';
import { useFormChangedContext } from '@/hooks/useFormChanged';
import { FormReadOnlyProvider } from '@/hooks/useFormReadOnly';
import { cn } from '@/lib/tailwind/utils';
import { t } from 'i18next';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import {
  FormProvider,
  type FieldValues,
  type FormProviderProps,
  type FormState,
  type Path,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { DevnutButton } from '../DevnutButton';
import { DevnutToast } from '../DevnutToast';
import { FormSubmitter } from './form-submitter';

// ============== TIPI SUBMITTER ==============

export type SubmitterSearchConfig = {
  submitText?: ReactNode /** Testo del bottone submit (default "Salva") */;
  resetText?: string /** Testo del bottone reset (default "Annulla") */;
};

export type SubmitterRenderHelpers<TFieldValues extends FieldValues = FieldValues> = {
  submit: () => void /** Invoca submit programmaticamente */;
  reset: () => void /** Reset form */;
  isSubmitting: boolean /** Indica se il form è in fase di submit */;
  isDirty: boolean /** Indica se il form ha modifiche non salvate */;
  formState: FormState<TFieldValues> /** Stato completo del form */;
};

export type SubmitterProps<TFieldValues extends FieldValues = FieldValues> = {
  searchConfig?: SubmitterSearchConfig /** Config minimale per generare i bottoni di default */;
  resetButtonProps?: ButtonHTMLAttributes<HTMLButtonElement> /** Props aggiuntive per il bottone reset */;
  submitButtonProps?: ButtonHTMLAttributes<HTMLButtonElement> /** Props aggiuntive per il bottone submit */;
  showInView?: boolean /** Se true mostra il submitter anche in modalità readonly (default false) */;
  className?: string /** Classe CSS per il wrapper del submitter */;
  /**
   * Render function per override completo.
   * @param helpers - Oggetto con metodi e stato del form
   * @param defaultDom - Il DOM di default generato dal submitter
   * @returns ReactNode personalizzato
   */
  render?: (helpers: SubmitterRenderHelpers<TFieldValues>, defaultDom: ReactNode) => ReactNode;
};

// ============== TIPI API ==============

export type ApiMethod = 'post' | 'patch' | 'put' | 'delete';

export type ApiConfig = {
  /** URL endpoint per le operazioni CRUD */
  url: string;
  /** Metodo HTTP (default: auto-detect da initialValues.id) */
  method?: ApiMethod;
  /** Headers aggiuntivi per la richiesta */
  headers?: Record<string, string>;
  /** Trasforma i dati prima dell'invio */
  transformRequest?: (data: FieldValues) => FieldValues;
  /** Trasforma la risposta */
  transformResponse?: (response: any) => any;
};

export type FormMessages = {
  success?: string;
  error?: string;
  validationError?: string;
};

// ============== TIPI FORM ==============

export type FormProps<
  TFieldValues extends FieldValues = FieldValues,
  TContext = any,
  TTransformedValues = TFieldValues,
> = FormProviderProps<TFieldValues, TContext, TTransformedValues> & {
  // Layout
  noHtmlForm?: boolean;
  className?: string;
  readonly?: boolean;

  // API Integration
  url?: string;
  method?: ApiMethod;
  api?: ApiConfig;

  // Initial values (per determinare POST vs PATCH)
  initialValues?: Values;

  // Callbacks
  onSubmit?: SubmitHandler<TTransformedValues>;
  onSuccess?: (response: { data: any }) => void | Promise<void>;
  onError?: (error: any) => void | Promise<void>;
  onLoadingChange?: (loading: boolean) => void;
  onClose?: () => void;

  // Submitter
  type?: CrudDataTableType;
  submitter?: SubmitterProps<TFieldValues>;

  // Messages
  messages?: FormMessages;

  // Auto focus first input
  autoFocusFirstInput?: boolean;
};

// ============== TOAST/MESSAGE HELPER ==============
// Puoi sostituire con il tuo sistema di notifiche (sonner, react-hot-toast, etc.)

const showMessage = {
  success: (msg: string) => {
    DevnutToast.success(msg);
  },
  error: (msg: string) => {
    DevnutToast.error(t('common:errors.generic'), msg);
  },
};

// ============== SET ERRORS HELPER ==============

// Esclude controlli disabilitati o non renderizzati (display:none, tab inattive, lista nascosta):
// focus() su questi fallirebbe in silenzio.
const isFocusableAndVisible = (el: HTMLElement) =>
  (el.tabIndex >= 0 || el.isContentEditable) &&
  !el.hasAttribute('disabled') &&
  el.getClientRects().length > 0;

// eslint-disable-next-line react-refresh/only-export-components
export const setFormErrors =<T extends FieldValues>(
  form: UseFormReturn<T>,
  errors?: Record<string, string[]>,
  /** Contenitore in cui cercare il campo da focalizzare (default: document) */
  root?: ParentNode | null
) => {
  if (!errors) return false;

  const keys = Object.keys(errors);
  let firstFieldName = '';

  keys.forEach((key, index) => {
    // Gestione errori nested: "address.city" -> ["address", "city"]
    const fieldPath = key.split('.').reduce(
      (acc, part) => {
        const num = Number(part);
        return !isNaN(num) ? [...acc, num] : [...acc, part];
      },
      [] as (string | number)[]
    );

    const fieldName = fieldPath.join('.') as any;
    const errorMessages = errors[key];
    if (index === 0) firstFieldName = fieldName;

    form.setError(fieldName, {
      type: 'server',
      message: errorMessages[0], // Prendi il primo errore
    });
  });

  // Scroll al primo errore e sposta il focus sul relativo controllo (WCAG 3.3.1).
  // La ricerca è limitata a `root` (il <form> corrente): altrimenti potrebbe finire su un
  // altro form aperto nella pagina o su un elemento nascosto, perdendo il focus.
  if (keys.length > 0) {
    setTimeout(() => {
      const scope = root ?? document;
      // Primo controllo focusabile e visibile marcato aria-invalid, in ordine DOM
      const firstInvalid = Array.from(
        scope.querySelectorAll<HTMLElement>('[aria-invalid="true"]')
      ).find(isFocusableAndVisible);
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstInvalid.focus({ preventScroll: true });
        return;
      }
      // Nessun controllo trovato nel DOM: si prova con il ref registrato in RHF
      form.setFocus(firstFieldName as Path<T>);
      const firstError = scope.querySelector('[data-error="true"], [role="alert"]');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }

  return keys.length > 0;
};

// ============== FILE-AWARE REQUEST BODY ==============
// Auto-rileva campi `type="file"` (FieldFile) senza bisogno di configurazione: se un
// qualsiasi valore del form è un `File`, la richiesta va inviata come multipart/form-data
// (necessario per l'upload). Il segnale di rimozione di un allegato esistente (impostato
// da FieldFile's onRemoveExisting via `setValue(\`${name}_removed\`, true)`) viene tradotto
// nel campo omonimo settato a `null` — stesso contratto già accettato dal backend
// (`pdf: null` ecc.) — e la chiave `_removed` stessa non viene mai inviata.

const REMOVED_SUFFIX = '_removed';

function buildRequestData(data: Record<string, unknown>): FormData | Record<string, unknown> {
  const removedKeys = new Set(
    Object.keys(data).filter((key) => key.endsWith(REMOVED_SUFFIX) && data[key] === true)
  );
  const hasFile = Object.values(data).some((value) => value instanceof File);

  if (hasFile) {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (removedKeys.has(key) || value === undefined || value === null) return;
      // Lists (e.g. `type="list"` fields) and nested objects cannot travel as a
      // plain form field: send them JSON-encoded, the backend parses them back.
      if (
        Array.isArray(value) ||
        (typeof value === 'object' && !(value instanceof Blob) && !(value instanceof Date))
      ) {
        formData.append(key, JSON.stringify(value));
        return;
      }
      formData.append(key, typeof value === 'boolean' ? String(value) : (value as string | Blob));
    });
    return formData;
  }

  const rest: Record<string, unknown> = {};
  Object.entries(data).forEach(([key, value]) => {
    if (removedKeys.has(key)) return;
    rest[key] = value;
  });
  removedKeys.forEach((key) => {
    rest[key.slice(0, -REMOVED_SUFFIX.length)] = null;
  });
  return rest;
}

// ============== INTERNAL SUBMITTER ==============

interface InternalSubmitterProps<TFieldValues extends FieldValues> {
  submitter: SubmitterProps<TFieldValues>;
  formState: FormState<TFieldValues>;
  reset: () => void;
  triggerSubmit: () => void;
  type?: CrudDataTableType;
}

function InternalSubmitter<TFieldValues extends FieldValues>({
  submitter,
  formState,
  reset,
  triggerSubmit,
  type,
}: InternalSubmitterProps<TFieldValues>) {
  const { t } = useTranslation(['common']);

  const { searchConfig, resetButtonProps, submitButtonProps, render, className, showInView } =
    submitter;

  const submitText = searchConfig?.submitText ?? t('buttons.values.save');

  const helpers: SubmitterRenderHelpers<TFieldValues> = {
    submit: triggerSubmit,
    reset,
    isSubmitting: formState.isSubmitting,
    isDirty: formState.isDirty,
    formState,
  };

  // Gestione display:none tramite style per nascondere il bottone reset
  const resetStyle = resetButtonProps?.style;
  const isResetHidden = resetStyle?.display === 'none';

  const submitButton = (
    <DevnutButton
      type="submit"
      variant="secondary"
      className="text-sm"
      disabled={helpers.isSubmitting}
      onClick={(e) => {
        if (e.currentTarget.form === null) {
          e.preventDefault();
          helpers.submit();
        }
      }}
      {...submitButtonProps}
    >
      {submitText}
    </DevnutButton>
  );

  const defaultDom = (
    <FormSubmitter
      type={type}
      onBack={isResetHidden ? undefined : reset}
      loading={formState.isSubmitting}
      className={className}
      showInReadOnly={showInView}
    >
      {submitButton}
    </FormSubmitter>
  );

  // Se c'è render custom, usalo
  if (render) {
    return <>{render(helpers, defaultDom)}</>;
  }

  return defaultDom;
}

export const Form = <TFieldValues extends FieldValues>({
  noHtmlForm = false,
  className,
  readonly,
  url,
  method: methodProp,
  api,
  initialValues,
  onSubmit: onSubmitProp,
  onSuccess,
  onError,
  onLoadingChange,
  onClose,
  type,
  submitter,
  messages,
  autoFocusFirstInput = false,
  children,
  ...formMethods
}: FormProps<TFieldValues>) => {
  const readOnlyValue = !!readonly;
  const touchedRef = useRef(false);
  const formElRef = useRef<HTMLFormElement>(null);
  const uniqueId = useRef(useId());
  const formChanged = useFormChangedContext();

  const { t } = useTranslation(['common']);

  // Determina URL e metodo
  const apiUrl = api?.url ?? url;
  const autoMethod: ApiMethod = initialValues?.id ? 'patch' : 'post';
  const method = api?.method ?? methodProp ?? autoMethod;

  // Setup form changed tracking
  const setCheckFormChanged = formChanged?.setCheckFormChanged;

  useEffect(() => {
    const currentId = uniqueId.current;
    const checkFormChanged = () => touchedRef.current || formMethods.formState.isDirty;

    setCheckFormChanged?.((prev) => ({
      ...prev,
      [currentId]: checkFormChanged,
    }));

    return () => {
      setCheckFormChanged?.((prev) => {
        const curr = { ...prev };
        delete curr[currentId];
        return curr;
      });
    };
  }, [setCheckFormChanged, formMethods.formState.isDirty]);

  // Track field changes
  useEffect(() => {
    if (formMethods.formState.isDirty) {
      touchedRef.current = true;
    }
  }, [formMethods.formState.isDirty]);

  // Auto focus first input
  useEffect(() => {
    if (autoFocusFirstInput && !readOnlyValue) {
      setTimeout(() => {
        // Limitato al form corrente; con noHtmlForm non c'è un <form> e si usa il documento
        const scope = formElRef.current ?? document;
        const firstInput = Array.from(
          scope.querySelectorAll<HTMLElement>(
            'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
          )
        ).find(isFocusableAndVisible);
        firstInput?.focus();
      }, 100);
    }
  }, [autoFocusFirstInput, readOnlyValue]);

  // API request handler — invia multipart/form-data se il payload contiene un File
  // (upload di un allegato), altrimenti JSON come prima. Vedi buildRequestData sopra.
  const makeApiRequest = async (data: TFieldValues) => {
    if (!apiUrl) {
      throw new Error(t('crud_data_table.invalid_url'));
    }

    const transformedData = api?.transformRequest ? api.transformRequest(data) : data;
    const body = buildRequestData(transformedData as Record<string, unknown>);

    if (body instanceof FormData) {
      // useApi().makeRequest fa un roundtrip JSON.stringify/parse sul config, che
      // distruggerebbe il FormData — bypassiamo l'hook e chiamiamo axios direttamente,
      // rimuovendo il Content-Type forzato dall'istanza così axios genera da sé il boundary.
      const response = await apiClient.request({
        method,
        url: apiUrl,
        data: body,
        headers: { 'Content-Type': undefined },
      });
      return api?.transformResponse ? api.transformResponse(response.data) : response.data;
    }

    // Chiamata diretta ad axios invece di useApi().makeRequest: quest'ultimo, in caso di
    // errore, rigetta solo la stringa `message` ("Validation error") e perde `errors`,
    // necessario per mostrare gli errori sui campi. Il catch di handleFormSubmit legge
    // il payload da `error.response.data`.
    const { data: response } = await apiClient.request({
      method,
      url: apiUrl,
      data: JSON.stringify(body),
    });

    if (!response.success) {
      throw { message: response.message || 'Request failed', errors: response.errors };
    }

    return api?.transformResponse ? api.transformResponse(response.data) : response.data;
  };

  // Submit handler
  const handleFormSubmit: SubmitHandler<TFieldValues> = async (data) => {
    try {
      onLoadingChange?.(true);

      if (onSubmitProp) {
        await onSubmitProp(data);
        return;
      }

      if (!apiUrl) {
        console.warn(t('crud_data_table.invalid_url'));
        return;
      }

      const response = await makeApiRequest(data);
      touchedRef.current = false;
      showMessage.success(messages?.success ?? t('crud_data_table.response_messages.success'));
      await onSuccess?.({ data: response });
      return response;
    } catch (error: any) {
      await onError?.(error);

      // Errore axios "grezzo" (ramo multipart) espone il payload backend in
      // `.response.data`; l'errore già-parsato del ramo JSON (sopra) lo espone
      // direttamente su se stesso — un solo punto per estrarre `message`/`errors`.
      const payload = error?.response?.data ?? error;

      setFormErrors(
        formMethods as UseFormReturn<TFieldValues>,
        payload?.errors,
        formElRef.current
      );

      // Il toast resta generico (es. "Validation error"): il dettaglio è mostrato
      // inline sui campi da setFormErrors, con focus sul primo campo in errore.
      const errorDescription =
        typeof error === 'string'
          ? error
          : (payload?.message ?? messages?.error ?? t('crud_data_table.response_messages.error'));

      showMessage.error(errorDescription);
    } finally {
      onLoadingChange?.(false);
    }
  };

  // Trigger submit programmatically
  const triggerSubmit = () => {
    formMethods.handleSubmit(handleFormSubmit)();
  };

  // Close/back handler: reset form values and notify the parent container (if any)
  const handleClose = () => {
    formMethods.reset();
    onClose?.();
  };

  // Render del submitter
  const renderSubmitter = () => {
    if (!submitter) return null;

    return (
      <InternalSubmitter
        submitter={submitter}
        formState={formMethods.formState}
        reset={handleClose}
        triggerSubmit={triggerSubmit}
        type={type}
      />
    );
  };

  const formContent = (
    <>
      {children}
      {renderSubmitter()}
    </>
  );

  if (noHtmlForm) {
    return (
      <FormReadOnlyProvider value={readOnlyValue}>
        <FormProvider {...formMethods}>{formContent}</FormProvider>
      </FormReadOnlyProvider>
    );
  }

  return (
    <FormReadOnlyProvider value={readOnlyValue}>
      <FormProvider {...formMethods}>
        <form
          ref={formElRef}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            formMethods.handleSubmit(handleFormSubmit)(e);
          }}
          className={cn('w-full', className)}
        >
          {formContent}
        </form>
      </FormProvider>
    </FormReadOnlyProvider>
  );
};
