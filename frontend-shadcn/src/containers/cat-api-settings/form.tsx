import DevnutSection from '@/components/DevnutSection';
import { DevnutToast } from '@/components/DevnutToast';
import { Form } from '@/components/form/form';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { FormSubmitter } from '@/components/form/form-submitter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  zFormFieldsCatApiSettings,
  type FormFieldsCatApiSettings,
} from '@/features/schema/cat-api-settings/schema';
import { useApi } from '@/hooks/useApi';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

export interface CatApiSettingsValues {
  apiUrl: string;
  hasApiKey: boolean;
  apiKeyUpdatedAt: string | null;
  apiKeyExpiresAt: string | null;
}

interface CatApiSettingsFormProps {
  // ItemLoader renders once with `initialValues` still undefined, before its fetch
  // effect has resolved (see useGetItem) — always guard against that transient render.
  initialValues: CatApiSettingsValues | undefined;
  onSaved: () => void;
}

export const CatApiSettingsForm = ({ initialValues, onSaved }: CatApiSettingsFormProps) => {
  const { makeRequest } = useApi();
  const [isTesting, setIsTesting] = useState(false);

  const form = useForm<FormFieldsCatApiSettings>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zFormFieldsCatApiSettings()),
    defaultValues: {
      apiUrl: initialValues?.apiUrl ?? '',
      apiKeyExpiresAt: initialValues?.apiKeyExpiresAt ?? '',
      // apiKey intentionally left empty — the backend never returns the stored key, only
      // whether one is set (see hasApiKey below); an empty value on save keeps the current one.
    },
  });

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const values = form.getValues();
      const data = await makeRequest('/settings/cat-api/test', 'post', {
        apiUrl: values.apiUrl,
        apiKey: values.apiKey || undefined,
      });
      DevnutToast.success(`Connection successful (version ${data?.data?.version ?? 'unknown'})`);
    } catch (err: any) {
      DevnutToast.error(typeof err === 'string' ? err : 'Failed to connect to the CAT API');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Form
      {...form}
      url="/settings/cat-api"
      method="put"
      onSuccess={onSaved}
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
      <Card>
        <CardHeader>
          <CardTitle>CAT API Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <DevnutSection.Grid className="gap-6">
            <FormField label="CAT API URL" required>
              <FormFieldController
                name="apiUrl"
                type="text"
                placeholder="https://cat.eortc.org/api"
              />
            </FormField>
            <FormField label="Key expiry date (optional)">
              <FormFieldController name="apiKeyExpiresAt" type="date" />
            </FormField>

            <FormField label="API Key">
              <FormFieldController
                name="apiKey"
                type="password"
                placeholder={
                  initialValues?.hasApiKey ? '••••••••  (leave blank to keep unchanged)' : ''
                }
                endAdornment={
                  <Badge
                    variant={initialValues?.hasApiKey ? 'secondary' : 'destructive'}
                    className="whitespace-nowrap"
                  >
                    {initialValues?.hasApiKey ? 'Configured' : 'Not configured'}
                  </Badge>
                }
              />
            </FormField>
          </DevnutSection.Grid>

          {initialValues?.apiKeyUpdatedAt && (
            <p className="text-sm text-muted-foreground mt-4">
              Key last updated: {new Date(initialValues.apiKeyUpdatedAt).toLocaleString()}
            </p>
          )}

          <div className="border-t pt-4 mt-4">
            <Button
              type="button"
              variant="outline"
              disabled={isTesting}
              onClick={handleTestConnection}
            >
              {isTesting ? 'Testing...' : 'Test connection'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </Form>
  );
};
