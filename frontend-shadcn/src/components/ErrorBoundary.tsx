// src/components/ErrorBoundary.tsx
import apiClient from "@/api/client";
import { Result } from "@/components/Result";
import { Button } from "@/components/ui/button";
import { t } from "i18next";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { DevnutToast } from "./DevnutToast";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Se in questa finestra temporale si accumulano più errori della soglia,
// si tratta di un loop di remount (non di un errore isolato): mostriamo
// un fallback statico invece di continuare a rimontare i children.
const ERROR_WINDOW_MS = 10000;
const ERROR_THRESHOLD = 3;

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  private errorTimestamps: number[] = [];

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Errore catturato da ErrorBoundary:", error, errorInfo);

    const now = Date.now();
    this.errorTimestamps = [...this.errorTimestamps, now].filter(
      (t) => now - t < ERROR_WINDOW_MS,
    );
    const isLooping = this.errorTimestamps.length >= ERROR_THRESHOLD;

    // Mostra solo il toast
    DevnutToast.error(
      t("common:errorBoundary.toastTitle"),
      error.message || t("common:errorBoundary.toastDescription"),
      {
        label: t("common:buttons.values.reload"),
        onClick: () => window.location.reload(),
      },
    );

    // Invia al backend
    apiClient
      .post("/errors/log-error", {
        error: error.toString(),
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
      })
      .catch((err) => {
        console.error("Errore invio log al backend:", err);
      });

    if (isLooping) {
      // Blocca il remount continuo dei children: mostra il fallback
      this.setState({ hasError: true });
    }
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-8">
          <Result
            status="error"
            title={t("common:errorBoundary.title")}
            subTitle={t("common:errorBoundary.description")}
            extra={
              <Button onClick={() => window.location.reload()}>
                {t("common:buttons.values.reload")}
              </Button>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
