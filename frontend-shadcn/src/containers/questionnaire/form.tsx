import DevnutSection from '@/components/DevnutSection';
import { FormSubmitter } from '@/components/form/form-submitter';
import type { FormProps } from '@/components/FormContainer';
import { ItemLoader } from '@/components/ItemLoader';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { EmailTemplate } from '@/features/schema/email-template/schema';
import { useCrudDataTable } from '@/hooks/useCrudDataTable';
import { TabsContent } from '@radix-ui/react-tabs';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { AssignmentTable } from '../assignment/table';
import { EmailTemplatesTable } from '../assignment/table-emails';
import { QuestionnaireStepperForm } from './form-stepper';

interface QuestionnaireFormProps extends FormProps {
  parentBreadcrumbs?: { label: string; onClick?: () => void }[];
}

export const QuestionnaireForm = (props: QuestionnaireFormProps) => {
  const { t } = useTranslation(['questionnaire']);
  const { item: itemQuestion, handleBack } = useCrudDataTable();
  const [searchParams] = useSearchParams();
  const { parentBreadcrumbs } = props;

  const questionnaireBreadcrumbs = itemQuestion
    ? [
        ...(parentBreadcrumbs ?? []),
        { label: t('title'), onClick: handleBack },
        { label: itemQuestion.title },
      ]
    : parentBreadcrumbs;

  const surveyId = itemQuestion?.survey.id;
  const surveyStatus = itemQuestion?.survey.status;
  const questionnaireId = itemQuestion?.id;
  const questionnaireStatus = itemQuestion?.status;

  const hasOpenChildTable =
    searchParams.has('email_template_id') || searchParams.has('assignments_id');

  const emailTemplateItemOpen = !!searchParams.get('email_template_id');

  if ((props.readonly || hasOpenChildTable) && itemQuestion) {
    return (
      <ItemLoader<EmailTemplate[]>
        url={`/surveys/${surveyId}/questionnaires/${questionnaireId}/email-templates`}
      >
        {(item, mutate) => {
          if (!item) return null;

          // An email-template item is open (create/edit/view): show it full-width,
          // without the tab sidebar — the sidebar only makes sense when browsing
          // the lists, not inside a record's detail.
          if (emailTemplateItemOpen) {
            return (
              <DevnutSection.Grid>
                <EmailTemplatesTable
                  surveyId={surveyId}
                  questionnaireId={questionnaireId}
                  surveyStatus={surveyStatus}
                  questionnaireStatus={questionnaireStatus}
                  onTemplatesChanged={() => mutate()}
                  parentBreadcrumbs={questionnaireBreadcrumbs}
                />
              </DevnutSection.Grid>
            );
          }

          return (
            <>
              <DevnutSection.Grid>
                <div className="w-full mx-auto">
                  <Tabs
                    defaultValue="email-templates"
                    className="flex flex-col sm:flex-row gap-6"
                    orientation="vertical"
                  >
                    {/* Sidebar Tabs */}
                    <TabsList className="flex sm:flex-col gap-2 overflow-x-auto sm:overflow-visible no-visible-scrollbar w-full sm:w-48 sm:shrink-0 sm:border-r border-border pb-2 sm:pb-0 sm:pr-4 bg-transparent p-0 rounded-none justify-start h-full">
                      <TabsTrigger value="email-templates" className="flex-1 sm:flex-none sm:w-full">
                        Email templates
                      </TabsTrigger>
                      <TabsTrigger value="assignments" className="flex-1 sm:flex-none sm:w-full">
                        Assignments
                      </TabsTrigger>
                    </TabsList>

                    {/* Content Area */}
                    <div className="flex-1 min-w-0">
                      <TabsContent value="email-templates" className="outline-none h-full">
                        <EmailTemplatesTable
                          surveyId={surveyId}
                          questionnaireId={questionnaireId}
                          surveyStatus={surveyStatus}
                          questionnaireStatus={questionnaireStatus}
                          onTemplatesChanged={() => mutate()}
                          parentBreadcrumbs={questionnaireBreadcrumbs}
                        />
                      </TabsContent>
                      <TabsContent value="assignments" className="outline-none h-full">
                        <AssignmentTable
                          surveyId={surveyId}
                          questionnaireId={questionnaireId}
                          emailTemplates={item}
                          surveyStatus={surveyStatus}
                          questionnaireStatus={questionnaireStatus}
                        />
                      </TabsContent>
                    </div>
                  </Tabs>
                </div>
              </DevnutSection.Grid>
              <FormSubmitter type="default" showInReadOnly={true} onBack={handleBack} />
            </>
          );
        }}
      </ItemLoader>
    );
  }

  return (
    <QuestionnaireStepperForm
      {...props}
      surveyStatus={surveyStatus ?? (props as any).surveyStatus}
    />
  );
};
