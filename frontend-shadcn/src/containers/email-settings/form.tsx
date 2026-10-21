import DevnutSection from '@/components/DevnutSection';
import { DevnutToast } from '@/components/DevnutToast';
import { Form } from '@/components/form/form';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { FormSubmitter } from '@/components/form/form-submitter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  zFormFieldsEmailSettings,
  type FormFieldsEmailSettings,
} from '@/features/schema/email-settings/schema';
import { useApi } from '@/hooks/useApi';
import { useValueEnum } from '@/hooks/useValueEnum';
import { cn } from '@/lib/tailwind/utils';
import { EmailProviderEnum } from '@/utils/enum';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Send } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

// `secure` non è un enum di dominio: è una stringa 'true'/'false' letterale usata
// direttamente dallo schema e dal test-email (`values.secure === 'true'`) — passarla
// per enumToOptions/ValueEnumProvider la convertirebbe in booleano vero, rompendo
// entrambi. Resta un array locale per questo motivo.
const SECURE_OPTIONS = [
  { value: 'false', label: 'No' },
  { value: 'true', label: 'Yes (TLS)' },
];

export interface EmailSettingsValues {
  provider: string;
  from: string;
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  hasPassword: boolean;
  hasResendApiKey: boolean;
}

interface EmailSettingsFormProps {
  // ItemLoader renders once with `initialValues` still undefined, before its fetch
  // effect has resolved (see useGetItem) — always guard against that transient render.
  initialValues: EmailSettingsValues | undefined;
  onSaved: () => void;
}

// Campo extra non presente nello zod schema: usato solo per il test-email, mai inviato
// nella PUT /settings/email (z.object() senza .passthrough() scarta le chiavi non dichiarate).
type EmailSettingsFormValues = FormFieldsEmailSettings & { testEmailTo?: string };

export const EmailSettingsForm = ({ initialValues, onSaved }: EmailSettingsFormProps) => {
  const { makeRequest } = useApi();
  const { valueOptions } = useValueEnum();

  const [isTesting, setIsTesting] = useState(false);

  const form = useForm<EmailSettingsFormValues>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    // Resolver dinamico (non `zodResolver(zFormFieldsEmailSettings())` fisso): `initialValues`
    // arriva in un secondo momento via ItemLoader, quindi `hasResendApiKey` deve essere letto
    // fresco ad ogni validazione, non congelato al mount iniziale.
    resolver: (values, context, options) =>
      zodResolver(zFormFieldsEmailSettings({ hasResendApiKey: initialValues?.hasResendApiKey }))(
        values,
        context,
        options
      ),
    defaultValues: {
      provider: initialValues?.provider ?? EmailProviderEnum.Smtp,
      from: initialValues?.from ?? '',
      host: initialValues?.host ?? '',
      port: String(initialValues?.port ?? ''),
      secure: initialValues?.secure ? 'true' : 'false',
      user: initialValues?.user ?? '',
      // password/resendApiKey intentionally left empty: the backend never returns the
      // stored secret, only whether one is set (see the badges below) — an empty value
      // on save means "keep the current one".
      testEmailTo: '',
    },
  });

  const provider = form.watch('provider');
  const isResend = provider === EmailProviderEnum.Resend;

  const handleTestEmail = async () => {
    const values = form.getValues();
    const testTo = values.testEmailTo;
    if (!testTo) {
      DevnutToast.error('Enter the address to send the test email to');
      return;
    }
    setIsTesting(true);
    try {
      await makeRequest('/settings/email/test', 'post', {
        to: testTo,
        provider: values.provider,
        from: values.from,
        host: values.host,
        port: values.port,
        secure: values.secure === 'true',
        // Most SMTP providers (Gmail included) authenticate with the mailbox address —
        // default to "from" when "user" is left blank, since they're the same address
        // in the overwhelming majority of setups.
        user: values.user || values.from,
        password: values.password || undefined,
        resendApiKey: values.resendApiKey || undefined,
      });
      DevnutToast.success(`Test email sent to ${testTo}`);
    } catch (err: any) {
      DevnutToast.error(typeof err === 'string' ? err : 'Failed to send the test email');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Form
      {...form}
      method="put"
      url="/settings/email"
      // api={{
      //   url: '/settings/email',
      //   method: 'put',
      //   // Same "user defaults to from" fallback as the test-email action above.
      //   transformRequest: (data: any) => ({ ...data, user: data.user || data.from }),
      // }}
      onSuccess={onSaved}
      // className="w-full flex flex-col gap-6"
      submitter={{
        searchConfig: { submitText: 'Save' },
        resetButtonProps: { style: { display: 'none' } },
        render: (helpers, defaultDom) => (
          <FormSubmitter type="default" loading={helpers?.isSubmitting}>
            {defaultDom}
          </FormSubmitter>
        ),
      }}
    >
      <DevnutSection.Grid className="gap-2">
        <DevnutSection.Grid className="gap-6 lg:grid-cols-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>General</CardTitle>
            </CardHeader>
            <CardContent>
              <DevnutSection.Grid className="gap-6">
                <FormField label="Provider" required>
                  <FormFieldController
                    type="select"
                    name="provider"
                    options={valueOptions.emailProvider}
                  />
                </FormField>

                <FormField label="From address" required>
                  <FormFieldController name="from" type="text" placeholder="noreply@euonqol.com" />
                </FormField>

                <FormField label="Resend API Key">
                  <div className="relative">
                    <FormFieldController
                      name="resendApiKey"
                      type="password"
                      disabled={!isResend}
                      className={initialValues?.hasResendApiKey ? 'pr-16' : undefined}
                      placeholder={
                        initialValues?.hasResendApiKey
                          ? '••••••••  (leave blank to keep unchanged)'
                          : 're_...'
                      }
                    />
                    {initialValues?.hasResendApiKey && (
                      <CheckCircle2
                        className="absolute right-9 top-1/2 -translate-y-1/2 size-4 text-green-600 pointer-events-none"
                        role="img"
                        aria-label="Resend API Key configured"
                      />
                    )}
                  </div>
                </FormField>
              </DevnutSection.Grid>
            </CardContent>
          </Card>

          <Card className={cn('transition-opacity', isResend && 'opacity-60')}>
            <CardHeader>
              <CardTitle>SMTP</CardTitle>
            </CardHeader>
            <CardContent>
              <DevnutSection.Grid className="gap-6 sm:grid-cols-2">
                <FormField label="SMTP Host">
                  <FormFieldController
                    name="host"
                    type="text"
                    placeholder="smtp.gmail.com"
                    disabled={isResend}
                  />
                </FormField>
                <FormField label="SMTP Port">
                  <FormFieldController
                    name="port"
                    type="text"
                    placeholder="587"
                    disabled={isResend}
                  />
                </FormField>
                <FormField label="TLS">
                  <FormFieldController
                    type="select"
                    name="secure"
                    options={SECURE_OPTIONS}
                    disabled={isResend}
                  />
                </FormField>
                <FormField label="SMTP User">
                  <FormFieldController
                    name="user"
                    type="text"
                    placeholder="Defaults to From address"
                    disabled={isResend}
                  />
                </FormField>
                <FormField label="SMTP Password" className="sm:col-span-2">
                  <div className="relative">
                    <FormFieldController
                      name="password"
                      type="password"
                      className={initialValues?.hasPassword ? 'pr-16' : undefined}
                      placeholder={
                        initialValues?.hasPassword
                          ? '••••••••  (leave blank to keep unchanged)'
                          : ''
                      }
                      disabled={isResend}
                    />
                    {initialValues?.hasPassword && (
                      <CheckCircle2
                        className="absolute right-9 top-1/2 -translate-y-1/2 size-4 text-green-600 pointer-events-none"
                        role="img"
                        aria-label="SMTP Password configured"
                      />
                    )}
                  </div>
                </FormField>
              </DevnutSection.Grid>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Send a test email</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField label="Recipient">
                <FormFieldController
                  name="testEmailTo"
                  type="email"
                  placeholder="recipient@example.com"
                  actions={
                    <Button
                      type="button"
                      variant="default"
                      className="self-start"
                      disabled={isTesting}
                      onClick={handleTestEmail}
                    >
                      <Send className={cn('w-4 h-4 mr-2', isTesting && 'animate-pulse')} />
                      {isTesting ? 'Sending...' : 'Send test'}
                    </Button>
                  }
                />
              </FormField>
            </CardContent>
          </Card>
        </DevnutSection.Grid>
        {!isResend && (
          <p className="text-sm text-muted-foreground w-full">
            Testing with Gmail: host <code>smtp.gmail.com</code>, port <code>587</code> with TLS set
            to "No" (STARTTLS) or port <code>465</code> with TLS set to "Yes". Gmail accounts with
            2-factor authentication require an{' '}
            <a
              href="https://support.google.com/accounts/answer/185833"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              App Password
            </a>{' '}
            instead of the regular account password.
          </p>
        )}
      </DevnutSection.Grid>
    </Form>
  );
};
