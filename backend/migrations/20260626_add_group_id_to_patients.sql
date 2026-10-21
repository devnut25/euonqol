-- Migration: Add group_id FK to patients table
-- Links each patient to a patient_group for group-level reporting

ALTER TABLE euonqol.patients
  ADD COLUMN IF NOT EXISTS group_id INT
    REFERENCES euonqol.patient_groups(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_patients_group_id ON euonqol.patients(group_id);
