import { DevnutBadge } from '@/components/DevnutBadge';
import dayjs from 'dayjs';
import { CheckCircle2, FileTextIcon, Star, XCircle } from 'lucide-react';

const DescriptionBoolean = (row: { value: any }) => {
  // Icons carry the meaning: give them a text alternative (1.1.1)
  if (row.value)
    return <CheckCircle2 role="img" aria-label="Yes" className="size-5 text-green-600" />;
  return <XCircle role="img" aria-label="No" className="size-5 text-red-600" />;
};

const DescriptionDate = (row: { value: any }) => {
  return row.value ? <>{dayjs(row.value).format('L')}</> : <>—</>;
};

const DescriptionDateTime = (row: { value: any }) => {
  return row.value ? <>{dayjs(row.value).format('L LT')}</> : <>—</>;
};

const DescriptionLongText = (row: { value: any }) => {
  return row.value ? <span className="line-clamp-1 max-w-50">{row.value}</span> : <span>—</span>;
};

const DescriptionLongTextHtml = (row: { value: any }) => {
  return row.value ? (
    <div
      className="truncate max-w-[300px] **:inline"
      dangerouslySetInnerHTML={{ __html: String(row.value) }}
    />
  ) : (
    <span>—</span>
  );
};

const DescriptionLanguageFallback = (row: {
  value: any;
  row?: any;
  column?: any;
  label?: string;
}) => {
  const label = row.label ?? row.column?.columnDef?.meta?.fallbackLabel ?? 'Fallback';
  return (
    <div className="flex gap-2">
      <>{row.value}</>
      {row.row?.is_fallback && (
        <DevnutBadge className="bg-amber-100 text-amber-800 text-xs gap-1">
          <Star className="size-2.5 fill-amber-700 text-amber-700" />
          {label}
        </DevnutBadge>
      )}
    </div>
  );
};

const DescriptionPdfUrl = (row: { row?: any }) =>
  row.row?.pdf_url ? (
    <FileTextIcon role="img" aria-label="PDF" className="size-5 text-muted-foreground" />
  ) : (
    <span>—</span>
  );

const DevnutDescription = {
  Boolean: DescriptionBoolean,
  Date: DescriptionDate,
  DateTime: DescriptionDateTime,
  LongText: DescriptionLongText,
  LongTextHtml: DescriptionLongTextHtml,
  LanguageFallback: DescriptionLanguageFallback,
  PdfUrl: DescriptionPdfUrl,
};

export { DevnutDescription };
