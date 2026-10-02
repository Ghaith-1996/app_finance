import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotificationSettingsPanel } from "@/components/app/notification-settings-panel";

// Audit H2: the settings panel proves phone possession before SMS digests can be enabled.

const preferences = {
  emailDigestEnabled: false,
  smsDigestEnabled: false,
  phoneNumber: "+14165551234",
  criticalNewsAlertsEnabled: false,
  earningsReportAlertsEnabled: false,
  priceMoveAlertsEnabled: false,
  priceMoveThresholdPercent: 5,
  concentrationAlertsEnabled: false,
  concentrationThresholdPercent: 35,
};

function renderPanel(overrides: Partial<Parameters<typeof NotificationSettingsPanel>[0]> = {}) {
  const onSendCode = vi.fn().mockResolvedValue({ ok: true });
  const onConfirmCode = vi.fn().mockResolvedValue({ ok: true });
  render(
    <NotificationSettingsPanel
      initialPreferences={preferences}
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

  it("treats a changed number as unverified again", () => {
    renderPanel({ initialVerifiedPhoneNumber: "+14165551234" });
    expect(screen.getByText("Verified for SMS digests.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Phone number/i), { target: { value: "+14165550000" } });
    expect(screen.queryByText("Verified for SMS digests.")).toBeNull();
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy();
  });
});
