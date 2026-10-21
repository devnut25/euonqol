import React from 'react';

export type FormFieldSize = 'sm' | 'default' | 'lg';

type FormFieldContextValue = {
  id: string;
  labelId?: string;
  label?: string;
  descriptionId: string;
  errorId: string;
  size?: FormFieldSize;
  required?: boolean;
};

export const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

export const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  if (!fieldContext) {
    throw new Error('Missing <FormField /> parent component');
  }
  return fieldContext;
};

export const useFormFieldUnsafe = () => {
  return React.useContext(FormFieldContext);
};
