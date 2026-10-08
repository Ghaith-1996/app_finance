import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ModalDialog } from "@/components/ui/modal-dialog";

// Audit F13: dialogs take focus, trap Tab/Shift+Tab, close on Escape, inert the page,
// and give focus back to the trigger.

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <button type="button">Page button</button>
      {open ? (
        <ModalDialog label="Test dialog" onClose={() => setOpen(false)}>
          <button type="button">First</button>
          <input aria-label="Middle" />
          <button type="button" onClick={() => setOpen(false)}>
            Last
          </button>
        </ModalDialog>
      ) : null}
    </div>
  );
}

describe("ModalDialog", () => {
  it("moves focus in, traps Tab in both directions, and closes on Escape restoring focus", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    trigger.focus();

    await act(async () => {
      fireEvent.click(trigger);
    });

    const dialog = screen.getByRole("dialog", { name: "Test dialog" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    expect(document.activeElement).toBe(first);

    // Shift+Tab from the first element wraps to the last.
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    // Tab from the last element wraps to the first.
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    // Background content is inert while open.
    const pageRoot = trigger.closest("body > div");
    expect(pageRoot).toHaveAttribute("inert");

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pageRoot).not.toHaveAttribute("inert");
    expect(document.activeElement).toBe(trigger);
  });
});
