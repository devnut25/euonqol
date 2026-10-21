-- Migration: add_cat_integration
-- Date: 2026-03-11
-- Description: Add CAT (Computer Adaptive Testing) integration tables and fields

-- ================================================
-- 1. Add new fields to cat_settings table
-- ================================================

-- Add setting_key column (unique identifier for external CAT API)
ALTER TABLE euonqol.cat_settings 
ADD COLUMN IF NOT EXISTS setting_key VARCHAR(120);

-- Add api_configuration column (for additional API config)
ALTER TABLE euonqol.cat_settings 
ADD COLUMN IF NOT EXISTS api_configuration JSONB;

-- Add index on setting_key for faster lookups
CREATE INDEX IF NOT EXISTS idx_cat_settings_setting_key 
ON euonqol.cat_settings(setting_key);

-- ================================================
-- 2. Create cat_module_sessions table
-- ================================================

CREATE TABLE IF NOT EXISTS euonqol.cat_module_sessions (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL,
  module_id INTEGER NOT NULL,
  session_token VARCHAR(255),
  session_data JSONB,
  current_dimension_index INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ(6) DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) DEFAULT NOW(),
  
  -- Foreign keys
  CONSTRAINT fk_cat_session_assignment 
    FOREIGN KEY (assignment_id) 
    REFERENCES euonqol.survey_questionnaire_patients_assignment(id) 
    ON DELETE CASCADE,
  
  CONSTRAINT fk_cat_session_module 
    FOREIGN KEY (module_id) 
    REFERENCES euonqol.modules(id) 
    ON DELETE CASCADE,
  
  -- Unique constraint (one session per assignment+module combination)
  CONSTRAINT cat_module_sessions_assignment_module_unique 
    UNIQUE (assignment_id, module_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_cat_session_assignment 
ON euonqol.cat_module_sessions(assignment_id);

CREATE INDEX IF NOT EXISTS idx_cat_session_module 
ON euonqol.cat_module_sessions(module_id);

CREATE INDEX IF NOT EXISTS idx_cat_session_completed 
ON euonqol.cat_module_sessions(is_completed);

-- ================================================
-- 3. Add scores field to assignments table
-- ================================================

-- Add scores column to store calculated scores (both CAT and static modules)
ALTER TABLE euonqol.survey_questionnaire_patients_assignment 
ADD COLUMN IF NOT EXISTS scores JSONB;

-- Add index for faster queries on scores
CREATE INDEX IF NOT EXISTS idx_assignment_scores 
ON euonqol.survey_questionnaire_patients_assignment 
USING GIN (scores);

-- ================================================
-- 4. Add comments for documentation
-- ================================================

COMMENT ON COLUMN euonqol.cat_settings.setting_key IS 
'Unique key to identify CAT configuration on external service (e.g., EORTC_QLQ_C30)';

COMMENT ON COLUMN euonqol.cat_settings.api_configuration IS 
'Additional API configuration parameters in JSON format';

COMMENT ON TABLE euonqol.cat_module_sessions IS 
'Tracks CAT session state for each assignment+module combination';

COMMENT ON COLUMN euonqol.cat_module_sessions.session_token IS 
'External CAT API session token';

COMMENT ON COLUMN euonqol.cat_module_sessions.session_data IS 
'Complete CAT session state including progress and item history';

COMMENT ON COLUMN euonqol.cat_module_sessions.current_dimension_index IS 
'Index of current dimension being assessed';

COMMENT ON COLUMN euonqol.cat_module_sessions.is_completed IS 
'Whether all dimensions have reached stopping criteria';

COMMENT ON COLUMN euonqol.survey_questionnaire_patients_assignment.scores IS 
'Calculated scores for all modules (JSON format with module_<id> keys)';

-- ================================================
-- Migration complete
-- ================================================

-- Verify tables exist
DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'Tables modified:';
  RAISE NOTICE '  - cat_settings (added setting_key, api_configuration)';
  RAISE NOTICE '  - cat_module_sessions (created)';
  RAISE NOTICE '  - survey_questionnaire_patients_assignment (added scores)';
END $$;
