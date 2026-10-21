import type { FormProps } from '@/components/FormContainer';
import { EditableForm } from './form/form-editable';
import { ReadOnlyForm } from './form/form-readonly';

export const SurveyForm = (props: FormProps) => {
  if (props.readonly) return <ReadOnlyForm {...props} />;
  return <EditableForm {...props} />;
};
