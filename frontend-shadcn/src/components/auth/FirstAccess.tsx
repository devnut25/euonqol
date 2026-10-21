import {
  zFormFieldsFirstAccess,
  type FormFieldsFirstAccess,
} from "@/features/schema/auth/schema";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { DevnutButton } from "../DevnutButton";
import DevnutSection from "@/components/DevnutSection";
import { Form } from "../form/form";
import { FormField } from "../form/form-field";
import { FormFieldController } from "../form/form-field-controller";
import AuthTypography from "./AuthTypography";
import { DevnutToast } from "../DevnutToast";

export const FirstAccessContent: React.FC = () => {
  const isMobile = useIsMobile();

  const { t } = useTranslation(["auth", "common"]);

  const title = t("auth:firstAccess.title");
  const subtitle = t("auth:firstAccess.subTitle");

  if (isMobile) {
    return (
      <>
        <div>
          <AuthTypography.Title title={title} />
          <AuthTypography.Subtitle subtitle={subtitle} />
        </div>
        <FirstAccessForm />
      </>
    );
  }

  return (
    <>
      <div className="text-end">
        <AuthTypography.Title title={title} />
        <AuthTypography.Subtitle subtitle={subtitle} />
      </div>
      <FirstAccessForm />
    </>
  );
};

const FirstAccessForm = () => {
  const { t } = useTranslation(["auth", "common"]);
  const { updatePassword } = useAuth();

  const [loading, setLoading] = React.useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { email } = location.state || {};

  const form = useForm({
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    resolver: zodResolver(zFormFieldsFirstAccess()),
    defaultValues: {
      email: email || "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Toast sempre; se l'errore riguarda i dati inseriti resta anche inline sul campo
  // (role="alert" + aria-invalid) con focus (WCAG 3.3.1). Errori di connessione/server
  // non sono legati a un campo: solo toast.
  const showError = (message: string, onField: boolean) => {
    DevnutToast.error(t("common:errors.generic"), message);
    if (onField) {
      form.setError("newPassword", { type: "server", message }, { shouldFocus: true });
    }
  };

  // Regola di lunghezza minima sempre visibile sotto il campo e collegata via aria-describedby
  // (WCAG 3.3.2). I field non collegano ancora `descriptionId`: lo passiamo qui, insieme all'id
  // dell'errore quando presente.
  const newPasswordId = React.useId();
  const newPasswordHintId = `${newPasswordId}-description`;
  const newPasswordDescribedBy = form.formState.errors.newPassword
    ? `${newPasswordHintId} ${newPasswordId}-error`
    : newPasswordHintId;

  const submitHandler: SubmitHandler<FormFieldsFirstAccess> = async ({
    email,
    newPassword,
    confirmPassword,
  }) => {
    setLoading(true);

    try {
      const result = await updatePassword(email, newPassword, confirmPassword);

      if (result.success) {
        if (result.otpSent) {
          DevnutToast.success(t("auth:successCode.passwordUpdated"));

          setTimeout(() => {
            navigate("/two-factor");
          }, 1000);
        } else {
          DevnutToast.success(t("auth:successCode.passwordUpdated"));

          setTimeout(() => {
            navigate("/two-factor");
          }, 1000);
        }
      } else {
        showError(
          result.error || t("auth:errorCode.failedPasswordReset"),
          !result.isServerError
        );
      }
    } catch (err: any) {
      showError(err.message || t("auth:errorCode.failedLogin"), false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form
      {...form}
      onSubmit={submitHandler}
      className="w-full max-w-[400px] text-center md:px-[30px]"
    >
      <DevnutSection.Grid className="gap-8 place-items-center">
        <FormField label={t("auth:common.email.label")}>
          <FormFieldController
            name="email"
            autoComplete="username"
            type="email"
            className="font-semibold"
            containerProps={{ className: "flex flex-col items-start gap-2!" }}
          />
        </FormField>

        <FormField id={newPasswordId} label={t("auth:common.password.label")}>
          <FormFieldController
            name="newPassword"
            autoComplete="new-password"
            type="password"
            className="font-semibold"
            containerProps={{ className: "flex flex-col items-start gap-2!" }}
            {...{ "aria-describedby": newPasswordDescribedBy }}
          />
          <p id={newPasswordHintId} className="mt-1 text-start text-sm text-muted-foreground">
            {t("auth:common.password.invalidLength")}
          </p>
        </FormField>

        <FormField label={t("auth:common.confirmPassword.label")}>
          <FormFieldController
            name="confirmPassword"
            autoComplete="new-password"
            type="password"
            className="font-semibold"
            containerProps={{ className: "flex flex-col items-start gap-2!" }}
          />
        </FormField>

        <DevnutButton
          type="submit"
          variant="secondary"
          className="w-4/5 md:w-full"
          loading={loading}
        >
          {t("common:buttons.values.save")}
        </DevnutButton>
      </DevnutSection.Grid>
    </Form>
  );
};
