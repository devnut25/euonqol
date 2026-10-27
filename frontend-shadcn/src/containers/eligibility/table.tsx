import { CreateButton } from '@/components/buttons/create-button';
import { CardListData } from '@/components/data-table/card-list-data';
import { DevnutButton } from '@/components/DevnutButton';
import DevnutTypography from '@/components/DevnutTypography';
import { ExcelImportModal } from '@/containers/survey/ExcelImportModal';
import type { Values } from '@/hooks/useCrudDataTable';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { SurveyStatusEnum } from '@/utils/enum';
import { FileSpreadsheet } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EligibilityDialog } from './dialog';
import { LanguageGroupsBar } from './language-groups-bar';
import type { Language, LanguageGroup, Question } from './utils/types';

interface EligibilityTableProps {
  survey: Values;
}

export const EligibilityTable = ({ survey }: EligibilityTableProps) => {
  const { t } = useTranslation(['eligibility', 'common']);

  const [hasQuestions, setHasQuestions] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [existingLanguages, setExistingLanguages] = useState<Language[]>([]);
  const [existingQuestions, setExistingQuestions] = useState<Question[]>([]);
  const [formState, setFormState] = useState<
    { mode: 'add' } | { mode: 'edit'; group: LanguageGroup } | null
  >(null);
  const [importing, setImporting] = useState(false);
  const isMobile = useIsMobile(768);

  const url = `/surveys/${survey.id}/eligibility-questions`;

  // Search-only column: the list is rendered by LanguageGroupsBar; the backend matches
  // question text and disqualification message on the `search` param.
  const columns: ColumnDef<Values>[] = [
    {
      id: 'question_text',
      header: t('form.question_text.label'),
      enableSorting: false,
      meta: { searchable: true },
    },
  ];

  const reloadRef = useRef<(() => void) | null>(null);
  const reload = () => reloadRef.current?.();

  if (formState) {
    return (
      <EligibilityDialog
        url={url}
        languages={existingLanguages}
        questions={existingQuestions}
        hasQuestions={hasQuestions}
        nextOrderPosition={questionCount}
        editingGroup={formState.mode === 'edit' ? formState.group : undefined}
        onClose={() => setFormState(null)}
        onSuccess={() => {
          setFormState(null);
          reload();
        }}
      />
    );
  }

  return (
    <CardListData
      url={url}
      className="mt-4"
      reloadRef={reloadRef}
      columns={columns}
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
          onEdit={(group) => setFormState({ mode: 'edit', group })}
          onStateChange={({ hasQuestions: hq, languages, questionCount: count, questions }) => {
            setHasQuestions(hq);
            setExistingLanguages(languages);
            setQuestionCount(count);
            setExistingQuestions(questions);
          }}
        />
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <DevnutTypography.Title title={t('title')} />
        <div className="flex items-center gap-2">
          {!isMobile && (
            <DevnutButton
              variant="outline"
              className="gap-2"
              onClick={() => setImporting(true)}
              disabled={survey.status === SurveyStatusEnum.Completed}
            >
              <FileSpreadsheet className="size-4" />
              Import from Excel
            </DevnutButton>
          )}
          <CreateButton
            label={t('actions.add_question')}
            onClick={() => setFormState({ mode: 'add' })}
            disabled={survey.status === SurveyStatusEnum.Completed}
          />
        </div>
      </div>

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
