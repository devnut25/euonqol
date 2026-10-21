import DevnutSection from '@/components/DevnutSection';
import { zFormFieldsLogin, type FormFieldsLogin } from '@/features/schema/auth/schema';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { DevnutButton } from '../DevnutButton';
import { DevnutToast } from '../DevnutToast';
import { Form } from '../form/form';
import { FormField } from '../form/form-field';
import { FormFieldController } from '../form/form-field-controller';
import AuthTypography from './AuthTypography';

export const LoginContent: React.FC = () => {
  const { t } = useTranslation(['auth']);

  // Detect mobile device
  const isMobile = useIsMobile();

  const title = t('auth:pageLogin.title');
  const subtitle = t('auth:pageLogin.subTitle');

  if (isMobile) {
    return (
      <>
        <div>
          <AuthTypography.Title title={title} />
          <AuthTypography.Subtitle subtitle={subtitle} />
        </div>
        <LoginForm />
      </>
    );
  }

  return (
    <>
      <div className="text-end">
        <AuthTypography.Title title={title} />
        <AuthTypography.Subtitle subtitle={subtitle} />
      </div>
      <LoginForm />
    </>
  );
};

const LoginForm = () => {
  const { login, isAuthenticated } = useAuth();
  const { t } = useTranslation(['auth', 'common']);

  const [loading, setLoading] = React.useState(false);

  const navigate = useNavigate();

  // Se l'utente è già autenticato, reindirizza
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const form = useForm({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zFormFieldsLogin()),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // Toast sempre; se l'errore riguarda i dati inseriti resta anche inline sul campo
  // (role="alert" + aria-invalid) con focus (WCAG 3.3.1). Errori di connessione/server
  // non sono legati a un campo: solo toast.
  const showError = (message: string, onField: boolean) => {
    DevnutToast.error(t('common:errors.generic'), message);
    if (onField) form.setError('password', { type: 'server', message }, { shouldFocus: true });
  };

  const submitHandler: SubmitHandler<FormFieldsLogin> = async ({ email, password }) => {
    setLoading(true);

    try {
      const result = await login(email, password);

      if (result.requiresPasswordUpdate) {
        navigate('/first-access', { state: { email } });
      } else if (result.requiresOTP) {
        navigate('/two-factor');
      } else if (result.error) {
        showError(result.error, !result.isServerError);
      }
    } catch (err: any) {
      showError(err.message || t('auth:errorCode.failedLogin'), false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form
      {...form}
      onSubmit={submitHandler}
      className={'w-full max-w-[400px] text-center md:px-[30px]'}
    >
      <DevnutSection.Grid className="gap-8 place-items-center">
        <DevnutSection.Grid>
          <FormField label={t('auth:common.email.label')}>
            <FormFieldController
              name="email"
              autoComplete="username"
              type="email"
              className="font-semibold"
              containerProps={{ className: 'flex flex-col items-start gap-2!' }}
            />
          </FormField>

          <FormField label={t('auth:common.password.label')}>
            <FormFieldController
              name="password"
              autoComplete="current-password"
              type="password"
              className="font-semibold"
              containerProps={{ className: 'flex flex-col items-start gap-2!' }}
            />
          </FormField>

          <div className="text-right">
            <Link to="/reset-password" className="text-primary font-semibold text-sm">
              {t('auth:links.forgotPassword')}
            </Link>
          </div>
        </DevnutSection.Grid>

        <DevnutButton
          type="submit"
          variant="secondary"
          className="font-semibold w-4/5 md:w-full"
          disabled={loading}
        >
          {t('common:buttons.values.enter')}
        </DevnutButton>
      </DevnutSection.Grid>
    </Form>
  );
};
