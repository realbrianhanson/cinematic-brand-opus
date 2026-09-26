// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ insert: vi.fn(), toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mock.toast }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: mock.insert,
      select: () => ({
        eq: () => ({
          order: () => ({ limit: async () => ({ data: [], error: null }) }),
        }),
      }),
    }),
  },
}));
import BriansNotesWidget from "../BriansNotesWidget";
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
it("preserves text and topic changed while an earlier note saves", async () => {
  let finish: (value: { error: null }) => void = () => {};
  mock.insert.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<BriansNotesWidget />);
  fireEvent.change(screen.getByLabelText("Expert note"), {
    target: { value: "First note" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  fireEvent.change(screen.getByLabelText("Expert note"), {
    target: { value: "My next note" },
  });
  fireEvent.change(screen.getByLabelText("Note topic"), {
    target: { value: "ai_tools" },
  });
  await act(async () => {
    finish({ error: null });
  });
  expect(
    (screen.getByLabelText("Expert note") as HTMLTextAreaElement).value,
  ).toBe("My next note");
  expect((screen.getByLabelText("Note topic") as HTMLSelectElement).value).toBe(
    "ai_tools",
  );
  expect(mock.insert).toHaveBeenCalledExactlyOnceWith({
    note: "First note",
    topic_hint: null,
  });
});

it("retains the selected topic when only the next note text changes", async () => {
  let finish: (value: { error: null }) => void = () => {};
  mock.insert.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<BriansNotesWidget />);
  fireEvent.change(screen.getByLabelText("Expert note"), {
    target: { value: "First note" },
  });
  fireEvent.change(screen.getByLabelText("Note topic"), {
    target: { value: "ai_tools" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  fireEvent.change(screen.getByLabelText("Expert note"), {
    target: { value: "Second observation" },
  });
  await act(async () => {
    finish({ error: null });
  });
  expect((screen.getByLabelText("Note topic") as HTMLSelectElement).value).toBe(
    "ai_tools",
  );
  expect(
    (screen.getByLabelText("Expert note") as HTMLTextAreaElement).value,
  ).toBe("Second observation");
});
