import { CreateButton } from '@/components/buttons/create-button';
import { CardListData } from '@/components/data-table/card-list-data';
import { DevnutButton } from '@/components/DevnutButton';
import DevnutTypography from '@/components/DevnutTypography';
import { ExcelImportModal } from '@/containers/survey/ExcelImportModal';
import type { Values } from '@/hooks/useCrudDataTable';
import { SurveyStatusEnum } from '@/utils/enum';
import { FileSpreadsheet } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EligibilityDialog } from './dialog';
import { LanguageGroupsBar } from './language-groups-bar';
import type { Language, Question } from './utils/types';

interface EligibilityTableProps {
  survey: Values;
}

export const EligibilityTable = ({ survey }: EligibilityTableProps) => {
  const { t } = useTranslation(['eligibility']);

  const [hasQuestions, setHasQuestions] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [existingLanguages, setExistingLanguages] = useState<Language[]>([]);
  const [existingQuestions, setExistingQuestions] = useState<Question[]>([]);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const url = `/surveys/${survey.id}/eligibility-questions`;

  const reloadRef = useRef<(() => void) | null>(null);
  const reload = () => reloadRef.current?.();

  return (
    <CardListData
      url={url}
      className="mt-4"
      reloadRef={reloadRef}
      onDataChange={(items) => {
        if (items.length === 0) {
          setHasQuestions(false);
          setQuestionCount(0);
          setExistingLanguages([]);
          setExistingQuestions([]);
        }
      }}
      renderList={(items, reload) => (
        <LanguageGroupsBar
          surveyId={survey.id}
          items={items as Question[]}
          reload={reload}
          onStateChange={({ hasQuestions: hq, languages, questionCount: count, questions }) => {
            setHasQuestions(hq);
            setExistingLanguages(languages);
            setQuestionCount(count);
            setExistingQuestions(questions);
          }}
        />
      )}
    >
      <div className="flex items-center justify-between">
        <DevnutTypography.Title title={t('title')} />
        <div className="flex items-center gap-2">
          <DevnutButton
            variant="outline"
            className="gap-2"
            onClick={() => setImporting(true)}
            disabled={survey.status === SurveyStatusEnum.Completed}
          >
            <FileSpreadsheet className="size-4" />
            Import from Excel
          </DevnutButton>
          <CreateButton
            label={t('actions.add_question')}
            onClick={() => setCreating(true)}
            disabled={survey.status === SurveyStatusEnum.Completed}
          />
        </div>
      </div>

      {creating && (
        <EligibilityDialog
          url={url}
          languages={existingLanguages}
          questions={existingQuestions}
          hasQuestions={hasQuestions}
          nextOrderPosition={questionCount}
          onClose={() => setCreating(false)}
          onSuccess={() => {
            reload();
            setCreating(false);
          }}
        />
      )}

      <ExcelImportModal
        open={importing}
        onClose={() => setImporting(false)}
        surveyId={String(survey.id)}
        type="eligibility-questions"
        onSuccess={() => {
          setImporting(false);
          reload();
        }}
      />
    </CardListData>
  );
};
