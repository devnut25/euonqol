import { DevnutToast } from '@/components/DevnutToast';
import { useApi } from '@/hooks/useApi';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { surveyQuestionnaireTabUrl } from '../_utils/navigation';

// Shortcut for the draft -> public transition, without going through the edit stepper.
// Same dedicated endpoint the stepper calls (backend SurveyService.publish()); on success
// lands on the survey's Questionnaires tab.
export const usePublishSurvey = () => {
  const { t } = useTranslation(['survey', 'common']);
  const { makeRequest, isLoading } = useApi();
  const navigate = useNavigate();

  const publish = async (id: number | string, onPublished?: () => void) => {
    try {
      await makeRequest(`/surveys/${id}/publish`, 'post');
      onPublished?.();
      DevnutToast.success(t('actions.publish_success'));
      navigate(surveyQuestionnaireTabUrl(id));
    } catch (err) {
      DevnutToast.error(
        typeof err === 'string' ? err : t('common:crud_data_table.response_messages.error')
      );
    }
  };

  return { publish, isPublishing: isLoading };
};
