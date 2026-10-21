export enum UserTypeEnum {
  Admin = 'admin',
  Manager = 'manager',
}

export enum LoginResponseEnum {
  Success = 'success',
  PasswordUpdateRequired = 'password_update_required',
  Error = 'error',
}

export enum KitVersionTypeEnum {
  Cat = 'cat',
  Static = 'static',
  SocioDemo = 'socio-demo',
  Feedback = 'feedback',
}

export enum ModuleTypeGroupEnum {
  KitModule = 'kit-module',
  AdditionalModule = 'additional-module',
}

export enum ModuleKindEnum {
  Dynamic = 'dynamic',
  Static = 'static',
  SocioDemo = 'socio-demo',
  Feedback = 'feedback',
  Additional = 'additional',
}

export enum UploadSheetErrorMessageEnum {
  MissingSheet = 'missing',
  TypoSheet = 'typo',
  ColumnError = 'col_error',
  LanguageDiff = 'language_diff',
  MissingCatSettings = 'missing_cat_settings',
  MissingScaleMapping = 'missing_scale_mapping',
  ExtraSheet = 'extra_sheet',
}

export enum SheetValidationStatusEnum {
  Valid = 'valid',
  Typo = 'typo',
  ColumnError = 'col_error',
  Unknown = 'unknown',
  Extra = 'extra',
}

export enum AccessModeEnum {
  Traced = 'traced',
  AnonymousOnInvitation = 'anonymous_on_invitation',
  AnonymousSpontaneous = 'anonymous_spontaneous',
}

export enum SurveyStatusEnum {
  Draft = 'draft',
  Public = 'public',
  Disabled = 'disabled',
  Completed = 'completed',
}

export enum SendModeEnum {
  Manual = 'manual',
  Immediate = 'immediate',
  AfterDelay = 'after_delay',
  Scheduled = 'scheduled',
}

export enum FrequencyTipologyEnum {
  Daily = 'daily',
  Weekly = 'weekly',
  Monthly = 'monthly',
}

export enum QuestionnaireStatusEnum {
  Draft = 'draft',
  Public = 'public',
  Disabled = 'disabled',
  Completed = 'completed',
}

export enum EmailProviderEnum {
  Smtp = 'smtp',
  Mailpit = 'mailpit',
  Resend = 'resend',
}

export enum SurveyStepIdEnum {
  General = 'general',
  Sending = 'sending',
  Reminders = 'reminders',
  Status = 'status',
}
