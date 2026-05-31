"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type ToastType = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  type?: ToastType;
  action?: ToastAction;
  duration?: number;
}

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting: boolean;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (message: string, typeOrOptions?: ToastType | ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const toast = useCallback(
    (message: string, typeOrOptions: ToastType | ToastOptions = "success") => {
      const id = ++nextId;
      let type: ToastType;
      let action: ToastAction | undefined;
      let duration: number;

      if (typeof typeOrOptions === "string") {
        type = typeOrOptions;
        action = undefined;
        duration = 3000;
      } else {
        type = typeOrOptions.type ?? "success";
        action = typeOrOptions.action;
        duration = typeOrOptions.duration ?? 3000;
      }

      setToasts((prev) => [...prev, { id, message, type, exiting: false, action }]);

      const timer = setTimeout(() => {
        dismiss(id);
        timersRef.current.delete(id);
      }, duration);
      timersRef.current.set(id, timer);

      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  return (
    <ToastContext value={{ toast, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[300] flex flex-col-reverse gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext>
  );
}

const TYPE_STYLES: Record<ToastType, string> = {
  success:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  error:
    "border-red-500/30 bg-red-500/10 text-red-300",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-300",
};

const TYPE_ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <svg
      className="w-4 h-4 shrink-0"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  ),
  error: (
    <svg
      className="w-4 h-4 shrink-0"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
    </svg>
  ),
  info: (
    <svg
      className="w-4 h-4 shrink-0"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
    </svg>
  ),
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-md transition-all duration-200 ${
        TYPE_STYLES[toast.type]
      } ${
        toast.exiting
          ? "translate-x-full opacity-0"
          : "translate-x-0 opacity-100 animate-in slide-in-from-right-full"
      }`}
      role="status"
      aria-live="polite"
    >
      {TYPE_ICONS[toast.type]}
      <span>{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick();
            onDismiss();
          }}
          className="ml-1 font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}

export function useToast(): (message: string, typeOrOptions?: ToastType | ToastOptions) => number {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx.toast;
}

export function useToastDismiss(): (id: number) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToastDismiss must be used within a ToastProvider");
  }
  return ctx.dismiss;
}

export type { ToastAction, ToastOptions };
