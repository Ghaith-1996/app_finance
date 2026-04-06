import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

import { ProfileForm } from "@/components/app/profile-form";
import { PreferencesProvider } from "@/components/providers/preferences-provider";

describe("ProfileForm legal links", () => {
  it("shows both Terms and Privacy links when legal acceptance is required", () => {
    render(
      <PreferencesProvider initialTheme="dark" initialLocale="en">
        <ProfileForm
          initialProfile={{ firstName: "", lastName: "", handle: "" }}
          title="Complete your profile"
          description="Finish setup."
          submitLabel="Continue"
          requireTerms
          onSubmit={async () => undefined}
        />
      </PreferencesProvider>,
    );

    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });
});
