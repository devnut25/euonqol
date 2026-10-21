export enum KitVersionTypeEnum {
  STATIC = 'static',
  CAT = 'cat',
  SOCIO_DEMO = 'socio-demo',
  FEEDBACK = 'feedback',
}

export enum QuestionTypeEnum {
  STATIC = 'static',
  CAT = 'cat',
  SOCIO_DEMO = 'socio-demo',
  FEEDBACK = 'feedback',
}

export enum ModuleTypeEnum {
  DYNAMIC = 'dynamic',
  STATIC = 'static',
  SOCIO_DEMO = 'socio-demo',
  FEEDBACK = 'feedback',
}

/** Module types as exposed by GET /modules/all — `socio-demo` is relabelled `additional`. */
export enum ModulePickerTypeEnum {
  DYNAMIC = 'dynamic',
  STATIC = 'static',
  ADDITIONAL = 'additional',
  FEEDBACK = 'feedback',
}

export enum SurveyStatusEnum {
  DRAFT = 'draft',
  DISABLED = 'disabled',
  PUBLIC = 'public',
  COMPLETED = 'completed',
}

export enum QuestionnaireStatusEnum {
  DRAFT = 'draft',
  PUBLIC = 'public',
  DISABLED = 'disabled',
  COMPLETED = 'completed',
}
