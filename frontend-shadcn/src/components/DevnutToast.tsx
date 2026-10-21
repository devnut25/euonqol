import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { t } from "i18next";
import { toast as sonnerToast } from "sonner";

type ToastType = "success" | "error" | "warning" | "info";

interface CustomToastProps {
  id: string | number;
  type: ToastType;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const toastConfig = {
  success: {
    icon: CircleCheckIcon,
    bgColor: "bg-green-50 dark:bg-green-950/20",
    borderColor: "border-green-200 dark:border-green-800",
    iconColor: "text-green-600 dark:text-green-400",
    titleColor: "text-green-900 dark:text-green-100",
    descriptionColor: "text-green-700 dark:text-green-300",
    buttonBg: "bg-green-100 dark:bg-green-900/40",
    buttonText: "text-green-700 dark:text-green-300",
    buttonHover: "hover:bg-green-200 dark:hover:bg-green-900/60",
  },
  error: {
    icon: OctagonXIcon,
    bgColor: "bg-red-50 dark:bg-red-950/20",
    borderColor: "border-red-200 dark:border-red-800",
    iconColor: "text-red-600 dark:text-red-400",
    titleColor: "text-red-900 dark:text-red-100",
    descriptionColor: "text-red-700 dark:text-red-300",
    buttonBg: "bg-red-100 dark:bg-red-900/40",
    buttonText: "text-red-700 dark:text-red-300",
    buttonHover: "hover:bg-red-200 dark:hover:bg-red-900/60",
  },
  warning: {
    icon: TriangleAlertIcon,
    bgColor: "bg-yellow-50 dark:bg-yellow-950/20",
    borderColor: "border-yellow-200 dark:border-yellow-800",
    iconColor: "text-yellow-700 dark:text-yellow-400",
    titleColor: "text-yellow-900 dark:text-yellow-100",
    descriptionColor: "text-yellow-700 dark:text-yellow-300",
    buttonBg: "bg-yellow-100 dark:bg-yellow-900/40",
    buttonText: "text-yellow-700 dark:text-yellow-300",
    buttonHover: "hover:bg-yellow-200 dark:hover:bg-yellow-900/60",
  },
  info: {
    icon: InfoIcon,
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
    borderColor: "border-blue-200 dark:border-blue-800",
    iconColor: "text-blue-600 dark:text-blue-400",
    titleColor: "text-blue-900 dark:text-blue-100",
    descriptionColor: "text-blue-700 dark:text-blue-300",
    buttonBg: "bg-blue-100 dark:bg-blue-900/40",
    buttonText: "text-blue-700 dark:text-blue-300",
    buttonHover: "hover:bg-blue-200 dark:hover:bg-blue-900/60",
  },
};

function CustomToastComponent(props: CustomToastProps) {
  const { title, description, action, id, type } = props;
  const config = toastConfig[type];
  const Icon = config.icon;

  return (
    <div className="w-full flex justify-center">
      <div
        role={type === "error" || type === "warning" ? "alert" : "status"}
        className={`
        flex items-start justify-center gap-3 rounded-lg border shadow-lg p-4
        w-[min(356px,calc(100vw-2rem))]
        ${config.bgColor} ${config.borderColor}
      `}
      >
        <div className={`shrink-0 ${config.iconColor}`}>
          <Icon aria-hidden="true" className="size-5" />
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${config.titleColor}`}>
            {title}
          </p>
          {description && (
            <p className={`mt-1 text-sm ${config.descriptionColor}`}>
              {description}
            </p>
          )}
        </div>

        {action && (
          <div className="shrink-0">
            <button
              type="button"
              className={`
              rounded-md px-2.5 py-1.5 text-xs font-semibold
              transition-colors
              ${config.buttonBg} ${config.buttonText} ${config.buttonHover}
            `}
              onClick={() => {
                action.onClick();
                sonnerToast.dismiss(id);
              }}
            >
              {action.label}
            </button>
          </div>
        )}

        <button
          type="button"
          aria-label={t("common:toast.close")}
          className={`shrink-0 rounded-md p-1 transition-colors ${config.iconColor} hover:bg-black/5 dark:hover:bg-white/10`}
          onClick={() => sonnerToast.dismiss(id)}
        >
          <XIcon aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}

// Funzioni helper per ogni tipo
function customToast(
  type: ToastType,
  title: string,
  description?: string,
  action?: CustomToastProps["action"]
) {
  // Tempo di lettura adeguato (WCAG 2.2.1): errori e avvisi restano più a lungo,
  // le notifiche con un'azione restano finché l'utente non le chiude.
  const duration = action
    ? Infinity
    : type === "error"
      ? 12000
      : type === "warning"
        ? 8000
        : 6000;

  return sonnerToast.custom(
    (id) => (
      <CustomToastComponent
        id={id}
        type={type}
        title={title}
        description={description}
        action={action}
      />
    ),
    { duration }
  );
}

function successToast(
  title: string,
  description?: string,
  action?: CustomToastProps["action"]
) {
  return customToast("success", title, description, action);
}

function errorToast(
  title: string,
  description?: string,
  action?: CustomToastProps["action"]
) {
  return customToast("error", title, description, action);
}

function warningToast(
  title: string,
  description?: string,
  action?: CustomToastProps["action"]
) {
  return customToast("warning", title, description, action);
}

function infoToast(
  title: string,
  description?: string,
  action?: CustomToastProps["action"]
) {
  return customToast("info", title, description, action);
}

const DevnutToast = {
  success: successToast,
  error: errorToast,
  warning: warningToast,
  info: infoToast,
};

export { DevnutToast };
