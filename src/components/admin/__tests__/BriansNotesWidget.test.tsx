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
const mock = vi.hoisted(() => ({
  insert: vi.fn(),
  toast: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mock.toast }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: mock.insert,
      select: () => ({
        eq: (_key: string, id: string) => ({
          order: () => ({ limit: async () => ({ data: [], error: null }) }),
          maybeSingle: () => mock.read(id),
        }),
      }),
    }),
  },
}));
import BriansNotesWidget from "../BriansNotesWidget";
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mock.read.mockResolvedValue({ data: null, error: null });
});
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
    id: expect.any(String),
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

it("reconciles a timed-out insert that committed later instead of creating a second note", async () => {
  let finish: (value: { error: null }) => void = () => {};
  mock.insert.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<BriansNotesWidget />);
  fireEvent.change(screen.getByLabelText("Expert note"), {
    target: { value: "One observation" },
  });
  vi.useFakeTimers();
  try {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20001);
    });
    const submitted = mock.insert.mock.calls[0][0];
    expect(submitted.id).toEqual(expect.any(String));
    mock.read.mockResolvedValue({ data: submitted, error: null });
    await act(async () => {
      finish({ error: null });
    });
    expect(mock.toast).not.toHaveBeenCalledWith({ title: "Note saved" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(mock.insert).toHaveBeenCalledOnce();
    expect(mock.read).toHaveBeenCalledWith(submitted.id);
    expect(mock.toast).toHaveBeenCalledWith({ title: "Note saved" });
    expect(
      (screen.getByLabelText("Expert note") as HTMLTextAreaElement).value,
    ).toBe("");
  } finally {
    vi.useRealTimers();
  }
});
it("reuses the note ID when the original insert commits during a retry and preserves new typing", async () => {
  let finish: (value: { error: null }) => void = () => {};
  let finishRetry: (value: { error: { code: string } }) => void = () => {};
  const rows = new Map<
    string,
    { id: string; note: string; topic_hint: string | null }
  >();
  mock.insert
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRetry = resolve;
        }),
    );
  mock.read.mockImplementation(async (id: string) => ({
    data: rows.get(id) || null,
    error: null,
  }));
  render(<BriansNotesWidget />);
  fireEvent.change(screen.getByLabelText("Expert note"), {
    target: { value: "One observation" },
  });
  vi.useFakeTimers();
  try {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20001);
    });
    const submitted = mock.insert.mock.calls[0][0];
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(mock.insert.mock.calls[1][0]).toEqual(submitted);
    fireEvent.change(screen.getByLabelText("Expert note"), {
      target: { value: "My next observation" },
    });
    rows.set(submitted.id, submitted);
    await act(async () => {
      finish({ error: null });
      finishRetry({ error: { code: "23505" } });
    });
    expect(rows.size).toBe(1);
    expect(mock.toast).toHaveBeenCalledWith({ title: "Note saved" });
    expect(
      (screen.getByLabelText("Expert note") as HTMLTextAreaElement).value,
    ).toBe("My next observation");
  } finally {
    vi.useRealTimers();
  }
});
it("does not call a conflicting existing note a successful retry or overwrite it", async () => {
  mock.insert.mockReturnValue(new Promise(() => {}));
  render(<BriansNotesWidget />);
  fireEvent.change(screen.getByLabelText("Expert note"), {
    target: { value: "My observation" },
  });
  vi.useFakeTimers();
  try {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20001);
    });
    const submitted = mock.insert.mock.calls[0][0];
    mock.read.mockResolvedValue({
      data: { ...submitted, note: "Changed in another window" },
      error: null,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(mock.insert).toHaveBeenCalledOnce();
    expect(mock.toast).not.toHaveBeenCalledWith({ title: "Note saved" });
    expect(
      (screen.getByLabelText("Expert note") as HTMLTextAreaElement).value,
    ).toBe("My observation");
  } finally {
    vi.useRealTimers();
  }
});

it("does not start another insert when an expired reconciliation read finally returns", async () => {
  let finishRead: (value: { data: null; error: null }) => void = () => {};
  mock.insert.mockReturnValue(new Promise(() => {}));
  mock.read.mockReturnValue(
    new Promise((resolve) => {
      finishRead = resolve;
    }),
  );
  render(<BriansNotesWidget />);
  fireEvent.change(screen.getByLabelText("Expert note"), {
    target: { value: "Keep this note" },
  });
  vi.useFakeTimers();
  try {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20001);
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20001);
    });
    await act(async () => {
      finishRead({ data: null, error: null });
    });
    expect(mock.insert).toHaveBeenCalledOnce();
    expect(mock.toast).not.toHaveBeenCalledWith({ title: "Note saved" });
    expect(
      (screen.getByLabelText("Expert note") as HTMLTextAreaElement).value,
    ).toBe("Keep this note");
  } finally {
    vi.useRealTimers();
  }
});
