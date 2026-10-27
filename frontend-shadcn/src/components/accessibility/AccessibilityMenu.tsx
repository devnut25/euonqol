import { useAccessibilityPreferences } from '@/hooks/useAccessibilityPreferences';
import { usePublicA11yLabels } from '@/hooks/usePublicA11yLabels';
import { focusRing } from '@/lib/a11y';
import { TEXT_SCALES, type A11yToggle } from '@/lib/a11y-preferences';
import type { PublicUIStrings } from '@/pages/public/labels';
import clsx from 'clsx';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons/lib';
import {
  MdAccessibilityNew,
  MdCheck,
  MdContrast,
  MdFilterBAndW,
  MdLink,
  MdMotionPhotosOff,
  MdRestartAlt,
  MdTextDecrease,
  MdTextIncrease,
} from 'react-icons/md';
import { DevnutButton } from '../DevnutButton';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

// `publicKey`: same text from the patient's language labels (Settings › Languages),
// used instead of the admin i18n on the public questionnaire page.
const TOGGLES = [
  { key: 'contrast', labelKey: 'accessibility.contrast', publicKey: 'a11yContrast', icon: MdContrast },
  { key: 'grayscale', labelKey: 'accessibility.grayscale', publicKey: 'a11yGrayscale', icon: MdFilterBAndW },
  {
    key: 'highlightLinks',
    labelKey: 'accessibility.highlight_links',
    publicKey: 'a11yHighlightLinks',
    icon: MdLink,
  },
  {
    key: 'stopAnimations',
    labelKey: 'accessibility.stop_animations',
    publicKey: 'a11yStopAnimations',
    icon: MdMotionPhotosOff,
  },
] as const satisfies readonly {
  key: A11yToggle;
  labelKey: string;
  publicKey: keyof PublicUIStrings;
  icon: IconType;
}[];

const KEYBOARD_KEYS = [
  { key: 'tab', publicKey: 'a11yKeyTab' },
  { key: 'shift_tab', publicKey: 'a11yKeyShiftTab' },
  { key: 'enter', publicKey: 'a11yKeyEnter' },
  { key: 'escape', publicKey: 'a11yKeyEscape' },
] as const satisfies readonly { key: string; publicKey: keyof PublicUIStrings }[];

/**
 * Pannello accessibilità: ingrandimento testo, alto contrasto, scala di grigi,
 * evidenziazione link e blocco animazioni. Le preferenze persistono tra le sessioni.
 * Floating action button fisso in basso a destra, montato una sola volta in App.tsx.
 */
export const AccessibilityMenu = () => {
  const { t } = useTranslation(['common']);
  const { prefs, setTextScale, toggle, reset } = useAccessibilityPreferences();
  const publicLabels = usePublicA11yLabels();
  // Patient's language on /q/:link, admin i18n everywhere else.
  const label = (publicKey: keyof PublicUIStrings, adminText: string) =>
    publicLabels?.[publicKey] || adminText;
  const titleId = useId();
  const textSizeId = useId();

  const scaleIndex = TEXT_SCALES.indexOf(prefs.textScale);
  const canDecrease = scaleIndex > 0;
  const canIncrease = scaleIndex < TEXT_SCALES.length - 1;

  return (
    // Landmark proprio: il pulsante sta fuori da header/main dei layout (axe `region`).
    // Con la barra Save fissa (FormSubmitter) presente si alza sopra di essa.
    <aside
      aria-label={label('a11yMenu', t('accessibility.title'))}
      className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6 [:root:has([data-fixed-form-submitter])_&]:bottom-20 sm:[:root:has([data-fixed-form-submitter])_&]:bottom-22"
    >
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <DevnutButton
                variant="link"
                aria-label={label('a11yMenu', t('accessibility.open_menu'))}
                className="p-0 size-14 rounded-full inline-flex items-center justify-center bg-primary text-white shadow-[0px_4px_8px_0px_rgba(0,0,0,0.3)] hover:bg-[#554fa3] hover:text-white"
              >
                <MdAccessibilityNew aria-hidden="true" focusable="false" className="size-8" />
              </DevnutButton>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="left">
            {label('a11yMenu', t('accessibility.open_menu'))}
          </TooltipContent>
        </Tooltip>

        <PopoverContent
          side="top"
          align="end"
          aria-labelledby={titleId}
          // Altezza limitata allo spazio disponibile: con testo al 200% il pannello scorre
          // invece di uscire dallo schermo (WCAG 1.4.10)
          className="w-80 max-w-[calc(100vw-2rem)] max-h-(--radix-popover-content-available-height) overflow-y-auto flex flex-col gap-4"
        >
          <h2 id={titleId} className="text-base font-semibold">
            {label('a11yMenu', t('accessibility.title'))}
          </h2>

          <section aria-labelledby={textSizeId} className="flex flex-col gap-2">
            <h3 id={textSizeId} className="text-sm font-medium">
              {label('a11yTextSize', t('accessibility.text_size'))}
            </h3>
            <div className="flex items-center justify-between gap-2">
              <DevnutButton
                variant="outline"
                size="icon"
                aria-label={label('a11yDecreaseText', t('accessibility.decrease'))}
                disabled={!canDecrease}
                onClick={() => setTextScale(TEXT_SCALES[scaleIndex - 1])}
              >
                <MdTextDecrease aria-hidden="true" focusable="false" className="size-5" />
              </DevnutButton>
              <span aria-live="polite" className="text-sm font-medium tabular-nums">
                {t('accessibility.text_size_value', { value: prefs.textScale })}
              </span>
              <DevnutButton
                variant="outline"
                size="icon"
                aria-label={label('a11yIncreaseText', t('accessibility.increase'))}
                disabled={!canIncrease}
                onClick={() => setTextScale(TEXT_SCALES[scaleIndex + 1])}
              >
                <MdTextIncrease aria-hidden="true" focusable="false" className="size-5" />
              </DevnutButton>
            </div>
          </section>

          <ul className="flex flex-col gap-2">
            {TOGGLES.map(({ key, labelKey, publicKey, icon: Icon }) => {
              const active = prefs[key];
              return (
                <li key={key}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(key)}
                    className={clsx(
                      focusRing,
                      'w-full min-h-11 flex items-center gap-3 rounded-md border px-3 py-2 text-left text-sm font-medium cursor-pointer',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-accent'
                    )}
                  >
                    <Icon aria-hidden="true" focusable="false" className="size-5 shrink-0" />
                    <span className="flex-1">{label(publicKey, t(labelKey))}</span>
                    {active && (
                      <MdCheck aria-hidden="true" focusable="false" className="size-5 shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <DevnutButton variant="outline" onClick={reset}>
            <MdRestartAlt aria-hidden="true" focusable="false" className="size-5" />
            {label('a11yReset', t('accessibility.reset_all'))}
          </DevnutButton>

          <section className="flex flex-col gap-2 border-t pt-3 text-sm">
            <h3 className="font-medium">
              {label('a11yKeyboardTitle', t('accessibility.keyboard.title'))}
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {KEYBOARD_KEYS.map(({ key, publicKey }) => (
                <div key={key} className="contents">
                  <dt>
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {t(`accessibility.keyboard.keys.${key}`)}
                    </kbd>
                  </dt>
                  <dd className="text-muted-foreground">
                    {label(publicKey, t(`accessibility.keyboard.actions.${key}`))}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground">
              {label('a11yScreenReaderNote', t('accessibility.screen_reader_note'))}
            </p>
          </section>
        </PopoverContent>
      </Popover>
    </aside>
  );
};
