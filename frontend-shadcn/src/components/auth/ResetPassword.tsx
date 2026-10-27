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
import { Link, useNavigate } from 'react-router-dom';
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

  // Dopo l'invio della mail il form viene sostituito da una schermata di conferma
  const [completed, setCompleted] = React.useState(false);

  const title = completed ? t('auth:resetPasswordSent.title') : t('auth:resetPassword.title');
  const subtitle = completed
    ? t('auth:resetPasswordSent.subTitle')
    : t('auth:resetPassword.subTitle');

  const content = completed ? (
    <ResetPasswordSent />
  ) : (
    <ResetPasswordForm onCompleted={() => setCompleted(true)} />
  );

  if (isMobile) {
    return (
      <>
        <div>
          <AuthTypography.Title title={title} />
          <AuthTypography.Subtitle subtitle={subtitle} />
        </div>
        {content}
      </>
    );
  }

  return (
    <>
      <div className="text-end max-w-[500px]">
        <AuthTypography.Title title={title} />
        <AuthTypography.Subtitle subtitle={subtitle} />
      </div>
      {content}
    </>
  );
};

const ResetPasswordSent = () => {
  const { t } = useTranslation(['auth']);
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-[400px] text-center flex flex-col justify-center items-center md:px-[30px]">
      <DevnutSection.Grid className="gap-8 place-items-center">
        {/* Annuncia la conferma agli screen reader al cambio di schermata */}
        <p role="status" className="text-sm font-semibold">
          {t('auth:resetPasswordSent.description')}
        </p>
        <DevnutButton
          type="button"
          variant="secondary"
          className="w-4/5 md:w-full"
          onClick={() => navigate('/login')}
        >
          {t('auth:links.backToLogin')}
        </DevnutButton>
      </DevnutSection.Grid>
    </div>
  );
};

const ResetPasswordForm = ({ onCompleted }: { onCompleted: () => void }) => {
  const { t } = useTranslation(['auth', 'common']);
  const { forgotPassword } = useAuth();

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
        onCompleted();
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
            disabled={isLoading}
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
