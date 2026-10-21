import { useTranslation } from 'react-i18next';

/**
 * Focus ring shown on a clickable row/card while its RowOpenButton has keyboard focus.
 * Kept as literal class strings so Tailwind picks them up.
 */
export const ROW_OPEN_FOCUS_RING =
  'has-[[data-row-open]:focus-visible]:outline-none has-[[data-row-open]:focus-visible]:ring-2 has-[[data-row-open]:focus-visible]:ring-ring';

/**
 * Keyboard/screen-reader entry point of a row or card that opens on click.
 * The container itself stays a plain (non-focusable) element, so it doesn't become an
 * unnamed focus stop that also wraps the row's own buttons; this visually hidden button
 * carries the name and triggers the same action. The container shows the focus ring
 * through ROW_OPEN_FOCUS_RING.
 */
export const RowOpenButton = ({ onOpen, label }: { onOpen: () => void; label?: string }) => {
  const { t } = useTranslation(['common']);

  return (
    <button
      type="button"
      data-row-open
      className="sr-only"
      onClick={(e) => {
        // The container's own onClick would otherwise fire a second time
        e.stopPropagation();
        onOpen();
      }}
    >
      {label ?? t('crud_data_table.actions.view')}
    </button>
  );
};
