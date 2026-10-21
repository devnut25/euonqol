import { useCrudDataTable } from '@/hooks/useCrudDataTable';
import { cn } from '@/lib/tailwind/utils';
import type { FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { DevnutButton } from '../DevnutButton';
import type { SubmitterRenderHelpers } from './form';
import { FormSubmitter } from './form-submitter';

interface FormSubmitterStepperProps {
  helpers: SubmitterRenderHelpers<FieldValues>;
  back: () => void;
  next: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export const FormSubmitterStepper = ({
  helpers,
  back,
  next,
  isFirst,
  isLast,
}: FormSubmitterStepperProps) => {
  const { t } = useTranslation(['common']);
  const { handleBack } = useCrudDataTable();

  return (
    <FormSubmitter type="default" onBack={!isFirst ? back : handleBack}>
      <div className={cn('flex items-center w-full', isFirst ? 'justify-end' : 'justify-between')}>
        <div className="flex items-center gap-2">
          {isLast ? (
            <DevnutButton
              type="button"
              variant="secondary"
              onClick={helpers.submit}
              disabled={helpers.isSubmitting}
            >
              {helpers.isSubmitting
                ? t('crud_data_table.form.saving')
                : t('crud_data_table.actions.save')}
            </DevnutButton>
          ) : (
            <DevnutButton type="button" variant="secondary" onClick={next}>
              {t('crud_data_table.actions.next')}
            </DevnutButton>
          )}
        </div>
      </div>
    </FormSubmitter>
  );
};
