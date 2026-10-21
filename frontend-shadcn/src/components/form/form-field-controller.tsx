import { useFormFieldUnsafe } from '@/hooks/useForm';
import {
  FormFieldControllerContext,
  type FormFieldControllerContextValue,
} from '@/hooks/useFormField';
import { useFormReadOnly } from '@/hooks/useFormReadOnly';
import { useMemo } from 'react';
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  useFormContext,
} from 'react-hook-form';
import { FieldApiSelect, type FieldApiSelectProps } from './field-api-select';
import { FieldDate, type FieldDateProps } from './field-date';
import { FieldFile, type FieldFileProps } from './field-file';
import { FieldList, type FieldListProps } from './field-list';
import { FieldNumber, type FieldNumberProps } from './field-number';
import { FieldOtp, type FieldOtpProps } from './field-otp';
import { FieldPassword, type FieldPasswordProps } from './field-passord';
import { FieldRichTextEditor, type FieldRichTextEditorProps } from './field-rich-text-editor';
import { FieldSelect, type FieldSelectProps } from './field-select';
import { FieldText, type FieldTextProps } from './field-text';
import { FieldTextarea, type FieldTextareaProps } from './field-textarea';

type FormFieldSize = 'sm' | 'default' | 'lg';

type FieldCustomProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = {
  type: 'custom';
} & Pick<
  ControllerProps<TFieldValues, TName, TTransformedValues>,
  'defaultValue' | 'name' | 'shouldUnregister' | 'disabled' | 'render' | 'control'
>;

type CustomProps = object;
export type FieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
  TProps extends CustomProps = CustomProps,
> = Omit<FieldCustomProps<TFieldValues, TName, TTransformedValues>, 'render' | 'type'> & {
  size?: FormFieldSize;
  displayError?: boolean;
  readonly?: boolean;
} & Omit<TProps, 'value' | 'ref' | 'id' | 'aria-invalid' | 'aria-describedby' | 'size'>;

export type FormFieldControllerProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> =
  | FieldCustomProps<TFieldValues, TName, TTransformedValues>
  // -- ADD NEW FIELD PROPS TYPE HERE --
  | FieldNumberProps<TFieldValues, TName, TTransformedValues>
  | FieldSelectProps<TFieldValues, TName, TTransformedValues>
  | FieldDateProps<TFieldValues, TName, TTransformedValues>
  | FieldTextProps<TFieldValues, TName, TTransformedValues>
  | FieldTextareaProps<TFieldValues, TName, TTransformedValues>
  | FieldPasswordProps<TFieldValues, TName, TTransformedValues>
  | FieldOtpProps<TFieldValues, TName, TTransformedValues>
  | FieldFileProps<TFieldValues, TName, TTransformedValues>
  | FieldApiSelectProps<TFieldValues, TName, TTransformedValues>
  | FieldListProps<TFieldValues, TName, TTransformedValues>
  | FieldRichTextEditorProps<TFieldValues, TName, TTransformedValues>;
// | FieldRadioGroupProps<TFieldValues, TName, TTransformedValues>
// | FieldCheckboxProps<TFieldValues, TName, TTransformedValues>
// | FieldCheckboxGroupProps<TFieldValues, TName, TTransformedValues>;

export const FormFieldController = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>(
  _props: FormFieldControllerProps<TFieldValues, TName, TTransformedValues>
) => {
  const { size } = useFormFieldUnsafe() ?? {};
  const { control: contextControl } = useFormContext<TFieldValues, any, TTransformedValues>();

  const props = {
    ..._props,
    control: _props.control ?? contextControl,
    size: 'size' in _props ? (_props.size ?? size) : size,
  };

  // valore dal form-level context
  const formReadOnly = useFormReadOnly();

  // Se la prop readonly è definita sul singolo field la usiamo, altrimenti usiamo il valore del form
  const finalReadOnly =
    'readonly' in props && props.readonly !== undefined
      ? Boolean(props.readonly)
      : Boolean(formReadOnly ?? false);

  const getField = () => {
    switch (props.type) {
      case 'custom':
        return <Controller {...props} />;

      case 'text':
      case 'email':
      case 'tel':
        return <FieldText {...props} />;

      case 'textarea':
        return <FieldTextarea {...props} />;

      case 'password':
        return <FieldPassword {...props} />;

      case 'otp':
        return <FieldOtp {...props} />;

      case 'date':
      case 'datetime-local':
        return <FieldDate {...(props as any)} />;

      case 'select':
        return <FieldSelect {...props} />;

      case 'number':
        return <FieldNumber {...props} />;

      case 'file':
        return <FieldFile {...props} />;

      case 'api-select':
        return <FieldApiSelect {...props} />;

      case 'list':
        return <FieldList {...(props as any)} />;

      case 'rich-text-editor':
        return <FieldRichTextEditor {...(props as any)} />;

      // case "radio-group":
      //   return <FieldRadioGroup {...props} />;

      // case "checkbox":
      //   return <FieldCheckbox {...props} />;

      // case "checkbox-group":
      //   return <FieldCheckboxGroup {...props} />;
      // -- ADD NEW FIELD COMPONENT HERE --
    }
  };

  const displayError = 'displayError' in props ? props.displayError : undefined;

  const contextValue: FormFieldControllerContextValue<TFieldValues, TName, TTransformedValues> =
    useMemo(
      () => ({
        name: props.name,
        control: props.control,
        displayError: displayError,
      }),
      [props.name, props.control, displayError]
    );

  return (
    <FormFieldControllerContext value={contextValue as ExplicitAny}>
      {/* Qui aderiamo alla guida: usiamo fieldset disabled */}
      <fieldset disabled={finalReadOnly} className="m-0 p-0 border-0">
        {getField()}
      </fieldset>
    </FormFieldControllerContext>
  );
};
