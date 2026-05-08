import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotificationSettingsPanel } from "@/components/app/notification-settings-panel";

describe("NotificationSettingsPanel", () => {
  it("renders the daily digest controls and fixed timing copy", () => {
    render(
      <NotificationSettingsPanel
        initialPreferences={{
          emailDigestEnabled: false,
          smsDigestEnabled: false,
          phoneNumber: "",
        }}
        onSubmit={async () => ({ ok: true })}
      />,
    );

    expect(screen.getByText("Morning digest")).toBeInTheDocument();
    expect(screen.getByText(/Sent daily at 9:00 AM Eastern/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email digest/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/SMS digest/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Phone number/i)).toBeInTheDocument();
  });

  it("submits the chosen channels and phone number", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });

    render(
      <NotificationSettingsPanel
        initialPreferences={{
          emailDigestEnabled: false,
          smsDigestEnabled: false,
          phoneNumber: "",
        }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Email digest/i));
    fireEvent.click(screen.getByLabelText(/SMS digest/i));
    fireEvent.change(screen.getByLabelText(/Phone number/i), {
      target: { value: "+14165551234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        emailDigestEnabled: true,
        smsDigestEnabled: true,
        phoneNumber: "+14165551234",
      });
    });
  });
});
