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
