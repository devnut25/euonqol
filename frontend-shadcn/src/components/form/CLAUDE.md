# Form System — Guida per sviluppatori

## Architettura: due sistemi distinti

Il progetto contiene **due sistemi form indipendenti**. È fondamentale non mischiarli.

### 1. Sistema custom (QUELLO DA USARE)

Composto da:

| File | Ruolo |
|---|---|
| `components/form/form.tsx` | `<Form>` — wrapper principale, gestisce submit/API/readonly |
| `components/form/form-field.tsx` | `<FormField>` — provider del layout context (id, label, size…) |
| `components/form/form-field-controller.tsx` | `<FormFieldController>` — router verso il field component corretto |
| `components/form/form-field-error.tsx` | `<FormFieldError>` — visualizza errori RHF |
| `components/form/field-text/` | `<FieldText>` — input text/email/tel |
| `components/form/field-select/` | `<FieldSelect>` — select dropdown |
| `components/form/field-otp/` | `<FieldOtp>` — OTP input |
| `components/form/field-passord/` | `<FieldPassword>` — password con toggle visibilità |
| `components/form/field-number/` | `<FieldNumber>` — input numerico, converte automaticamente string→number |
| `components/form/field-date/` | `<FieldDate>` — date picker nativo, prop `displayFormat` (default `DD/MM/YYYY`), usa dayjs |
| `components/form/field-file/` | `<FieldFile>` — drag & drop file, prop `accept`, `onFileChange?(file\|null)` |

### 2. Shadcn/ui form (`components/ui/form.tsx`) — NON USARE nel sistema custom

Contiene `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` generati da shadcn.
**Non è integrato nel sistema custom** ed è presente solo come base di installazione shadcn.
Non usarne i componenti all'interno del form system custom per evitare conflitti.

---

## Context hierarchy

```
<Form>                          → FormProvider (react-hook-form)
  └─ FormReadOnlyProvider       → boolean (hooks/useFormReadOnly.ts)
       └─ <FormField>           → FormFieldContext: { id, label, descriptionId, errorId, size, required }
            └─ <FormFieldController>  → FormFieldControllerContext: { control, name, displayError }
                 └─ <FieldText|FieldSelect|…>
                      └─ <FormFieldError>
```

### Context e hook da usare

| Hook | Import corretto | Cosa fornisce |
|---|---|---|
| `useFormField()` | `@/hooks/useForm` | `{ id, label, descriptionId, errorId, size, required }` — lancia se non in `<FormField>` |
| `useFormFieldUnsafe()` | `@/hooks/useForm` | Stessa cosa ma ritorna `null` se fuori contesto |
| `useFormReadOnly()` | `@/hooks/useFormReadOnly` | `boolean \| undefined` — readonly del form |
| `FormFieldControllerContext` | `@/hooks/useFormField` | `{ control, name, displayError }` — usato da `<FormFieldError>` |

> **Regola d'oro**: non importare MAI da `../form-field` (il componente) per ottenere `useFormField`.
> L'hook vive in `@/hooks/useForm`, il componente in `components/form/form-field.tsx`.

---

## Gestione readonly

Il readonly ha due livelli:

1. **Form-level**: passare `readonly` a `<Form>` → viene scritto nel `FormReadOnlyContext`
2. **Field-level**: passare `readonly` a `<FormFieldController>` → sovrascrive il valore del form

`FormFieldController` applica `<fieldset disabled={finalReadOnly}>` per il blocco HTML nativo.
I field component (`FieldText`, `FieldSelect`, …) leggono anch'essi `finalReadOnly` per scegliere
tra render editabile o render statico (label + valore). Questa duplicazione è intenzionale:
il fieldset gestisce accessibility/HTML, il render switch gestisce la UI visiva.

---

## Come aggiungere un nuovo tipo di field

1. Creare la cartella `components/form/field-<nome>/index.tsx`
2. Definire il tipo `Field<Nome>Props` estendendo `FieldProps<…, { type: "<nome>", … }>`
3. Importare hook correttamente:
   - `useFormField` da `@/hooks/useForm` (NON da `../form-field`)
   - `useFormReadOnly` da `@/hooks/useFormReadOnly`
4. Aggiungere il tipo all'union `FormFieldControllerProps` in `form-field-controller.tsx`
5. Aggiungere il case nello switch `getField()` in `FormFieldController`

---

## Naming pitfall noti

- `FormFieldContext` esiste in DUE posti con forme diverse:
  - `hooks/useForm.ts` → `{ id, label, descriptionId, errorId, size, required }` (sistema custom)
  - `components/ui/form.tsx` → `{ name }` (shadcn — NON usare)
- `useFormField` esiste in DUE posti con firme diverse:
  - `hooks/useForm.ts` → legge il layout context custom (da usare)
  - `components/ui/form.tsx` → legge il context shadcn (NON usare nel custom system)
- `FormField` esiste in DUE posti:
  - `components/form/form-field.tsx` → provider layout context (da usare)
  - `components/ui/form.tsx` → wrapper Controller shadcn (NON usare nel custom system)

---

## Uso tipico

```tsx
const form = useForm<FormValues>({ ... });

<Form {...form} url="/euonqol-api/resource" initialValues={item} readonly={isView}>
  <FormField label="Nome" required>
    <FormFieldController type="text" name="name" control={form.control} />
  </FormField>
  <FormField label="Ruolo">
    <FormFieldController type="select" name="role" control={form.control} options={roleOptions} />
  </FormField>
</Form>
```

---

## Upload di file (multipart/form-data)

`Form` rileva **automaticamente** un campo file: se un valore del form è un'istanza di `File`,
la richiesta viene inviata come `multipart/form-data` invece che JSON — **non serve** passare
`onSubmit` custom, basta il normale `url`/`method`:

```tsx
<Form {...form} url="/euonqol-api/endpoint" initialValues={item}>
  <FormField label="File" required>
    <FormFieldController
      type="file"
      name="file"
      control={form.control}
      accept=".xlsx,.xls"
      onFileChange={(file) => { /* side effects, es. preview */ }}
    />
  </FormField>
</Form>
```

**Nota**: `type="file"` usa `z.instanceof(File)` nello schema Zod — non usare `z.string()`.
Il valore del campo è un oggetto `File`, non una stringa.

### Rimuovere un allegato esistente (edit)

`FieldFile`, quando riceve `existingFile`, mostra un file già salvato con un bottone "Remove".
Cliccandolo imposta `${name}_removed = true` nel form (via `setValue`), lasciando il campo
`${name}` stesso invariato (nessun nuovo file selezionato). `Form` intercetta questa convenzione
da solo: se `${name}_removed === true` e non è stato scelto un nuovo `File` per quel campo,
invia `${name}: null` al backend (segnale esplicito di rimozione) e non trasmette mai la chiave
`_removed`. Serve dichiarare `${name}_removed: z.boolean().optional()` nello schema Zod
(altrimenti zodResolver lo scarta) — vedi `features/schema/{study-info-sheet,presentation,privacy-policies}/schema.ts`
per un esempio completo (`pdf` + `pdf_removed`).
