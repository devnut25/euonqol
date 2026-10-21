import { useId, useMemo, type ReactNode } from 'react';

import { FormFieldContext, type FormFieldSize } from '@/hooks/useForm';
import { cn } from '@/lib/tailwind/utils';

type FormFieldProps = {
  id?: string;
  size?: FormFieldSize;
  children?: ReactNode;
  className?: string;
  label?: string;
  required?: boolean;
};

export const FormField = (props: FormFieldProps) => {
  const _id = useId();
  const id = props.id ?? _id;

  const contextValue = useMemo(
    () => ({
      id,
      labelId: props.label ? `${id}-label` : undefined,
      label: props.label,
      descriptionId: `${id}-description`,
      errorId: `${id}-error`,
      size: props.size,
      required: props.required,
    }),
    [id, props.size, props.label, props.required]
  );

  return (
    <FormFieldContext value={contextValue}>
      <div className={cn('w-full', props.className)}>{props.children}</div>
    </FormFieldContext>
  );
};
