import {
  zFormFieldsLogin,
  type FormFieldsLogin,
} from "@/features/schema/auth/schema";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DevnutButton } from "../DevnutButton";
import DevnutSection from "@/components/DevnutSection";
import { Form } from "../form/form";
import { FormField } from "../form/form-field";
import { FormFieldController } from "../form/form-field-controller";
import AuthTypography from "./AuthTypography";
import { DevnutToast } from "../DevnutToast";

export const ResetPasswordConfirmContent: React.FC = () => {
  // Detect mobile device
  const isMobile = useIsMobile();

  const { t } = useTranslation(["auth", "common"]);

  const title = t("auth:resetPasswordConfirm.title");
  const subtitle = t("auth:resetPasswordConfirm.subTitle");

  if (isMobile) {
    return (
      <>
        <div>
          <AuthTypography.Title title={title} />
          <AuthTypography.Subtitle subtitle={subtitle} />
        </div>
        <ResetPasswordConfirmForm />
      </>
    );
  }

  return (
    <>
      <div className="text-end max-w-[500px]">
        <AuthTypography.Title title={title} />
        <AuthTypography.Subtitle subtitle={subtitle} />
      </div>
      <ResetPasswordConfirmForm />
    </>
  );
};

const ResetPasswordConfirmForm = () => {
  const { t } = useTranslation(["auth", "common"]);
  const { resetPasswordWithOTP } = useAuth();

  const [isLoading, setIsLoading] = React.useState(false);
  const [searchParams] = useSearchParams();
  const [error, setError] = React.useState<string | null>(null);

  const token = searchParams.get("token");
  const navigate = useNavigate();

  //Utilizzo zod della login essendo presenti gli stessi campi e validazioni
  const form = useForm({
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    resolver: zodResolver(zFormFieldsLogin()),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Regola di lunghezza minima sempre visibile sotto il campo e collegata via aria-describedby
  // (WCAG 3.3.2). I field non collegano ancora `descriptionId`: lo passiamo qui, insieme all'id
  // dell'errore quando presente.
  const passwordId = React.useId();
  const passwordHintId = `${passwordId}-description`;
  const passwordDescribedBy = form.formState.errors.password
    ? `${passwordHintId} ${passwordId}-error`
    : passwordHintId;

  // Verifica che il token sia presente
  React.useEffect(() => {
    if (!token) {
      setError(t("auth:errorCode.invalidToken"));
    }
  }, [t, token]);

  React.useEffect(() => {
    if (error) {
      DevnutToast.error(t("common:errors.generic"), error);
    }
  }, [error, t]);

  const submitHandler: SubmitHandler<FormFieldsLogin> = async ({
    email,
    password,
  }) => {
    setError(null);

    if (!token) {
      setError(t("auth:errorCode.tokenMissing"));
      return;
    }

    try {
      const result = await resetPasswordWithOTP(token, password, email);

      if (result.success) {
        if (result.otpSent) {
          DevnutToast.success(
            t("common:success.label"),
            t("auth:successCode.passwordReset"),
          );

          setTimeout(() => {
            navigate("/two-factor");
          }, 1000);
        } else {
          navigate("/login");
        }
      } else {
        setError(result.error || t("auth:errorCode.failedPasswordReset"));
      }
    } catch (err: any) {
      setError(err.message || t("common:errors.generic"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form
      {...form}
      onSubmit={submitHandler}
      className="w-full max-w-[400px] text-center flex flex-col justify-center items-center md:px-[30px]"
    >
      <DevnutSection.Grid className="gap-8 place-items-center">
        <DevnutSection.Grid>
          {/* Errore (token o server) persistente inline, non solo nel toast (WCAG 3.3.1) */}
          {error && (
            <p role="alert" className="text-start text-sm text-destructive">
              {error}
            </p>
          )}

          <FormField label={t("auth:common.email.label")}>
            <FormFieldController
              name="email"
              autoComplete="username"
              type="email"
              className="font-semibold"
              containerProps={{ className: "flex flex-col items-start gap-2!" }}
            />
          </FormField>

          <FormField id={passwordId} label={t("auth:common.password.label")}>
            <FormFieldController
              name="password"
              autoComplete="new-password"
              type="password"
              className="font-semibold"
              containerProps={{ className: "flex flex-col items-start gap-2!" }}
              {...{ "aria-describedby": passwordDescribedBy }}
            />
            <p id={passwordHintId} className="mt-1 text-start text-sm text-muted-foreground">
              {t("auth:common.password.invalidLength")}
            </p>
          </FormField>
        </DevnutSection.Grid>

        <DevnutSection.Grid className="gap-2 place-items-center">
          <DevnutButton
            type="submit"
            variant="secondary"
            className="w-4/5 md:w-full"
            disabled={isLoading}
          >
            {t("common:buttons.values.enter")}
          </DevnutButton>
        </DevnutSection.Grid>
      </DevnutSection.Grid>
    </Form>
  );
};
