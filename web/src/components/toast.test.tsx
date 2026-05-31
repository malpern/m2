import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./toast";

function TestConsumer() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast("Success message")}>success</button>
      <button onClick={() => toast("Error message", "error")}>error</button>
      <button onClick={() => toast("Info message", "info")}>info</button>
    </div>
  );
}

describe("Toast", () => {
  it("renders a toast when triggered", async () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    await act(async () => {
      screen.getByText("success").click();
    });

    expect(screen.getByText("Success message")).toBeInTheDocument();
  });

  it("renders error and info toasts with correct role", async () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    await act(async () => {
      screen.getByText("error").click();
    });

    expect(screen.getByText("Error message")).toBeInTheDocument();
    // The toast container has role="status"
    const statusElements = screen.getAllByRole("status");
    expect(statusElements.length).toBeGreaterThan(0);
  });

  it("auto-dismisses after timeout", async () => {
    vi.useFakeTimers();

    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    await act(async () => {
      screen.getByText("success").click();
    });

    expect(screen.getByText("Success message")).toBeInTheDocument();

    // Fast-forward past the 3s auto-dismiss + 200ms exit animation
    await act(async () => {
      vi.advanceTimersByTime(3200);
    });

    expect(screen.queryByText("Success message")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("stacks multiple toasts", async () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    await act(async () => {
      screen.getByText("success").click();
      screen.getByText("error").click();
    });

    expect(screen.getByText("Success message")).toBeInTheDocument();
    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("throws when useToast is used outside provider", () => {
    function Bad() {
      useToast();
      return null;
    }

    expect(() => render(<Bad />)).toThrow(
      "useToast must be used within a ToastProvider"
    );
  });
});

describe("Toast with action button", () => {
  it("renders an action button when provided", async () => {
    const onClick = vi.fn();

    function ActionConsumer() {
      const toast = useToast();
      return (
        <button
          onClick={() =>
            toast("Session declined", {
              type: "info",
              action: { label: "Undo", onClick },
            })
          }
        >
          decline
        </button>
      );
    }

    render(
      <ToastProvider>
        <ActionConsumer />
      </ToastProvider>
    );

    await act(async () => {
      screen.getByText("decline").click();
    });

    expect(screen.getByText("Session declined")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
  });

  it("calls the action onClick and dismisses when action button is clicked", async () => {
    vi.useFakeTimers();
    const onClick = vi.fn();

    function ActionConsumer() {
      const toast = useToast();
      return (
        <button
          onClick={() =>
            toast("Session declined", {
              type: "info",
              duration: 5000,
              action: { label: "Undo", onClick },
            })
          }
        >
          decline
        </button>
      );
    }

    render(
      <ToastProvider>
        <ActionConsumer />
      </ToastProvider>
    );

    await act(async () => {
      screen.getByText("decline").click();
    });

    expect(screen.getByText("Undo")).toBeInTheDocument();

    await act(async () => {
      screen.getByText("Undo").click();
    });

    expect(onClick).toHaveBeenCalledTimes(1);

    // After clicking undo, the toast should start exiting (200ms animation)
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByText("Session declined")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("uses custom duration for undo toasts", async () => {
    vi.useFakeTimers();
    const onClick = vi.fn();

    function ActionConsumer() {
      const toast = useToast();
      return (
        <button
          onClick={() =>
            toast("Session declined", {
              type: "info",
              duration: 5000,
              action: { label: "Undo", onClick },
            })
          }
        >
          decline
        </button>
      );
    }

    render(
      <ToastProvider>
        <ActionConsumer />
      </ToastProvider>
    );

    await act(async () => {
      screen.getByText("decline").click();
    });

    // Should still be visible after 3s (default duration)
    await act(async () => {
      vi.advanceTimersByTime(3200);
    });

    expect(screen.getByText("Session declined")).toBeInTheDocument();

    // Should be gone after 5s + 200ms exit animation
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("Session declined")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("accepts options object with type only (backward compatible)", async () => {
    function OptionsConsumer() {
      const toast = useToast();
      return (
        <button onClick={() => toast("Typed message", { type: "error" })}>
          typed
        </button>
      );
    }

    render(
      <ToastProvider>
        <OptionsConsumer />
      </ToastProvider>
    );

    await act(async () => {
      screen.getByText("typed").click();
    });

    expect(screen.getByText("Typed message")).toBeInTheDocument();
  });

  it("does not render action button when none is provided", async () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    await act(async () => {
      screen.getByText("success").click();
    });

    expect(screen.getByText("Success message")).toBeInTheDocument();
    expect(screen.queryByText("Undo")).not.toBeInTheDocument();
  });
});
