import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockSendDirectMessage = vi.fn();
vi.mock("@/app/clients/actions", () => ({
  sendDirectMessage: (...args: unknown[]) => mockSendDirectMessage(...args),
}));

import { RenewalPrompt } from "./renewal-prompt";

beforeEach(() => {
  vi.clearAllMocks();
  mockSendDirectMessage.mockResolvedValue(undefined);
});

/**
 * The prompt renders in two places (#4) — the client detail page and the
 * packages list on /reports. The packages list sits behind a tab, so these
 * cover the component itself rather than either page.
 */
describe("RenewalPrompt", () => {
  it("offers the prompt when a client can be texted", () => {
    render(
      <RenewalPrompt clientId={1} clientName="Reggie Jackson" remaining={2} hasPhone />,
    );
    expect(screen.getByRole("button", { name: "Ask to re-up" })).toBeEnabled();
  });

  it("is disabled, with a reason, for a client with no phone number", () => {
    // Since #221 this is a real and common state, so the button must explain
    // itself rather than simply doing nothing when clicked.
    render(
      <RenewalPrompt
        clientId={1}
        clientName="Reggie Jackson"
        remaining={0}
        hasPhone={false}
      />,
    );
    const button = screen.getByRole("button", { name: "Ask to re-up" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringContaining("No phone number"));
  });

  it("opens with the drafted message, editable", () => {
    render(
      <RenewalPrompt clientId={1} clientName="Reggie Jackson" remaining={2} hasPhone />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask to re-up" }));

    const textarea = screen.getByLabelText("Message") as HTMLTextAreaElement;
    expect(textarea.value).toBe(
      "Hey Reggie, you've got 2 sessions left on your package. Want to re-up?",
    );

    fireEvent.change(textarea, { target: { value: "Custom wording" } });
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("Custom wording");
  });

  it("sends the edited text, not the original draft", async () => {
    render(
      <RenewalPrompt clientId={7} clientName="Reggie Jackson" remaining={1} hasPhone />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask to re-up" }));
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "  Rewritten by Matt  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send text" }));

    await vi.waitFor(() => {
      expect(mockSendDirectMessage).toHaveBeenCalledWith(7, "Rewritten by Matt");
    });
  });

  it("will not send an empty message", () => {
    render(
      <RenewalPrompt clientId={1} clientName="Reggie Jackson" remaining={1} hasPhone />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask to re-up" }));
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "Send text" })).toBeDisabled();
  });
});
