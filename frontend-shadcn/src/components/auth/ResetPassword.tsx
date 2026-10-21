import DevnutSection from '@/components/DevnutSection';
import {
  zFormFieldsResetPassword,
  type FormFieldsResetPassword,
} from '@/features/schema/auth/schema';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { zodResolver } from '@hookform/resolvers/zod';
import React from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { DevnutButton } from '../DevnutButton';
import { DevnutToast } from '../DevnutToast';
import { Form } from '../form/form';
import { FormField } from '../form/form-field';
import { FormFieldController } from '../form/form-field-controller';
import AuthTypography from './AuthTypography';

export const ResetPasswordContent: React.FC = () => {
  // Detect mobile device
  const isMobile = useIsMobile();

  const { t } = useTranslation(['auth', 'common']);

  const title = t('auth:resetPassword.title');
  const subtitle = t('auth:resetPassword.subTitle');

  if (isMobile) {
    return (
      <>
        <div>
          <AuthTypography.Title title={title} />
          <AuthTypography.Subtitle subtitle={subtitle} />
        </div>
        <ResetPasswordForm />
      </>
    );
  }

  return (
    <>
      <div className="text-end max-w-[500px]">
        <AuthTypography.Title title={title} />
        <AuthTypography.Subtitle subtitle={subtitle} />
      </div>
      <ResetPasswordForm />
    </>
  );
};

const ResetPasswordForm = () => {
  const { t } = useTranslation(['auth', 'common']);
  const { forgotPassword } = useAuth();

  const [completed, setCompleted] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const form = useForm({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zFormFieldsResetPassword()),
    defaultValues: {
      email: '',
    },
  });

  // Toast sempre; se l'errore riguarda i dati inseriti resta anche inline sul campo
  // (role="alert" + aria-invalid) con focus (WCAG 3.3.1). Errori di connessione/server
  // non sono legati a un campo: solo toast.
  const showError = (message: string, onField: boolean) => {
    DevnutToast.error(t('common:errors.generic'), message);
    if (onField) form.setError('email', { type: 'server', message }, { shouldFocus: true });
  };

  const submitHandler: SubmitHandler<FormFieldsResetPassword> = async ({ email }) => {
    try {
      setIsLoading(true);

      const result = await forgotPassword(email);

      if (result.success) {
        DevnutToast.success(t('auth:successCode.resetLinkSent'));
        setCompleted(true);
      } else {
        showError(result.message || t('auth:errorCode.resetLinkSent'), !result.isServerError);
      }
    } catch (err: any) {
      showError(err.message || t('common:errors.generic'), false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form
      {...form}
      onSubmit={submitHandler}
      className="w-full max-w-[400px] text-center flex flex-col justify-center items-center md:px-[30px]"
    >
      <DevnutSection.Grid className="gap-8 place-items-center">
        <DevnutSection.Grid>
          <FormField label={t('auth:common.email.label')}>
            <FormFieldController
              name="email"
              autoComplete="email"
              type="email"
              className="font-semibold"
              containerProps={{ className: 'flex flex-col items-start gap-2!' }}
            />
          </FormField>
        </DevnutSection.Grid>

        <DevnutSection.Grid className="gap-2 place-items-center">
          <DevnutButton
            type="submit"
            variant="secondary"
            className="w-4/5 md:w-full"
            disabled={isLoading || completed}
          >
            {t('auth:links.sendResetLink')}
          </DevnutButton>
          <div className="text-right">
            <Link to="/login" className="text-primary font-semibold text-sm">
              {t('auth:links.backToLogin')}
            </Link>
          </div>
        </DevnutSection.Grid>
      </DevnutSection.Grid>
    </Form>
  );
};
