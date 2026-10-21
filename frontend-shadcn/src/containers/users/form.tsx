import DevnutSection from "@/components/DevnutSection";
import { Form } from "@/components/form/form";
import { FormField } from "@/components/form/form-field";
import { FormFieldController } from "@/components/form/form-field-controller";
import type { FormProps } from "@/components/FormContainer";
import {
  zFormFieldsUserCreate,
  zFormFieldsUserEdit,
  type FormFieldsUser,
} from "@/features/schema/user/schema";
import { useValueEnum } from "@/hooks/useValueEnum";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

export const UserForm = ({ initialValues, ...props }: FormProps) => {
  const { t } = useTranslation(["users"]);
  const { valueOptions } = useValueEnum();

  const isEdit = !!initialValues?.id;

  const form = useForm<FormFieldsUser>({
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    resolver: zodResolver(isEdit ? zFormFieldsUserEdit() : zFormFieldsUserCreate()),
    defaultValues: initialValues,
  });

  return (
    <>
      <Form
        {...form}
        {...props}
        initialValues={initialValues}
        className="w-full text-center flex flex-col justify-center items-center gap-12"
      >
        <DevnutSection.Grid className="gap-8 place-items-center">
          <DevnutSection.Grid>
            <FormField label={t("common.first_name.label")} required>
              <FormFieldController
                name="first_name"
                type="text"
                placeholder={t("common.first_name.label")}
              />
            </FormField>
            <FormField label={t("common.last_name.label")} required>
              <FormFieldController
                name="last_name"
                type="text"
                placeholder={t("common.last_name.label")}
              />
            </FormField>
            <FormField label={t("common.email.label")} required>
              <FormFieldController
                name="email"
                type="email"
                placeholder={t("common.email.label")}
              />
            </FormField>
            {!isEdit && (
              <FormField label={t("common.password.label")} required>
                <FormFieldController
                  name="password"
                  type="password"
                  placeholder={t("common.password.label")}
                />
              </FormField>
            )}
            <FormField label={t("common.user_type.label")} required>
              <FormFieldController
                type="select"
                name="user_type"
                placeholder={t("common.user_type.label")}
                options={valueOptions.userTypes}
              />
            </FormField>
            <FormField label={t("common.is_active.label")} required>
              <FormFieldController
                type="select"
                name="is_active"
                placeholder={t("common.is_active.label")}
                options={valueOptions.active}
              />
            </FormField>
          </DevnutSection.Grid>
        </DevnutSection.Grid>
      </Form>
    </>
  );
};
