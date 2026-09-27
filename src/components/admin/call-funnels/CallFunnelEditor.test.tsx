// @vitest-environment jsdom
import React, { useState } from "react";
import { randomUUID } from "node:crypto";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyCallFunnelConfig,
  callConfigIssues,
  type CallFunnelConfig,
} from "@/lib/callFunnels";
import type { OfferProof } from "@/lib/offerBuilder";
import CallFunnelEditor from "./CallFunnelEditor";

const approved: OfferProof = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "A useful starting point",
  kind: "testimonial",
  content: "I built my first useful tool.",
  attribution: "Alex",
  source_url: "",
  notes: "Do not publish my private notes",
  approved: true,
  created_at: "",
  updated_at: "",
};
const unapproved = {
  ...approved,
  id: "00000000-0000-4000-8000-000000000002",
  title: "Unapproved proof",
  content: "Not cleared for use",
  approved: false,
};
function mount({
  value = emptyCallFunnelConfig(),
  proof = [approved, unapproved],
  disabled = false,
}: {
  value?: CallFunnelConfig;
  proof?: OfferProof[];
  disabled?: boolean;
} = {}) {
  const onChange = vi.fn();
  function Harness() {
    const [config, setConfig] = useState(value);
    return (
      <CallFunnelEditor
        config={config}
        proof={proof}
        disabled={disabled}
        onChange={(next) => {
          onChange(next);
          setConfig(next);
        }}
      />
    );
  }
  return {
    ...render(<Harness />),
    onChange,
    latest: () => onChange.mock.calls.at(-1)?.[0] as CallFunnelConfig,
  };
}
function tab(name: string) {
  fireEvent.click(screen.getByRole("tab", { name }));
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
beforeEach(() => {
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: randomUUID,
    configurable: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("call funnel editor", () => {
  it("edits, hides and reorders whole preparation answers without losing media", () => {
    const { latest } = mount();
    tab("Preparation");
    change("Preparation question 1", "What will we cover?");
    change("Answer 1 video URL", "https://example.com/answer.mp4");
    change("Answer 1 captions URL", "https://example.com/captions.vtt");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Move preparation answers item 1 down",
      }),
    );
    expect(latest().preparation.extras!.objections.items[1]).toMatchObject({
      question: "What will we cover?",
      captions: "https://example.com/captions.vtt",
      video: { url: "https://example.com/answer.mp4" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Show answer 2" }));
    expect(latest().preparation.extras!.objections.items[1].enabled).toBe(
      false,
    );
    expect(latest().preparation.extras!.objections.items[1].video.url).toBe(
      "https://example.com/answer.mp4",
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show the offer overview" }),
    );
    change(
      "Overview document or presentation URL",
      "https://example.com/overview.pdf",
    );
    expect(latest().preparation.extras!.overview).toMatchObject({
      enabled: true,
      url: "https://example.com/overview.pdf",
    });
    expect(callConfigIssues(latest())).toEqual([]);
  });
  it("selects preparation proof independently and retains portraits until the last page deselects", () => {
    const { latest } = mount();
    tab("Proof");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Use on preparation — ${approved.title}`,
      }),
    );
    expect(latest().preparation.extras!.proofIds).toEqual([approved.id]);
    expect(latest().proofIds).toEqual([]);
    change(
      `Portrait URL for ${approved.title}`,
      "https://example.com/photo.jpg",
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Use on invitation — ${approved.title}`,
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Use on preparation — ${approved.title}`,
      }),
    );
    expect(latest().proofImages[approved.id]).toBe(
      "https://example.com/photo.jpg",
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Use on invitation — ${approved.title}`,
      }),
    );
    expect(latest().proofImages[approved.id]).toBeUndefined();
    expect(
      screen.queryByRole("checkbox", {
        name: /Use on preparation — Unapproved/,
      }),
    ).toBeNull();
  });
  it("exposes keyboard-navigable labeled tabs with a matching active panel", () => {
    mount();
    const first = screen.getByRole("tab", { name: "Design" });
    expect(first.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("tabpanel", { name: "Invitation" })).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Invitation" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getByRole("tabpanel", { name: "Scripts" })).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(screen.getByRole("tabpanel", { name: "Design" })).toBeTruthy();
  });

  it("keeps incomplete color input editable and changes design without touching page copy", () => {
    const initial = emptyCallFunnelConfig();
    const { latest } = mount({ value: initial });
    change("Color mode", "light");
    change("Heading style", "serif");
    change("Accent color hex", "#ab");
    expect(
      (screen.getByLabelText("Accent color hex") as HTMLInputElement).value,
    ).toBe("#ab");
    expect(latest().theme).toEqual({
      mode: "light",
      font: "serif",
      accent: "#ab",
    });
    expect(latest().invitation).toEqual(initial.invitation);
    expect(callConfigIssues(latest())).toContain(
      "Design: select a theme, font and six-digit accent color.",
    );
    change("Accent color picker", "#123456");
    expect(latest().theme.accent).toBe("#123456");
    change("Host name", "Brian");
    change("Host introduction", "A practical introduction.");
    expect(latest().brand.hostName).toBe("Brian");
    expect(latest().brand.hostBio).toBe("A practical introduction.");
    expect(callConfigIssues(latest())).toEqual([]);
  });

  it("edits invitation media, transcript and CTA together without dropping other media fields", () => {
    const { latest } = mount();
    tab("Invitation");
    change("Invitation video URL", "https://example.com/video.mp4");
    change("Invitation poster image URL", "/poster.jpg");
    change("Invitation transcript", "Here is the approach.");
    change("Application button text", "Find out if it fits");
    expect(latest().invitation.video).toEqual({
      url: "https://example.com/video.mp4",
      poster: "/poster.jpg",
      transcript: "Here is the approach.",
    });
    expect(latest().invitation.cta).toBe("Find out if it fits");
  });

  it("offers only earlier choice answers as display conditions and saves stable IDs", () => {
    const { latest } = mount();
    tab("Application");
    const condition = screen.getByLabelText("Show question 2 when");
    const values = within(condition)
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(values).toEqual(["", "business:active", "business:exploring"]);
    change("Show question 2 when", "business:active");
    expect(latest().questions[1].showWhen).toEqual({
      questionId: "business",
      optionId: "active",
    });
    expect(callConfigIssues(latest())).toEqual([]);
    change("Question 1, choice 1", "Yes, and I have customers");
    expect(latest().questions[1].showWhen).toEqual({
      questionId: "business",
      optionId: "active",
    });
  });

  it("blocks moving conditional questions ahead of their source without altering the draft", () => {
    const value = emptyCallFunnelConfig();
    value.questions[1].showWhen = {
      questionId: "business",
      optionId: "active",
    };
    const { onChange } = mount({ value });
    tab("Application");
    fireEvent.click(screen.getByRole("button", { name: "Move question 2 up" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "Keep each conditional question after",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Move question 1 down" }),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("protects referenced questions from deletion/type changes and allows removal after clearing the rule", () => {
    const { onChange, latest } = mount();
    tab("Application");
    fireEvent.click(screen.getByRole("button", { name: "Remove question 1" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "Remove those connections",
    );
    change("Question 1 answer type", "text");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Send to alternative: Do you have an existing business.*still building/,
      }),
    );
    change("Question 1 answer type", "text");
    expect(latest().questions[0].options).toEqual([]);
    expect(latest().qualificationRules).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove question 1" }));
    expect(latest().questions.map((question) => question.id)).toEqual([
      "priority",
      "timing",
    ]);
    expect(callConfigIssues(latest())).toEqual([]);
  });

  it("adds and reorders unique stable questions and answer choices without changing rule targets", () => {
    const { latest } = mount();
    tab("Application");
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    const added = latest().questions[3];
    expect(added.id).toMatch(/^question-[a-f0-9-]+$/);
    expect(new Set(added.options.map((option) => option.id)).size).toBe(2);
    change("Question 4 label", "A new fit question");
    fireEvent.click(
      screen.getByRole("button", { name: "Add choice to question 4" }),
    );
    const third = latest().questions[3].options[2];
    fireEvent.click(
      screen.getByRole("button", { name: "Move question 4 choice 3 up" }),
    );
    expect(latest().questions[3].options[1].id).toBe(third.id);
    fireEvent.click(screen.getByRole("button", { name: "Move question 4 up" }));
    expect(latest().questions[2].id).toBe(added.id);
    expect(latest().qualificationRules).toEqual(
      emptyCallFunnelConfig().qualificationRules,
    );
    expect(callConfigIssues(latest())).toEqual([]);
  });

  it("protects a choice used by a condition until that condition is removed", () => {
    const value = emptyCallFunnelConfig();
    value.questions[0].options.push({ id: "later", label: "Maybe later" });
    value.questions[1].showWhen = { questionId: "business", optionId: "later" };
    const { onChange, latest } = mount({ value });
    tab("Application");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove question 1 choice 3" }),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "This answer is used",
    );
    change("Show question 2 when", "");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove question 1 choice 3" }),
    );
    expect(latest().questions[0].options).toHaveLength(2);
    expect(latest().questions[1].showWhen).toBeUndefined();
  });

  it("enforces question and choice limits before another item can be added", () => {
    const value = emptyCallFunnelConfig();
    value.qualificationRules = [];
    value.questions = Array.from({ length: 15 }, (_, index) => ({
      id: `question-${index}`,
      label: `Fit question ${index + 1}`,
      help: "",
      type: "single" as const,
      required: true,
      options: Array.from({ length: index === 0 ? 8 : 2 }, (_, at) => ({
        id: `choice-${at}`,
        label: `Choice ${at + 1}`,
      })),
    }));
    const { onChange } = mount({ value });
    tab("Application");
    expect(
      (
        screen.getByRole("button", {
          name: "Add question",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Add choice to question 1",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Remove question 2 choice 1",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add choice to question 1" }),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("enforces each page's proof limit independently", () => {
    const proof = Array.from({ length: 13 }, (_, index) => ({
      ...approved,
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      title: `Proof ${index + 1}`,
    }));
    const value = emptyCallFunnelConfig();
    value.proofIds = proof.slice(0, 12).map((item) => item.id);
    const { latest } = mount({ value, proof });
    tab("Proof");
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Use on invitation — Proof 13",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Use on alternative — Proof 13" }),
    );
    expect(latest().alternative.proofIds).toEqual([proof[12].id]);
    expect(latest().proofIds).toHaveLength(12);
  });

  it("keeps invitation and alternative proof independent and removes an unused portrait", () => {
    const { latest } = mount();
    tab("Proof");
    expect(screen.queryByText("Not cleared for use")).toBeNull();
    expect(screen.queryByText("Do not publish my private notes")).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Use on invitation — ${approved.title}`,
      }),
    );
    expect(latest().proofIds).toEqual([approved.id]);
    expect(latest().alternative.proofIds).toEqual([]);
    change(
      `Portrait URL for ${approved.title}`,
      "https://example.com/alex.jpg",
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Use on alternative — ${approved.title}`,
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Use on invitation — ${approved.title}`,
      }),
    );
    expect(latest().proofImages[approved.id]).toBe(
      "https://example.com/alex.jpg",
    );
    expect(latest().alternative.proofIds).toEqual([approved.id]);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Use on alternative — ${approved.title}`,
      }),
    );
    expect(latest().proofImages[approved.id]).toBeUndefined();
    expect(
      screen.queryByLabelText(`Portrait URL for ${approved.title}`),
    ).toBeNull();
  });

  it("lets the owner remove stale unapproved proof without silently replacing it", () => {
    const value = emptyCallFunnelConfig();
    value.proofIds = [unapproved.id];
    const { onChange, latest } = mount({ value });
    tab("Proof");
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByText(/previously selected proof item is unavailable/),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove unavailable invitation proof",
      }),
    );
    expect(latest().proofIds).toEqual([]);
  });

  it("edits and reorders preparation and training content with stable chapter IDs", () => {
    const { latest } = mount();
    tab("Preparation");
    fireEvent.click(screen.getByRole("button", { name: "Add checklist item" }));
    change("Checklist step 5", "Bring your current offer.");
    fireEvent.click(
      screen.getByRole("button", { name: "Move checklist item 5 up" }),
    );
    expect(latest().preparation.checklist[3]).toBe("Bring your current offer.");
    tab("Training");
    fireEvent.click(screen.getByRole("button", { name: "Add chapters item" }));
    const chapterId = latest().training.chapters[3].id;
    change("Chapter 4 title", "Your next action");
    change("Chapter 4 start in seconds", "425");
    fireEvent.click(
      screen.getByRole("button", { name: "Move chapters item 4 up" }),
    );
    expect(latest().training.chapters[2]).toEqual({
      id: chapterId,
      title: "Your next action",
      seconds: 425,
    });
    expect(callConfigIssues(latest())).toEqual([]);
  });

  it("preserves alternative price, billing terms, benefits and FAQs in one draft", () => {
    const { latest } = mount();
    tab("Alternative");
    change("Displayed price", "$49 per month");
    change(
      "Billing and cancellation terms",
      "Monthly billing. Cancel before the next renewal.",
    );
    change("Alternative destination URL", "https://example.com/membership");
    fireEvent.click(screen.getByRole("button", { name: "Add benefits item" }));
    change("Benefit 3 heading", "Help with your next build");
    fireEvent.click(screen.getByRole("button", { name: "Add faqs item" }));
    change("FAQ 2 question", "Can I cancel?");
    change("FAQ 2 answer", "Yes, before the next renewal.");
    expect(latest().alternative.price).toBe("$49 per month");
    expect(latest().alternative.billing).toContain("Monthly billing");
    expect(latest().alternative.benefits[2].title).toBe(
      "Help with your next build",
    );
    expect(latest().alternative.faq[1].answer).toBe(
      "Yes, before the next renewal.",
    );
    expect(callConfigIssues(latest())).toEqual([]);
  });

  it("integrates the private scripts with the parent draft and keeps practical input sizes", () => {
    const { latest } = mount();
    tab("Scripts");
    change("Invitation script", "Start with the work you want to improve.");
    expect(latest().scripts.invitation).toBe(
      "Start with the work you want to improve.",
    );
    tab("Booking");
    const input = screen.getByLabelText("Calendar URL");
    expect(input.className).toContain("text-base");
    expect(input.className).toContain("min-h-11");
    change("Call length in minutes", "45");
    expect(latest().booking.minutes).toBe(45);
    change("Call length in minutes", "");
    expect(
      (screen.getByLabelText("Call length in minutes") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(callConfigIssues(latest())).toContain(
      "Call length: use 5–240 minutes.",
    );
  });

  it("locks edits while the parent is saving while allowing settings to be inspected", () => {
    const { onChange } = mount({ disabled: true });
    expect(
      (
        screen.getByRole("group", {
          name: "Design settings",
        }) as HTMLFieldSetElement
      ).disabled,
    ).toBe(true);
    change("Host name", "Should not change");
    expect(onChange).not.toHaveBeenCalled();
    tab("Application");
    expect(
      (
        screen.getByRole("group", {
          name: "Application settings",
        }) as HTMLFieldSetElement
      ).disabled,
    ).toBe(true);
  });
});
