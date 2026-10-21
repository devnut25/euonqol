import { Card } from "@/components/ui/card";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import type { ResultProps } from "./Result";
import { Result } from "./Result";

interface ApiErrorProps extends ResultProps {
  error?: AxiosError<any>;
}

export const ApiError = ({ error, ...props }: ApiErrorProps) => {
  const { t } = useTranslation(["common"]);

  return (
    <Card className="p-0">
      <Result
        status="warning"
        title={`Error ${error?.response?.status}`}
        subTitle={error?.response?.data?.message ?? t("errors.api")}
        {...props}
      />
    </Card>
  );
};
