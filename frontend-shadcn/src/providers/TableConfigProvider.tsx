import { DevnutDescription } from '@/components/descriptions/DevnutDescription';
import { TableConfigContext, type ValueTypeConfig } from '@/hooks/useTableConfig';
import type { ReactNode } from 'react';

// Provider Props
interface TableConfigProviderProps {
  children: ReactNode;
}

// Provider Component
export const TableConfigProvider = ({ children }: TableConfigProviderProps) => {
  // ValueTypeMap di default
  const valueTypeMap: Record<string, ValueTypeConfig> = {
    boolean: {
      render: DevnutDescription.Boolean,
    },
    date: {
      render: DevnutDescription.Date,
    },
    number: {
      render: ({ value }) => (
        <span>{value == null ? '—' : (value as number).toLocaleString()}</span>
      ),
    },
    currency: {
      render: ({ value }) => (
        <span>
          {value == null
            ? '—'
            : new Intl.NumberFormat('it-IT', {
                style: 'currency',
                currency: 'EUR',
              }).format(value as number)}
        </span>
      ),
    },
    datetime: {
      render: DevnutDescription.DateTime,
    },
    percentage: {
      render: ({ value }) => <span>{value}%</span>,
    },
    badge: {
      render: ({ value, column }) => {
        const badgeConfig = column.columnDef.meta?.badgeConfig;
        const variant = badgeConfig?.variants?.[value] || 'default';
        return (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variant}`}
          >
            {badgeConfig?.labels?.[value] || value}
          </span>
        );
      },
    },
    longText: {
      render: DevnutDescription.LongText,
    },
    longTextHtml: {
      render: DevnutDescription.LongTextHtml,
    },
    languageFallback: {
      render: DevnutDescription.LanguageFallback,
    },
    pdfUrl: {
      render: DevnutDescription.PdfUrl,
    },
    link: {
      render: DevnutDescription.Link,
    },
  };

  return (
    <TableConfigContext.Provider value={{ valueTypeMap }}>{children}</TableConfigContext.Provider>
  );
};
