import {
  zFormFieldsLoginVerify,
  type FormFieldsLoginVerify,
} from "@/features/schema/auth/schema";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { DevnutButton } from "../DevnutButton";
import DevnutSection from "@/components/DevnutSection";
import { Form } from "../form/form";
import { FormField } from "../form/form-field";
import { FormFieldController } from "../form/form-field-controller";
import AuthTypography from "./AuthTypography";
import { DevnutToast } from "../DevnutToast";

export const TwoFactorContent: React.FC = () => {
  const { t } = useTranslation(["auth", "common"]);

  // Detect mobile device
  const isMobile = useIsMobile();

  const title = t("auth:twoFactor.title");
  const subtitle = t("auth:twoFactor.subTitle");

  if (isMobile) {
    return (
      <>
        <div>
          <AuthTypography.Title title={title} />
          <AuthTypography.Subtitle subtitle={subtitle} />
        </div>
        <TwoFactorForm />
      </>
    );
  }

  return (
    <>
      <div className="text-end">
        <AuthTypography.Title title={title} />
        <AuthTypography.Subtitle subtitle={subtitle} />
      </div>
      <TwoFactorForm />
    </>
  );
};

const TwoFactorForm = () => {
  const { t } = useTranslation(["auth", "common"]);
  const { verifyOTP, resendOTP } = useAuth();

  const navigate = useNavigate();

  const [loading, setLoading] = React.useState(false);
  const [resendLoading, setResendLoading] = React.useState(false);
  const [resendSuccess, setResendSuccess] = React.useState(false);
  const [countdown, setCountdown] = React.useState(0);

  // Costanti per localStorage
  const STORAGE_KEY = "otp_resend_cooldown";
  const COOLDOWN_SECONDS = 60;

  // Verifica il token prima di tutto
  React.useEffect(() => {
    const tempToken = sessionStorage.getItem("temp_session_token");
    if (!tempToken) {
      // Pulisci anche il countdown se non c'è token
      localStorage.removeItem(STORAGE_KEY);
      navigate("/login", { replace: true });
    }
  }, [navigate, STORAGE_KEY]);

  // Inizializza countdown dal localStorage
  React.useEffect(() => {
    const storedTimestamp = localStorage.getItem(STORAGE_KEY);

    if (storedTimestamp) {
      const expiryTime = parseInt(storedTimestamp);
      const now = Date.now();
      const remainingTime = Math.ceil((expiryTime - now) / 1000);

      if (remainingTime > 0) {
        setCountdown(remainingTime);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [STORAGE_KEY]);

  // Gestisci countdown
  React.useEffect(() => {
    if (countdown <= 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        const newValue = prev - 1;
        if (newValue <= 0) {
          localStorage.removeItem(STORAGE_KEY);
          return 0;
        }
        return newValue;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown, STORAGE_KEY]);

  React.useEffect(() => {
    if (resendSuccess) {
      DevnutToast.success(t("common:success.label"), t("auth:successCode.otpResent"));
      setResendSuccess(false);
    }
  }, [resendSuccess, t]);

  const form = useForm({
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    resolver: zodResolver(zFormFieldsLoginVerify()),
    defaultValues: {
      otp: "",
    },
  });

  // Toast sempre; se l'errore riguarda il codice inserito resta anche inline sul campo OTP
  // (role="alert" + aria-invalid) con focus (WCAG 3.3.1). Errori di connessione/server e del
  // reinvio non sono legati al campo: solo toast.
  const showError = (message: string, onField: boolean) => {
    DevnutToast.error(t("common:errors.generic"), message);
    if (onField) {
      form.setError("otp", { type: "server", message }, { shouldFocus: true });
    }
  };

  const submitHandler: SubmitHandler<FormFieldsLoginVerify> = async ({
    otp,
  }) => {
    try {
      setLoading(true);
      const result = await verifyOTP(otp);

      if (result.success) {
        DevnutToast.success(t("auth:successCode.otpVerified"));

        // Pulisci tutto al login riuscito
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem("temp_session_token");

        setTimeout(() => {
          navigate("/");
        }, 1000);
      } else {
        showError(
          result.error || t("auth:errorCode.otpNotValid"),
          !result.isServerError
        );
      }
    } catch (err: any) {
      showError(err.message || t("common:errors.generic"), false);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setResendSuccess(false);

    try {
      const result = await resendOTP();

      if (result.success) {
        setResendSuccess(true);

        // Salva timestamp nel localStorage
        const expiryTime = Date.now() + COOLDOWN_SECONDS * 1000;
        localStorage.setItem(STORAGE_KEY, expiryTime.toString());

        setCountdown(COOLDOWN_SECONDS);
      } else {
        showError(result.error || t("auth:errorCode.otpResend"), false);
      }
    } catch (err: any) {
      showError(err.message || t("common:errors.generic"), false);
      setTimeout(() => {
        navigate("/");
      }, 1000);
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <Form
      {...form}
      onSubmit={submitHandler}
      className={"w-full max-w-[400px] text-center md:px-[30px]"}
    >
      <DevnutSection.Grid className="gap-8 place-items-center">
        <FormField>
          <FormFieldController
            type="otp"
            name="otp"
            size="lg"
            maxLength={6}
            className="font-semibold"
            autoFocus
          />
        </FormField>

        <DevnutSection.Grid className="gap-2 place-items-center">
          <DevnutButton
            type="submit"
            variant="secondary"
            className="w-4/5 md:w-full"
          >
            {t("common:buttons.values.enter")}
          </DevnutButton>

          <DevnutButton
            type="button"
            variant="link"
            className="w-4/5 md:w-full"
            loading={loading || resendLoading}
            onClick={handleResend}
            disabled={resendLoading || countdown > 0}
          >
            {resendLoading
              ? t("auth:common.otp.sending")
              : countdown > 0
                ? `${t("auth:common.otp.newCodeRequest")} (${countdown}s)`
                : t("auth:common.otp.newCodeRequest")}
          </DevnutButton>
        </DevnutSection.Grid>
      </DevnutSection.Grid>
    </Form>
  );
};
