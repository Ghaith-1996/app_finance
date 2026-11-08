import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotificationSettingsPanel } from "@/components/app/notification-settings-panel";

const preferences = {
  emailDigestEnabled: false,
  smsDigestEnabled: false,
  phoneNumber: "",
  criticalNewsAlertsEnabled: false,
  earningsReportAlertsEnabled: false,
  priceMoveAlertsEnabled: false,
  priceMoveThresholdPercent: 5,
  concentrationAlertsEnabled: false,
  concentrationThresholdPercent: 35,
};

describe("NotificationSettingsPanel", () => {

  it("submits the chosen channels and phone number", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });

    render(
      <NotificationSettingsPanel
        initialPreferences={preferences}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Email digest/i));
    fireEvent.click(screen.getByLabelText(/SMS digest/i));
    fireEvent.click(screen.getByLabelText(/Critical news/i));
    fireEvent.click(screen.getByLabelText(/Price move/i));
    fireEvent.change(screen.getByDisplayValue("5"), {
      target: { value: "7.5" },
    });
    fireEvent.change(screen.getByLabelText(/Phone number/i), {
      target: { value: "+14165551234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        emailDigestEnabled: true,
        smsDigestEnabled: true,
        phoneNumber: "+14165551234",
        criticalNewsAlertsEnabled: true,
        earningsReportAlertsEnabled: false,
        priceMoveAlertsEnabled: true,
        priceMoveThresholdPercent: 7.5,
        concentrationAlertsEnabled: false,
        concentrationThresholdPercent: 35,
      });
    });
  });
});

// Audit H2: the settings panel proves phone possession before SMS digests can be enabled.

function renderPanel(overrides: Partial<Parameters<typeof NotificationSettingsPanel>[0]> = {}) {
  const onSendCode = vi.fn().mockResolvedValue({ ok: true });
  const onConfirmCode = vi.fn().mockResolvedValue({ ok: true });
  render(
    <NotificationSettingsPanel
      initialPreferences={{ ...preferences, phoneNumber: "+14165551234" }}
      onSubmit={vi.fn().mockResolvedValue({ ok: true })}
      onSendCode={onSendCode}
      onConfirmCode={onConfirmCode}
      {...overrides}
    />,
  );
  return { onSendCode, onConfirmCode };
}

describe("NotificationSettingsPanel phone verification", () => {
  it("sends a code, confirms it, then shows the number as verified", async () => {
    const { onSendCode, onConfirmCode } = renderPanel();

    expect(screen.getByText(/Not verified/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(screen.getByLabelText("Verification code")).toBeTruthy());
    expect(onSendCode).toHaveBeenCalledWith("+14165551234");

    const verify = screen.getByRole("button", { name: "Verify" }) as HTMLButtonElement;
    expect(verify.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(verify);

    await waitFor(() => expect(screen.getByText("Verified for SMS digests.")).toBeTruthy());
    expect(onConfirmCode).toHaveBeenCalledWith("+14165551234", "123456");
  });

  it("shows a rejected code without marking the number verified", async () => {
    renderPanel({ onConfirmCode: vi.fn().mockResolvedValue({ ok: false, error: "That code is not correct." }) });

    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => screen.getByLabelText("Verification code"));
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(screen.getByText("That code is not correct.")).toBeTruthy());
    expect(screen.queryByText("Verified for SMS digests.")).toBeNull();
  });

  it("R9: an unconfirmed send keeps the code field usable, without another SMS", async () => {
    const { onConfirmCode } = renderPanel({
      onSendCode: vi.fn().mockResolvedValue({
        ok: false,
        error: "We could not confirm the code was sent. If it arrives within a few minutes you can still use it.",
        codeMayArrive: true,
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(screen.getByText(/could not confirm the code was sent/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(screen.getByText("Verified for SMS digests.")).toBeTruthy());
    expect(onConfirmCode).toHaveBeenCalledWith("+14165551234", "123456");
  });

  it("R9: a resend refused during the cooldown (e.g. after a reload) still lets the earlier code be entered", async () => {
    renderPanel({
      onSendCode: vi.fn().mockResolvedValue({
        ok: false,
        error: "Please wait 42 seconds before requesting another code.",
        retryAfterSeconds: 42,
        codeMayArrive: true,
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(screen.getByLabelText("Verification code")).toBeTruthy());
  });

  it("a definite send failure does not offer the code field", async () => {
    renderPanel({
      onSendCode: vi.fn().mockResolvedValue({ ok: false, error: "We could not send a code to that number." }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(screen.getByText(/could not send a code/)).toBeTruthy());
    expect(screen.queryByLabelText("Verification code")).toBeNull();
  });

  it("treats a changed number as unverified again", () => {
    renderPanel({ initialVerifiedPhoneNumber: "+14165551234" });
    expect(screen.getByText("Verified for SMS digests.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Phone number/i), { target: { value: "+14165550000" } });
    expect(screen.queryByText("Verified for SMS digests.")).toBeNull();
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy();
  });
});
