import type { Values } from '@/hooks/useCrudDataTable';
import { ValueEnumContext, type ValueOptionsType } from '@/hooks/useValueEnum';
import {
  AccessModeEnum,
  EmailProviderEnum,
  FrequencyTipologyEnum,
  KitVersionTypeEnum,
  ModuleKindEnum,
  ModuleTypeGroupEnum,
  QuestionnaireStatusEnum,
  SendModeEnum,
  SurveyStatusEnum,
  UserTypeEnum,
} from '@/utils/enum';
import { useTranslation } from 'react-i18next';

interface ValueEnumProps {
  children: React.ReactNode;
}

export const ValueEnumProvider = ({ children }: ValueEnumProps) => {
  const { t } = useTranslation(['valueEnum']);

  const valueEnum = {
    operators: {
      '=': '=',
      '<>': '!=',
      '>': '>',
      '>=': '>=',
      '<': '<',
      '<=': '<=',
      IN: 'IN',
    },
    active: {
      true: t('active.true'),
      false: t('active.false'),
    },
    patientAnonymousFilter: {
      false: t('patientAnonymousFilter.false'),
      true: t('patientAnonymousFilter.true'),
    },
    boolean: {
      true: t('boolean.true'),
      false: t('boolean.false'),
    },
    booleanReverse: {
      false: t('boolean.false'),
      true: t('boolean.true'),
    },
    userTypes: {
      [UserTypeEnum.Admin]: t('userTypes.admin'),
      [UserTypeEnum.Manager]: t('userTypes.manager'),
    },
    kitVersionType: {
      [KitVersionTypeEnum.Cat]: t('kitVersionType.cat'),
      [KitVersionTypeEnum.Static]: t('kitVersionType.static'),
      [KitVersionTypeEnum.SocioDemo]: t('kitVersionType.socioDemo'),
      [KitVersionTypeEnum.Feedback]: t('kitVersionType.feedback'),
    },
    moduleTypeGroup: {
      [ModuleTypeGroupEnum.KitModule]: t('moduleTypeGroup.kitModule'),
      [ModuleTypeGroupEnum.AdditionalModule]: t('moduleTypeGroup.additionalModule'),
    },
    moduleType: {
      [ModuleKindEnum.Dynamic]: t('moduleType.dynamic'),
      [ModuleKindEnum.Static]: t('moduleType.static'),
      [ModuleKindEnum.SocioDemo]: t('moduleType.socioDemo'),
      [ModuleKindEnum.Feedback]: t('moduleType.feedback'),
    },
    surveyStatus: {
      [SurveyStatusEnum.Draft]: t('surveyStatus.draft'),
      [SurveyStatusEnum.Public]: t('surveyStatus.public'),
      [SurveyStatusEnum.Disabled]: t('surveyStatus.disabled'),
      [SurveyStatusEnum.Completed]: t('surveyStatus.completed'),
    },
    questionnaireStatus: {
      [QuestionnaireStatusEnum.Draft]: t('questionnaireStatus.draft'),
      [QuestionnaireStatusEnum.Public]: t('questionnaireStatus.public'),
      [QuestionnaireStatusEnum.Disabled]: t('questionnaireStatus.disabled'),
      [QuestionnaireStatusEnum.Completed]: t('questionnaireStatus.completed'),
    },
    accessMode: {
      [AccessModeEnum.Traced]: t('accessMode.traced'),
      [AccessModeEnum.AnonymousOnInvitation]: t('accessMode.anonymousOnInvitation'),
      [AccessModeEnum.AnonymousSpontaneous]: t('accessMode.anonymousSpontaneous'),
    },
    sendMode: {
      [SendModeEnum.Manual]: t('sendMode.manual', 'Manual (operator clicks Send)'),
      [SendModeEnum.Immediate]: t('sendMode.immediate', 'Automatic — immediately after assignment'),
      [SendModeEnum.AfterDelay]: t('sendMode.after_delay', 'Automatic — after a delay'),
      [SendModeEnum.Scheduled]: t('sendMode.scheduled', 'Automatic — at a fixed date/time'),
    },
    frequencyTipology: {
      [FrequencyTipologyEnum.Daily]: t('frequencyTipology.daily', 'Day'),
      [FrequencyTipologyEnum.Weekly]: t('frequencyTipology.weekly', 'Week'),
      [FrequencyTipologyEnum.Monthly]: t('frequencyTipology.monthly', 'Month'),
    },
    emailProvider: {
      [EmailProviderEnum.Smtp]: t('emailProvider.smtp', 'SMTP'),
      [EmailProviderEnum.Mailpit]: t('emailProvider.mailpit', 'Mailpit (development)'),
      [EmailProviderEnum.Resend]: t('emailProvider.resend', 'Resend'),
    },
  };

  /**
   * Convert valueEnum to options
   * from: { bool: { true: "Si", false: "No" } }
   * to: { bool: [{ label: "Si", value: true }, { label: "No", value: false }] }
   */
  const enumToOptions = (valueEnum: Values) => {
    const valueOptions: Values = {};
    Object.keys(valueEnum).map((key) => {
      const enumData = valueEnum[key];
      const options: Values[] = [];
      Object.entries(enumData).map(([value, label]) => {
        if (value === 'true') {
          options.push({ label, value: true });
          return;
        }

        if (value === 'false') {
          options.push({ label, value: false });
          return;
        }

        if (Number(value)) {
          options.push({ label, value: Number(value) });
          return;
        }

        options.push({ label, value });
      });
      valueOptions[key] = options;
    });
    return valueOptions;
  };

  const valueOptions = enumToOptions(valueEnum) as ValueOptionsType;

  return (
    <ValueEnumContext.Provider value={{ valueEnum, valueOptions }}>
      {children}
    </ValueEnumContext.Provider>
  );
};
