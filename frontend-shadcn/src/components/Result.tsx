import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { CheckCircle, XCircle, AlertTriangle, Info } from "lucide-react";
import type { ReactNode } from "react";

export type ResultStatus = "success" | "error" | "info" | "warning";

export interface ResultProps {
  status?: ResultStatus;
  title?: string;
  subTitle?: string;
  extra?: ReactNode;
}

const STATUS_MAP = {
  success: {
    icon: CheckCircle,
    color: "text-green-600",
  },
  error: {
    icon: XCircle,
    color: "text-red-500",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-yellow-700",
  },
  info: {
    icon: Info,
    color: "text-blue-500",
  },
};

export function Result({
  status = "info",
  title,
  subTitle,
  extra,
}: ResultProps) {
  const Icon = STATUS_MAP[status].icon;
  const color = STATUS_MAP[status].color;

  return (
    <Card
      role={status === "error" || status === "warning" ? "alert" : undefined}
      className="p-8 text-center"
    >
      <CardHeader>
        <div className="flex justify-center mb-4">
          <Icon aria-hidden="true" className={`h-16 w-16 ${color}`} />
        </div>

        {title && <CardTitle className="text-2xl">{title}</CardTitle>}

        {subTitle && (
          <CardDescription className="mt-2">{subTitle}</CardDescription>
        )}
      </CardHeader>

      {extra && (
        <CardFooter className="flex justify-center mt-6 gap-4">
          {extra}
        </CardFooter>
      )}
    </Card>
  );
}
