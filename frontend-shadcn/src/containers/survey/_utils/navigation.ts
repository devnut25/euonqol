// Deep link to the Questionnaires tab of a survey's detail (same pattern as HomepageContent).
export const surveyQuestionnaireTabUrl = (id: number | string) =>
  `/survey?surveys_id=${id}&surveys_tab=questionnaire`;
