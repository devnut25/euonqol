import DevnutSection from '@/components/DevnutSection';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CAT_SETTINGS_GROUP_COLUMNS } from '@/containers/module-library/_helpers/validation';
import { RichText } from '@/lib/rich-text';
import { SheetValidationStatusEnum } from '@/utils/enum';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import type {
  LanguageDiffData,
  SheetData,
  SheetValidation,
} from '@/containers/module-library/form-upload';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTabStatus(
  name: string,
  sheetValidation: SheetValidation | null
): SheetValidationStatusEnum {
  if (!sheetValidation) return SheetValidationStatusEnum.Unknown;
  if (sheetValidation.extra.includes(name)) return SheetValidationStatusEnum.Extra;
  if (sheetValidation.typos.some((t) => t.found === name)) return SheetValidationStatusEnum.Typo;
  if (sheetValidation.valid.includes(name)) {
    const col = sheetValidation.columns[name];
    if (
      col &&
      (col.missing.length > 0 ||
        col.typos.length > 0 ||
        col.duplicates.length > 0 ||
        col.invalidInValues.length > 0 ||
        col.invalidBounds.length > 0)
    )
      return SheetValidationStatusEnum.ColumnError;
    return SheetValidationStatusEnum.Valid;
  }
  return SheetValidationStatusEnum.Unknown;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TabStatusIcon({ status }: { status: SheetValidationStatusEnum }) {
  if (status === SheetValidationStatusEnum.Valid)
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-700" />;
  if (status === SheetValidationStatusEnum.Typo || status === SheetValidationStatusEnum.ColumnError)
    return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
  if (status === SheetValidationStatusEnum.Extra)
    return <AlertTriangle className="h-3.5 w-3.5 text-white" />;
  return null;
}

interface SheetHeaderCellProps {
  label: string;
  isInvalid: boolean;
  isDuplicate: boolean;
}

function SheetHeaderCell({ label, isInvalid, isDuplicate }: SheetHeaderCellProps) {
  return (
    <TableHead
      className={clsx(
        'border-r border-border last:border-r-0 font-semibold',
        isInvalid
          ? 'bg-destructive text-destructive-foreground'
          : isDuplicate
            ? 'bg-orange-700 text-white'
            : 'text-white'
      )}
    >
      <span className="flex items-center gap-1">
        {(isInvalid || isDuplicate) && <AlertTriangle className="h-3 w-3 shrink-0" />}
        {label}
      </span>
    </TableHead>
  );
}

interface SheetContentProps {
  name: string;
  rows: (string | number | null)[][];
  colValidation: SheetValidation['columns'][string] | undefined;
  isLoading: boolean;
  languageDiff?: LanguageDiffData | null;
  invalidCatSettingKeys?: string[];
}

function SheetContent({
  name,
  rows,
  colValidation,
  isLoading,
  languageDiff,
  invalidCatSettingKeys,
}: SheetContentProps) {
  const headers = rows[0] ?? [];
  const bodyRows = rows.slice(1);
  const invalidCols = new Set([
    ...(colValidation?.typos.map((t) => t.found) ?? []),
    ...(colValidation?.missing ?? []),
  ]);
  const duplicateCols = new Set(colValidation?.duplicates ?? []);

  // Language diff highlighting — only for the Languages sheet
  const isLangSheet = name === 'Languages' && !!languageDiff;
  const idColIdx = isLangSheet
    ? headers.findIndex((h) => String(h ?? '').toLowerCase() === 'id')
    : -1;
  const onlyInFileIds = new Set((languageDiff?.onlyInFile ?? []).map((l) => l.id));
  const changedByRowId = new Map(
    (languageDiff?.changed ?? []).map((e) => [e.id, new Set(e.changes.map((c) => c.field))])
  );

  const getRowId = (row: (string | number | null)[]) =>
    idColIdx !== -1 ? Number(row[idColIdx]) : NaN;

  const isRowHighlighted = (row: (string | number | null)[]) => {
    const id = getRowId(row);
    return !isNaN(id) && (onlyInFileIds.has(id) || changedByRowId.has(id));
  };

  const isCellChanged = (row: (string | number | null)[], colIndex: number) => {
    const id = getRowId(row);
    if (isNaN(id)) return false;
    const changedFields = changedByRowId.get(id);
    if (!changedFields) return false;
    const colHeader = String(headers[colIndex] ?? '').toLowerCase();
    return changedFields.has(colHeader);
  };

  // Operator === 'IN' rows with a malformed Value column (see form-upload.tsx validateInOperatorValues)
  const valueColIdx = headers.findIndex((h) => String(h ?? '') === 'Value');
  // Question_Text may contain admin-authored HTML (e.g. from an "Additional Information"
  // socio-demo/feedback sheet) — rendered formatted (sanitized) instead of as literal tags.
  const questionTextColIdx = headers.findIndex((h) => String(h ?? '') === 'Question_Text');
  const invalidInRows = new Set((colValidation?.invalidInValues ?? []).map((e) => e.row));
  const isInvalidInValueCell = (bodyRowIndex: number, colIndex: number) =>
    colIndex === valueColIdx && invalidInRows.has(bodyRowIndex + 2); // +2: header row + 1-based

  // Answers sheet (socio-demo/feedback) — Min/Max cells failing validateAnswerBounds
  const boundsColIdx = {
    Min: headers.findIndex((h) => String(h ?? '') === 'Min'),
    Max: headers.findIndex((h) => String(h ?? '') === 'Max'),
  };
  const invalidBoundsCells = new Set(
    (colValidation?.invalidBounds ?? []).map((e) => `${e.row}:${boundsColIdx[e.column]}`)
  );
  const isInvalidBoundsCell = (bodyRowIndex: number, colIndex: number) =>
    invalidBoundsCells.has(`${bodyRowIndex + 2}:${colIndex}`);

  // CatSettings sheet only — flag Group A-D cells whose setting_key the CAT API
  // couldn't find (see form-upload.tsx catSettingValidation/validateMissingCatSettings).
  const invalidCatSettingKeysSet = new Set(invalidCatSettingKeys ?? []);
  const catSettingGroupColIdxs = new Set(
    CAT_SETTINGS_GROUP_COLUMNS.map((col) =>
      headers.findIndex((h) => String(h ?? '') === col)
    ).filter((idx) => idx !== -1)
  );
  const isInvalidCatSettingKeyCell = (row: (string | number | null)[], colIndex: number) =>
    name === 'CatSettings' &&
    catSettingGroupColIdxs.has(colIndex) &&
    invalidCatSettingKeysSet.has(String(row[colIndex] ?? '').trim());

  return (
    <TabsContent value={name} className="mt-2">
      <div className="relative max-h-[600px] overflow-auto rounded-md border">
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-50/80">
            <DevnutSection.Loading />
          </div>
        )}
        <Table tableContainerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="border-b border-border bg-primary hover:bg-transparent">
              {headers.map((h, i) => (
                <SheetHeaderCell
                  key={i}
                  label={String(h ?? '')}
                  isInvalid={invalidCols.has(String(h ?? ''))}
                  isDuplicate={duplicateCols.has(String(h ?? ''))}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bodyRows.map((row, ri) => (
              <TableRow
                key={ri}
                className={clsx(
                  'border-b border-border last:border-b-0',
                  isRowHighlighted(row) && 'bg-yellow-300/50'
                )}
              >
                {row.map((cell, ci) => (
                  <TableCell
                    key={ci}
                    className={clsx(
                      'border-r border-border last:border-r-0',
                      isCellChanged(row, ci) && 'bg-yellow-500/60 font-medium',
                      isInvalidInValueCell(ri, ci) &&
                        'bg-destructive/70 text-destructive-foreground font-medium',
                      isInvalidBoundsCell(ri, ci) &&
                        'bg-destructive/70 text-destructive-foreground font-medium',
                      isInvalidCatSettingKeyCell(row, ci) &&
                        'bg-destructive/70 text-destructive-foreground font-medium'
                    )}
                  >
                    {ci === questionTextColIdx ? (
                      <RichText html={String(cell ?? '')} />
                    ) : (
                      String(cell ?? '')
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TabsContent>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface TabPreviewProps {
  activeSheet: string;
  sheetNames: string[];
  sheets: SheetData;
  sheetValidation: SheetValidation | null;
  setActiveSheet: (name: string) => void;
  languageDiff?: LanguageDiffData | null;
  invalidCatSettingKeys?: string[];
}

export const TabPreview = ({
  activeSheet,
  sheetNames,
  sheets,
  sheetValidation,
  setActiveSheet,
  languageDiff,
  invalidCatSettingKeys,
}: TabPreviewProps) => {
  const [isSheetLoading, setIsSheetLoading] = useState(false);

  return (
    <Tabs
      value={activeSheet}
      onValueChange={(name) => {
        setIsSheetLoading(true);
        setActiveSheet(name);
        setTimeout(() => setIsSheetLoading(false), 0);
      }}
    >
      {sheetNames.length > 1 && (
        <TabsList className="w-full">
          {sheetNames.map((name) => {
            const status = getTabStatus(name, sheetValidation);
            const hasError =
              status === SheetValidationStatusEnum.Typo ||
              status === SheetValidationStatusEnum.ColumnError;
            const isExtra = status === SheetValidationStatusEnum.Extra;
            const isCatSettingKeyError =
              name === 'CatSettings' && (invalidCatSettingKeys?.length ?? 0) > 0;
            // Languages the backend rejects: changed/unknown rows of the Languages sheet,
            // or Language_ID of Questions/Answers missing from the database
            const hasLangError =
              !!languageDiff &&
              ((name === 'Languages' &&
                (languageDiff.onlyInFile.length > 0 || languageDiff.changed.length > 0)) ||
                ((name === 'Questions' || name === 'Answers') &&
                  languageDiff.unknownIds.length > 0));
            return (
              <TabsTrigger
                key={name}
                value={name}
                className={clsx(
                  'flex-1 gap-1.5',
                  (hasError || isCatSettingKeyError || hasLangError) &&
                    'text-destructive data-[state=active]:text-destructive',
                  isExtra &&
                    'bg-destructive/40 text-destructive-foreground data-[state=active]:bg-destructive data-[state=active]:text-white'
                )}
              >
                <TabStatusIcon status={status} />
                {(isCatSettingKeyError || hasLangError) && !hasError && (
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                )}
                {name}
              </TabsTrigger>
            );
          })}
        </TabsList>
      )}
      {sheetNames.map((name) => (
        <SheetContent
          key={name}
          name={name}
          rows={sheets[name] ?? []}
          colValidation={sheetValidation?.columns[name]}
          isLoading={isSheetLoading && activeSheet === name}
          languageDiff={name === 'Languages' ? languageDiff : null}
          invalidCatSettingKeys={name === 'CatSettings' ? invalidCatSettingKeys : undefined}
        />
      ))}
    </Tabs>
  );
};
