import 'dayjs/locale/en-gb.js';

import assignment from './assignment.json' with { type: 'json' };
import auth from './auth.json' with { type: 'json' };
import backend from './backend.json' with { type: 'json' };
import closingMessages from './closing-messages.json' with { type: 'json' };
import common from './common.json' with { type: 'json' };
import eligibility from './eligibility.json' with { type: 'json' };
import emailTemplates from './email-templates.json' with { type: 'json' };
import management from './management.json' with { type: 'json' };
import patients from './patients.json' with { type: 'json' };
import presentation from './presentation.json' with { type: 'json' };
import privacyPolicies from './privacy-policies.json' with { type: 'json' };
import questionnaire from './questionnaire.json' with { type: 'json' };
import settings from './settings.json' with { type: 'json' };
import studyInfoSheet from './study-info-sheet.json' with { type: 'json' };
import survey from './survey.json' with { type: 'json' };
import users from './users.json' with { type: 'json' };
import valueEnum from './valueEnum.json' with { type: 'json' };

export default {
  assignment,
  auth,
  backend,
  closingMessages,
  common,
  eligibility,
  emailTemplates,
  management,
  patients,
  questionnaire,
  survey,
  users,
  presentation,
  privacyPolicies,
  settings,
  studyInfoSheet,
  valueEnum,
} as const;
