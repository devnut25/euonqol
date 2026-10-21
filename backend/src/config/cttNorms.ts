/**
 * CTT T-score normative reference values.
 *
 * Each entry pairs a descriptive scale name with the ScaleCode stored in
 * questions.scale (imported from the kit's Excel template) — scoring looks
 * up the norm directly by scaleCode, no separate translation table needed.
 * Source: EUonQoL study normative data.
 *
 * This is only the static fallback used when a survey/questionnaire has no
 * ctt_norms_version assigned — CTT Norms Versions created in the UI define
 * their own norms array with fully user-defined scales.
 */
export interface CttNormEntry {
  name: string;
  scaleCode: string;
  average: number;
  sd: number;
}

export const CTT_SCALE_NORMS: CttNormEntry[] = [
  { name: 'S_Physical Symptoms', scaleCode: 'PS_S', average: 41.16635, sd: 31.53132 },
  { name: 'S_Side Effects', scaleCode: 'SE_S', average: 33.94409, sd: 30.5314 },
  { name: 'S_Partner', scaleCode: 'PAR_S', average: 57.9527, sd: 36.75481 },
  { name: 'S_Employer', scaleCode: 'EMP_S', average: 50.8294, sd: 41.16623 },
  { name: 'S_Lifestyle Changes', scaleCode: 'LC_S', average: 43.93582, sd: 31.90204 },
  { name: 'S_WISP', scaleCode: 'WISP', average: 86.40959, sd: 34.2727 },
  { name: 'Individual Cancer Burden', scaleCode: 'ICB_S', average: 43.37231, sd: 22.18087 },
  { name: 'Impact of Cancer on Life Role', scaleCode: 'ICLR_S', average: 17.10277, sd: 20.93458 },
  { name: 'Care and Communication', scaleCode: 'CC_S', average: 83.14135, sd: 18.08464 },
];
