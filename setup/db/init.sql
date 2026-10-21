-- EUonQol - init.sql (updated v9 - aligned with schema.prisma, adds survey_study_info_sheets)
-- Key decisions:
-- 1) Answers are managed via answer_profiles + answer_options (+ i18n). No spreadsheet-style columns.
--    Socio-demo questions use question-specific answers in socio_demo_answers table.
--    Feedback questions use question-specific answers in feedback_answers table.
-- 2) Questions are unified (static + CAT + socio-demo) in euonqol.questions; language-specific texts live in
--    static_questions / cat_questions / socio_demo_questions / feedback_question_translations.
-- 3) Languages are stored at QUESTION-CONTENT level. Modules/Questionnaires/Surveys do NOT store languages;
--    supported languages are derived from the questions available in the Kit Version.
-- 4) A Kit Version is general and contains static, CAT, and socio-demo questions; imported files tracked in kit_version_files.
-- 5) Questions can be associated to one or more patient groups via patient_group_questions.
-- 6) Patients are linked directly to surveys_questionnaires (not to patient_groups).
-- 7) CTT norms versions are managed independently and linked to surveys and questionnaires.
-- 8) Survey access flow: eligibility questions → privacy policy acceptance → presentations → responses.

-- NOTE:
-- - If you run via psql, you can keep \c. If you use Prisma migrations, remove it.
\c euonqol;

-- Lo schema in cui vivono le tabelle di Keycloak. Le foreign key qui sotto lo
-- attraversano, quindi il nome va passato a psql:
--   psql ... -v keycloak_schema=keycloak -f init.sql
-- Senza la variabile psql lascerebbe il letterale `:"keycloak_schema"` e la prima
-- CREATE TABLE fallirebbe con un errore di sintassi, quindi c'e' un default.
\if :{?keycloak_schema}
\else
\set keycloak_schema public
\endif

CREATE SCHEMA IF NOT EXISTS euonqol;
CREATE SCHEMA IF NOT EXISTS :"keycloak_schema";

-- ---------------------------------------------------------------------------
-- 1) Reference tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS euonqol.eu_countries (
  id SERIAL PRIMARY KEY,
  language VARCHAR(45) NOT NULL,
  original_lang VARCHAR(45) NOT NULL,
  alphabet VARCHAR(45) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2) Auth / Users (application DB; Keycloak handled separately)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS euonqol.users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  user_type VARCHAR(50) CHECK (user_type IN ('admin', 'manager')) NOT NULL,
  first_access BOOLEAN DEFAULT TRUE,
  institute_name VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS euonqol.password_reset_tokens (
  id SERIAL PRIMARY KEY,
  keycloak_user_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pwd_keycloak_user_id ON euonqol.password_reset_tokens(keycloak_user_id);
CREATE INDEX IF NOT EXISTS idx_pwd_expires_at ON euonqol.password_reset_tokens(expires_at);

CREATE TABLE IF NOT EXISTS euonqol.user_otp (
  id SERIAL PRIMARY KEY,
  keycloak_user_id VARCHAR(36) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_keycloak_user_id ON euonqol.user_otp(keycloak_user_id);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON euonqol.user_otp(expires_at);

CREATE TABLE IF NOT EXISTS euonqol.user_sessions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(36) REFERENCES :"keycloak_schema".user_entity(id) ON DELETE CASCADE,
  session_token VARCHAR(255),
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  last_activity TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS euonqol.user_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(36) REFERENCES :"keycloak_schema".user_entity(id) ON DELETE SET NULL,
  session_id INT REFERENCES euonqol.user_sessions(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3) Patient Groups & Institutes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS euonqol.patient_groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  description VARCHAR(200),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS euonqol.institutes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(255) NOT NULL,
  country VARCHAR(255) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTE: patients table is created in section 12 (after surveys_questionnaires).

-- ---------------------------------------------------------------------------
-- 4) Answer catalog (profiles + options + translations)
-- ---------------------------------------------------------------------------

-- One row per answer profile (extent_4, quality_7_NA_PNTA, yn, ...)
CREATE TABLE IF NOT EXISTS euonqol.answer_profiles (
  id SERIAL PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One row per option of a profile (value = -2,-1,1..9); display_order controls UI ordering.
CREATE TABLE IF NOT EXISTS euonqol.answer_options (
  id SERIAL PRIMARY KEY,
  answer_profile_id INT NOT NULL REFERENCES euonqol.answer_profiles(id) ON DELETE CASCADE,
  value INT NOT NULL,
  option_code VARCHAR(40), -- e.g. SKIP_SYS, SKIP_PAT, NA, PNTA (optional)
  display_order INT NOT NULL,
  is_selectable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (answer_profile_id, value)
);
CREATE INDEX IF NOT EXISTS idx_answer_options_profile ON euonqol.answer_options(answer_profile_id);

-- Translated labels per language
CREATE TABLE IF NOT EXISTS euonqol.answer_option_i18n (
  id SERIAL PRIMARY KEY,
  answer_option_id INT NOT NULL REFERENCES euonqol.answer_options(id) ON DELETE CASCADE,
  language_id INT NOT NULL REFERENCES euonqol.eu_countries(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (answer_option_id, language_id)
);
CREATE INDEX IF NOT EXISTS idx_answer_i18n_lang ON euonqol.answer_option_i18n(language_id);

-- ---------------------------------------------------------------------------
-- 5) Kit Versions (general; contain both static + CAT questions)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS euonqol.kit_versions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(36) REFERENCES :"keycloak_schema".user_entity(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name)
);

-- Track imported files for a kit version (static & cat & socio-demo)
CREATE TABLE IF NOT EXISTS euonqol.kit_version_files (
  id SERIAL PRIMARY KEY,
  kit_version_id INT NOT NULL REFERENCES euonqol.kit_versions(id) ON DELETE CASCADE,
  question_kind VARCHAR(20) CHECK (question_kind IN ('static', 'cat', 'socio-demo', 'feedback')) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  language_id INT NOT NULL REFERENCES euonqol.eu_countries(id) ON DELETE RESTRICT,
  uploaded_by VARCHAR(36) REFERENCES :"keycloak_schema".user_entity(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_kit_file UNIQUE (kit_version_id, question_kind, language_id)
);
CREATE INDEX IF NOT EXISTS idx_kvf_kit_kind ON euonqol.kit_version_files(kit_version_id, question_kind);

-- CAT settings (algorithm/config reference; details handled in app)
CREATE TABLE IF NOT EXISTS euonqol.cat_settings (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  description TEXT,
  setting_key VARCHAR(120),
  api_configuration JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cat_settings_setting_key ON euonqol.cat_settings(setting_key);

-- ---------------------------------------------------------------------------
-- 6) Questions (unified bridge) + per-language content
-- ---------------------------------------------------------------------------

-- Unified question row (language-agnostic). Texts are in static_questions / cat_questions / socio_demo_questions / feedback_question_translations.
CREATE TABLE IF NOT EXISTS euonqol.questions (
  id SERIAL PRIMARY KEY,
  kit_version_id INT NOT NULL REFERENCES euonqol.kit_versions(id) ON DELETE CASCADE,
  question_kind VARCHAR(20) CHECK (question_kind IN ('static', 'cat', 'socio-demo', 'feedback')) NOT NULL,
  question_code VARCHAR(50) NOT NULL,                 -- qid (static) OR cat_id (cat) OR id (socio-demo)
  answer_profile_id INT REFERENCES euonqol.answer_profiles(id) ON DELETE RESTRICT, -- NULL for info-only items and socio-demo
  -- Static-only metadata (nullable for CAT)
  interface VARCHAR(50),
  question_type VARCHAR(50) CHECK (question_type IN ('check', 'textcheck', 'text', 'quality_7')),
  order_position INT,
  scale VARCHAR(50),
  direction VARCHAR(50) CHECK (direction IN ('negative', 'positive')),
  score_system VARCHAR(50) CHECK (score_system IN ('IRT', 'CTT')),
  parent_qid VARCHAR(50),
  operator VARCHAR(20),
  value VARCHAR(50),
  is_mandatory BOOLEAN,
  version INT,                                        -- CAT question bank version
  created_by VARCHAR(36) REFERENCES :"keycloak_schema".user_entity(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (kit_version_id, question_kind, question_code)
);
CREATE INDEX IF NOT EXISTS idx_q_kit_kind ON euonqol.questions(kit_version_id, question_kind);
CREATE INDEX IF NOT EXISTS idx_q_answer_profile ON euonqol.questions(answer_profile_id);

-- Question visibility per patient group (used when building modules)
CREATE TABLE IF NOT EXISTS euonqol.patient_group_questions (
  id SERIAL PRIMARY KEY,
  question_id INT NOT NULL REFERENCES euonqol.questions(id) ON DELETE RESTRICT,
  patient_group_id INT NOT NULL REFERENCES euonqol.patient_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (patient_group_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_pgq_group ON euonqol.patient_group_questions(patient_group_id);
CREATE INDEX IF NOT EXISTS idx_pgq_question ON euonqol.patient_group_questions(question_id);

-- Static question text per language
CREATE TABLE IF NOT EXISTS euonqol.static_questions (
  id SERIAL PRIMARY KEY,
  question_id INT NOT NULL REFERENCES euonqol.questions(id) ON DELETE CASCADE,
  cat_id VARCHAR(50), -- optional reference
  language_id INT NOT NULL REFERENCES euonqol.eu_countries(id) ON DELETE RESTRICT,
  head TEXT,
  pramble TEXT,
  question TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (question_id, language_id)
);
CREATE INDEX IF NOT EXISTS idx_sq_q_lang ON euonqol.static_questions(question_id, language_id);

-- CAT question text per language
CREATE TABLE IF NOT EXISTS euonqol.cat_questions (
  id SERIAL PRIMARY KEY,
  question_id INT NOT NULL REFERENCES euonqol.questions(id) ON DELETE CASCADE,
  language_id INT NOT NULL REFERENCES euonqol.eu_countries(id) ON DELETE RESTRICT,
  question TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (question_id, language_id)
);
CREATE INDEX IF NOT EXISTS idx_cq_q_lang ON euonqol.cat_questions(question_id, language_id);

-- Socio-demo question text per language
CREATE TABLE IF NOT EXISTS euonqol.socio_demo_questions (
  id SERIAL PRIMARY KEY,
  question_id INT NOT NULL REFERENCES euonqol.questions(id) ON DELETE CASCADE,
  language_id INT NOT NULL REFERENCES euonqol.eu_countries(id) ON DELETE RESTRICT,
  question_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (question_id, language_id)
);
CREATE INDEX IF NOT EXISTS idx_sdq_q_lang ON euonqol.socio_demo_questions(question_id, language_id);

-- Socio-demo answers (question-specific, not shared profiles)
CREATE TABLE IF NOT EXISTS euonqol.socio_demo_answers (
  id SERIAL PRIMARY KEY,
  question_id INT NOT NULL REFERENCES euonqol.questions(id) ON DELETE CASCADE,
  language_id INT NOT NULL REFERENCES euonqol.eu_countries(id) ON DELETE RESTRICT,
  answer_text TEXT NOT NULL,
  answer_type VARCHAR(50) NOT NULL,
  display_order INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sda_question ON euonqol.socio_demo_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_sda_q_lang ON euonqol.socio_demo_answers(question_id, language_id);
CREATE INDEX IF NOT EXISTS idx_sda_q_order ON euonqol.socio_demo_answers(question_id, display_order);

-- Feedback question text per language
CREATE TABLE IF NOT EXISTS euonqol.feedback_question_translations (
  id SERIAL PRIMARY KEY,
  question_id INT NOT NULL REFERENCES euonqol.questions(id) ON DELETE CASCADE,
  language_id INT NOT NULL REFERENCES euonqol.eu_countries(id) ON DELETE RESTRICT,
  question_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (question_id, language_id)
);
CREATE INDEX IF NOT EXISTS idx_fqt_q_lang ON euonqol.feedback_question_translations(question_id, language_id);

-- Feedback answers (question-specific, not shared profiles)
CREATE TABLE IF NOT EXISTS euonqol.feedback_answers (
  id SERIAL PRIMARY KEY,
  question_id INT NOT NULL REFERENCES euonqol.questions(id) ON DELETE CASCADE,
  language_id INT NOT NULL REFERENCES euonqol.eu_countries(id) ON DELETE RESTRICT,
  answer_text TEXT NOT NULL,
  answer_type VARCHAR(50) NOT NULL,
  display_order INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fa_question ON euonqol.feedback_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_fa_q_lang ON euonqol.feedback_answers(question_id, language_id);
CREATE INDEX IF NOT EXISTS idx_fa_q_order ON euonqol.feedback_answers(question_id, display_order);

-- ---------------------------------------------------------------------------
-- 7) CTT Norms Versions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS euonqol.ctt_norms_versions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  norms JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(36) REFERENCES :"keycloak_schema".user_entity(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 8) Modules (created from Kit Version questions)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS euonqol.modules (
  id SERIAL PRIMARY KEY,
  kit_version_id INT NOT NULL REFERENCES euonqol.kit_versions(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(20) CHECK (type IN ('static', 'dynamic', 'socio-demo', 'feedback')) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  group_name VARCHAR(120),
  patient_group_id INT REFERENCES euonqol.patient_groups(id) ON DELETE RESTRICT, -- optional but recommended
  cat_setting_id INT REFERENCES euonqol.cat_settings(id) ON DELETE SET NULL,
  created_by VARCHAR(36) REFERENCES :"keycloak_schema".user_entity(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_modules_kit ON euonqol.modules(kit_version_id);
CREATE INDEX IF NOT EXISTS idx_modules_patient_group ON euonqol.modules(patient_group_id);

CREATE TABLE IF NOT EXISTS euonqol.modules_questions (
  id SERIAL PRIMARY KEY,
  module_id INT NOT NULL REFERENCES euonqol.modules(id) ON DELETE CASCADE,
  question_id INT NOT NULL REFERENCES euonqol.questions(id) ON DELETE RESTRICT,
  position INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_by VARCHAR(36) REFERENCES :"keycloak_schema".user_entity(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (module_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_mq_order ON euonqol.modules_questions(module_id, position);

-- ---------------------------------------------------------------------------
-- 9) Questionnaires (contain ordered modules)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS euonqol.questionnaires (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  patient_group_id INT NOT NULL REFERENCES euonqol.patient_groups(id) ON DELETE NO ACTION,
  type VARCHAR(20) CHECK (type IN ('static', 'dynamic')) NOT NULL,
  status VARCHAR(20) CHECK (status IN ('draft', 'public', 'disabled', 'completed')) NOT NULL DEFAULT 'draft',
  disabled_by_survey BOOLEAN NOT NULL DEFAULT false,
  ctt_norms_version_id INT REFERENCES euonqol.ctt_norms_versions(id) ON DELETE NO ACTION,
  max_completions INT,
  created_by VARCHAR(36) REFERENCES :"keycloak_schema".user_entity(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_q_patient_group ON euonqol.questionnaires(patient_group_id);
CREATE INDEX IF NOT EXISTS idx_questionnaires_ctt_norms ON euonqol.questionnaires(ctt_norms_version_id);

CREATE TABLE IF NOT EXISTS euonqol.questionnaires_modules (
  id SERIAL PRIMARY KEY,
  questionnaire_id INT NOT NULL REFERENCES euonqol.questionnaires(id) ON DELETE CASCADE,
  module_id INT NOT NULL REFERENCES euonqol.modules(id) ON DELETE RESTRICT,
  position INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (questionnaire_id, module_id)
);
CREATE INDEX IF NOT EXISTS idx_qm_order ON euonqol.questionnaires_modules(questionnaire_id, position);

-- ---------------------------------------------------------------------------
-- 10) Surveys (contain multiple questionnaires) + assignments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS euonqol.surveys (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  starting_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  max_completions INT,
  reminder BOOLEAN,
  frequency_tipology VARCHAR(20) CHECK (frequency_tipology IN ('daily', 'weekly', 'monthly')),
  frequency INT,
  reminder_max_count INT,
  send_mode VARCHAR(20) NOT NULL DEFAULT 'manual',
  send_delay_hours INT,
  send_scheduled_at TIMESTAMPTZ,
  status VARCHAR(20) CHECK (status IN ('draft', 'public', 'disabled', 'completed')) NOT NULL DEFAULT 'draft',
  access_mode VARCHAR(30) NOT NULL DEFAULT 'traced',
  ctt_norms_version_id INT REFERENCES euonqol.ctt_norms_versions(id) ON DELETE SET NULL,
  created_by VARCHAR(36) REFERENCES :"keycloak_schema".user_entity(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS euonqol.surveys_questionnaires (
  id SERIAL PRIMARY KEY,
  survey_id INT NOT NULL REFERENCES euonqol.surveys(id) ON DELETE CASCADE,
  questionnaire_id INT NOT NULL REFERENCES euonqol.questionnaires(id) ON DELETE RESTRICT,
  public_link VARCHAR(255) UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (survey_id, questionnaire_id)
);

-- ---------------------------------------------------------------------------
-- 11) Patients (linked to surveys_questionnaires)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS euonqol.patients (
  id SERIAL PRIMARY KEY,
  patient_id VARCHAR(255) NOT NULL,
  survey_questionnaire_id INT NOT NULL REFERENCES euonqol.surveys_questionnaires(id) ON DELETE CASCADE,
  group_id INT REFERENCES euonqol.patient_groups(id) ON DELETE SET NULL,
  mail VARCHAR(255),
  phone_prefix VARCHAR(10),
  phone VARCHAR(30),
  created_by VARCHAR(36) REFERENCES :"keycloak_schema".user_entity(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (patient_id, survey_questionnaire_id)
);
CREATE INDEX IF NOT EXISTS idx_patients_sq ON euonqol.patients(survey_questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_patients_group_id ON euonqol.patients(group_id);

CREATE TABLE IF NOT EXISTS euonqol.users_surveys (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES :"keycloak_schema".user_entity(id) ON DELETE CASCADE,
  survey_id INT NOT NULL REFERENCES euonqol.surveys(id) ON DELETE CASCADE,
  access_type VARCHAR(10) CHECK (access_type IN ('view', 'edit')) NOT NULL DEFAULT 'view',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, survey_id)
);

CREATE TABLE IF NOT EXISTS euonqol.survey_questionnaire_patients_assignment (
  id SERIAL PRIMARY KEY,
  survey_questionnaire_id INT NOT NULL REFERENCES euonqol.surveys_questionnaires(id) ON DELETE CASCADE,
  patient_id INT NOT NULL REFERENCES euonqol.patients(id) ON DELETE CASCADE,
  link VARCHAR(255) UNIQUE,
  access_mode VARCHAR(30) DEFAULT 'traced',
  send_status VARCHAR(20) CHECK (send_status IN ('pending', 'delivered', 'failed')) DEFAULT 'pending',
  completion_status VARCHAR(20) CHECK (completion_status IN ('pending', 'in_progress', 'completed')) DEFAULT 'pending',
  eligibility_status VARCHAR(20),
  eligibility_disqualification_msg TEXT,
  study_info_status VARCHAR(20),
  study_info_rejection_msg TEXT,
  sent_at TIMESTAMPTZ,
  sent_by VARCHAR(36) REFERENCES :"keycloak_schema".user_entity(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  scores JSONB,
  scheduled_send_at TIMESTAMPTZ,
  reminder_count INT NOT NULL DEFAULT 0,
  next_reminder_at TIMESTAMPTZ,
  email_language_id INT REFERENCES euonqol.eu_countries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assign_patient ON euonqol.survey_questionnaire_patients_assignment(patient_id);
CREATE INDEX IF NOT EXISTS idx_assign_link ON euonqol.survey_questionnaire_patients_assignment(link);
CREATE INDEX IF NOT EXISTS idx_assignment_scores ON euonqol.survey_questionnaire_patients_assignment USING GIN (scores);

CREATE TABLE IF NOT EXISTS euonqol.cat_module_sessions (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES euonqol.survey_questionnaire_patients_assignment(id) ON DELETE CASCADE,
  module_id INTEGER NOT NULL REFERENCES euonqol.modules(id) ON DELETE CASCADE,
  session_token VARCHAR(255),
  session_data JSONB,
  current_dimension_index INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT cat_module_sessions_assignment_module_unique UNIQUE (assignment_id, module_id)
);
CREATE INDEX IF NOT EXISTS idx_cat_session_assignment ON euonqol.cat_module_sessions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_cat_session_module ON euonqol.cat_module_sessions(module_id);
CREATE INDEX IF NOT EXISTS idx_cat_session_completed ON euonqol.cat_module_sessions(is_completed);

CREATE TABLE IF NOT EXISTS euonqol.patient_sessions (
  id SERIAL PRIMARY KEY,
  survey_id INT NOT NULL REFERENCES euonqol.surveys(id) ON DELETE CASCADE,
  survey_assignment_id INT NOT NULL REFERENCES euonqol.survey_questionnaire_patients_assignment(id) ON DELETE CASCADE,
  patient_id INT NOT NULL REFERENCES euonqol.patients(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- 12) Responses (answer_option_id for MCQ; answer_text for free text)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS euonqol.responses (
  id SERIAL PRIMARY KEY,
  assignment_id INT NOT NULL REFERENCES euonqol.survey_questionnaire_patients_assignment(id) ON DELETE CASCADE,
  question_id INT NOT NULL REFERENCES euonqol.questions(id) ON DELETE RESTRICT,
  language_id INT NOT NULL REFERENCES euonqol.eu_countries(id) ON DELETE RESTRICT,
  answer_option_id INT REFERENCES euonqol.answer_options(id) ON DELETE SET NULL,
  answer_text TEXT,
  socio_demo_answer_id INT REFERENCES euonqol.socio_demo_answers(id) ON DELETE SET NULL,
  feedback_answer_id INT REFERENCES euonqol.feedback_answers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- One answer per assignment/question/language
  UNIQUE (assignment_id, question_id, language_id),
  -- Ensure at least one answer type is present
  CHECK (answer_option_id IS NOT NULL OR answer_text IS NOT NULL OR socio_demo_answer_id IS NOT NULL OR feedback_answer_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_resp_assignment ON euonqol.responses(assignment_id);
CREATE INDEX IF NOT EXISTS idx_resp_question ON euonqol.responses(question_id);
CREATE INDEX IF NOT EXISTS idx_resp_answer_option ON euonqol.responses(answer_option_id);
CREATE INDEX IF NOT EXISTS idx_resp_socio_demo_answer ON euonqol.responses(socio_demo_answer_id);
CREATE INDEX IF NOT EXISTS idx_resp_feedback_answer ON euonqol.responses(feedback_answer_id);

-- ---------------------------------------------------------------------------
-- 13) Privacy Policies
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS euonqol.privacy_policies (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  language_id INT NOT NULL REFERENCES euonqol.eu_countries(id) ON DELETE RESTRICT,
  patient_type VARCHAR(20) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(36) REFERENCES :"keycloak_schema".user_entity(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pp_language ON euonqol.privacy_policies(language_id);
CREATE INDEX IF NOT EXISTS idx_pp_patient_type ON euonqol.privacy_policies(patient_type);
CREATE INDEX IF NOT EXISTS idx_pp_lang_current ON euonqol.privacy_policies(language_id, is_current);

CREATE TABLE IF NOT EXISTS euonqol.survey_privacy_policies (
  id SERIAL PRIMARY KEY,
  survey_id INT NOT NULL REFERENCES euonqol.surveys(id) ON DELETE CASCADE,
  privacy_policy_id INT NOT NULL REFERENCES euonqol.privacy_policies(id) ON DELETE RESTRICT,
  is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (survey_id, privacy_policy_id)
);
CREATE INDEX IF NOT EXISTS idx_spp_survey ON euonqol.survey_privacy_policies(survey_id);
CREATE INDEX IF NOT EXISTS idx_spp_policy ON euonqol.survey_privacy_policies(privacy_policy_id);

CREATE TABLE IF NOT EXISTS euonqol.privacy_policy_acceptances (
  id SERIAL PRIMARY KEY,
  privacy_policy_id INT NOT NULL REFERENCES euonqol.privacy_policies(id) ON DELETE RESTRICT,
  assignment_id INT NOT NULL REFERENCES euonqol.survey_questionnaire_patients_assignment(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ppa_policy ON euonqol.privacy_policy_acceptances(privacy_policy_id);
CREATE INDEX IF NOT EXISTS idx_ppa_assignment ON euonqol.privacy_policy_acceptances(assignment_id);

-- ---------------------------------------------------------------------------
-- 14) Survey Presentations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS euonqol.survey_presentations (
  id SERIAL PRIMARY KEY,
  survey_id INT NOT NULL REFERENCES euonqol.surveys(id) ON DELETE CASCADE,
  language_id INT NOT NULL REFERENCES euonqol.eu_countries(id) ON DELETE RESTRICT,
  title VARCHAR(255),
  content TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sp_survey_lang_current ON euonqol.survey_presentations(survey_id, language_id, is_current);
CREATE INDEX IF NOT EXISTS idx_sp_survey ON euonqol.survey_presentations(survey_id);

-- ---------------------------------------------------------------------------
-- 15) Survey Eligibility Questions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS euonqol.survey_eligibility_questions (
  id SERIAL PRIMARY KEY,
  survey_id INT NOT NULL REFERENCES euonqol.surveys(id) ON DELETE CASCADE,
  expected_answer VARCHAR(3) NOT NULL DEFAULT 'yes',
  order_position INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_seq_survey_current ON euonqol.survey_eligibility_questions(survey_id, is_current);
CREATE INDEX IF NOT EXISTS idx_seq_survey ON euonqol.survey_eligibility_questions(survey_id);

CREATE TABLE IF NOT EXISTS euonqol.survey_eligibility_question_translations (
  id SERIAL PRIMARY KEY,
  question_id INT NOT NULL REFERENCES euonqol.survey_eligibility_questions(id) ON DELETE CASCADE,
  language_id INT NOT NULL REFERENCES euonqol.eu_countries(id) ON DELETE RESTRICT,
  question_text VARCHAR(500) NOT NULL,
  disqualification_message TEXT,
  is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (question_id, language_id)
);
CREATE INDEX IF NOT EXISTS idx_seqt_question ON euonqol.survey_eligibility_question_translations(question_id);
CREATE INDEX IF NOT EXISTS idx_seqt_question_lang ON euonqol.survey_eligibility_question_translations(question_id, language_id);

-- ---------------------------------------------------------------------------
-- 16) Email Templates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS euonqol.surveys_questionnaires_email_templates (
  id SERIAL PRIMARY KEY,
  survey_questionnaire_id INT NOT NULL REFERENCES euonqol.surveys_questionnaires(id) ON DELETE CASCADE,
  language_id INT NOT NULL REFERENCES euonqol.eu_countries(id) ON DELETE RESTRICT,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (survey_questionnaire_id, language_id)
);
CREATE INDEX IF NOT EXISTS idx_sqet_sq ON euonqol.surveys_questionnaires_email_templates(survey_questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_sqet_lang ON euonqol.surveys_questionnaires_email_templates(language_id);

-- ---------------------------------------------------------------------------
-- 17) Study Info Sheets
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS euonqol.survey_study_info_sheets (
  id SERIAL PRIMARY KEY,
  survey_id INT NOT NULL REFERENCES euonqol.surveys(id) ON DELETE CASCADE,
  language_id INT NOT NULL REFERENCES euonqol.eu_countries(id) ON DELETE RESTRICT,
  title VARCHAR(255),
  content TEXT NOT NULL,
  rejection_message TEXT,
  version INT NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ssis_survey_lang_current ON euonqol.survey_study_info_sheets(survey_id, language_id, is_current);
CREATE INDEX IF NOT EXISTS idx_ssis_survey ON euonqol.survey_study_info_sheets(survey_id);

-- ---------------------------------------------------------------------------
-- INSERT VALUES FOR: eu_countries table
-- ---------------------------------------------------------------------------
INSERT INTO euonqol.eu_countries (id, language, original_lang, alphabet) VALUES
(1, 'German', 'Deutsch', 'Latin'),
(2, 'French', 'Français', 'Latin'),
(3, 'Bulgarian', 'Български', 'Cyrillic'),
(4, 'Croatian', 'Hrvatski', 'Latin'),
(5, 'Greek', 'Ελληνικά', 'Latin'),
(6, 'Czech', 'Čeština', 'Latin'),
(7, 'Danish', 'Dansk', 'Latin'),
(8, 'Estonian', 'Eesti keel', 'Latin'),
(9, 'Finnish', 'Suomalainen', 'Latin'),
(13, 'Hungarian', 'Magyar', 'Latin'),
(14, 'Italian', 'Italiano', 'Latin'),
(15, 'Latvian', 'Latviešu', 'Latin'),
(16, 'Lithuanian', 'Lietuvių', 'Latin'),
(17, 'Luxemburgish', 'ORI-Luxemburgish', 'Latin'),
(18, 'Maltese', 'ORI-Maltese', 'Latin'),
(19, 'Dutch', 'Nederlandse', 'Latin'),
(20, 'Polish', 'Polski', 'Latin'),
(21, 'Portuguese', 'Portuguesa', 'Latin'),
(22, 'Slovak', 'ORI-Slovak', 'Latin'),
(23, 'Slovenian', 'Slovenská', 'Latin'),
(24, 'Spanish', 'Español', 'Latin'),
(25, 'Swedish', 'Svenska', 'Latin'),
(26, 'Turkish', 'Türk', 'Latin'),
(27, 'Norwegian', 'Norsk', 'Latin'),
(28, 'Serbian', 'Српски', 'Serbian-Cyrillic'),
(29, 'English', 'English', 'Latin'),
(30, 'Ukrainian', 'ORI-Ukranian', 'Latin'),
(34, 'Sámi', 'ORI-Sámi', 'Latin'),
(36, 'Albanian', 'Shqiptare', 'Latin'),
(37, 'Georgian', 'ქართული', 'Mkhedruli'),
(38, 'Irish', 'ORI-Irish', 'Latin'),
(39, 'Irish-Ireland', 'ORI-Irish', 'Latin'),
(40, 'Romanian-Moldova', 'română', 'Latin'),
(41, 'Romanian-Romania', 'română', 'Latin');

--- ---------------------------------------------------------------------------
-- INSERT VALUES FOR: patient_groups table
--- --------------------------------------------------------------------------
INSERT INTO euonqol.patient_groups (name, description) VALUES
('Group A', 'ACTIVE'),
('Group B', 'SURVIVORS'),
('Group C', 'PALLIATIVE'),
('Group D', 'UNDEFINED');

