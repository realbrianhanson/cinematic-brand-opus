// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import CallFunnelExperience from "../CallFunnelExperience";
import CallVideo from "../CallVideo";
import { callVideoEmbed } from "../callVideoEmbed";
import { callDraftKey, readCallDraft, saveCallDraft } from "../callFunnelDraft";
import {
  emptyCallFunnelConfig,
  publicCallConfig,
  type CallApplicationState,
  type CallPublication,
} from "@/lib/callFunnels";

function fixture(): CallPublication {
  const config = emptyCallFunnelConfig();
  config.brand.name = "Example business";
  config.invitation.cta = "Apply now";
  config.questions = [
    {
      id: "ready",
      label: "Do you have a project?",
      help: "Pick the closest answer.",
      type: "single",
      required: true,
      options: [
        { id: "yes", label: "Yes, I do" },
        { id: "no", label: "Not yet" },
      ],
    },
    {
      id: "detail",
      label: "Describe your project",
      help: "",
      type: "textarea",
      required: true,
      options: [],
      showWhen: { questionId: "ready", optionId: "yes" },
    },
  ];
  config.booking.url = "https://calendar.example.com/book";
  config.alternative.url = "https://store.example.com/resource";
  config.alternative.cta = "Explore the workshop";
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "example",
    title: "Example call",
    revision: 1,
    config: publicCallConfig(config),
    proof: [],
  };
}
function state(
  publication = fixture(),
  patch: Partial<CallApplicationState> = {},
): CallApplicationState {
  return {
    id: "application-1",
    outcome: "qualified",
    revision: publication.revision,
    slug: publication.slug,
    title: publication.title,
    config: publication.config,
    proof: publication.proof,
    submittedAt: "2026-09-28T12:00:00Z",
    booking: { status: "unconfirmed", startsAt: null, source: null },
    ...patch,
  };
}
function chooseNo() {
  fireEvent.click(screen.getByRole("radio", { name: "Not yet" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}
function contact() {
  fireEvent.change(screen.getByLabelText("Your name"), {
    target: { value: "Test Person" },
  });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "test@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}
function consent() {
  fireEvent.click(
    screen.getByRole("checkbox", { name: /I agree to be contacted/ }),
  );
}
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Video + Application visitor flow", () => {
  it("validates the current question and keeps consent explicitly unchecked", async () => {
    const submit = vi.fn();
    render(<CallFunnelExperience publication={fixture()} onSubmit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "Please answer this question",
    );
    chooseNo();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert").textContent).toContain("Enter your name");
    contact();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Send my application" }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "confirm your consent",
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it("removes hidden answers when an earlier choice changes and never saves contact or consent", async () => {
    const publication = fixture();
    const submit = vi.fn().mockResolvedValue(state(publication));
    render(
      <CallFunnelExperience publication={publication} onSubmit={submit} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Yes, I do" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Describe your project" }),
      { target: { value: "A specific project" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    contact();
    consent();
    const saved = sessionStorage.getItem(callDraftKey(publication, false))!;
    expect(saved).not.toContain("Test Person");
    expect(saved).not.toContain("test@example.com");
    expect(saved).not.toContain("consent");
    fireEvent.click(
      screen.getByRole("button", { name: "Edit Do you have a project?" }),
    );
    chooseNo();
    expect(
      screen.queryByRole("textbox", { name: "Describe your project" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Send my application" }),
    );
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        { ready: "no" },
        { name: "Test Person", email: "test@example.com" },
        true,
      ),
    );
    expect(sessionStorage.getItem(callDraftKey(publication, false))).toBeNull();
  });

  it("uses server qualification live, without inferring it from preview rules", async () => {
    const publication = fixture();
    const submit = vi.fn().mockResolvedValue(state(publication));
    render(
      <CallFunnelExperience
        publication={publication}
        onSubmit={submit}
        qualificationRules={[
          { questionId: "ready", optionId: "no", outcome: "alternative" },
        ]}
      />,
    );
    chooseNo();
    contact();
    consent();
    fireEvent.click(
      screen.getByRole("button", { name: "Send my application" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Let’s make time for your next step.",
        }),
      ).toBeTruthy(),
    );
    expect(screen.getByText(/Your call is not booked yet/)).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Explore the workshop" }),
    ).toBeNull();
  });

  it("simulates the alternative in preview without submitting or enabling external actions", async () => {
    const submit = vi.fn();
    render(
      <CallFunnelExperience
        publication={fixture()}
        preview
        onSubmit={submit}
        qualificationRules={[
          { questionId: "ready", optionId: "no", outcome: "alternative" },
        ]}
      />,
    );
    chooseNo();
    contact();
    consent();
    fireEvent.click(
      screen.getByRole("button", { name: "Test application route" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "A useful place to start, at your own pace.",
        }),
      ).toBeTruthy(),
    );
    expect(submit).not.toHaveBeenCalled();
    expect(
      screen
        .getAllByRole("button", { name: "Explore the workshop" })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("prevents duplicate sends and preserves the reviewed application when transport fails", async () => {
    let reject: (reason: Error) => void = () => {};
    const submit = vi.fn().mockImplementation(
      () =>
        new Promise((_, no) => {
          reject = no;
        }),
    );
    render(<CallFunnelExperience publication={fixture()} onSubmit={submit} />);
    chooseNo();
    contact();
    consent();
    const form = screen.getByRole("form", { name: "Call application" });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(submit).toHaveBeenCalledTimes(1);
    reject(new Error("Connection interrupted. Try again."));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Connection interrupted",
      ),
    );
    expect(screen.getByText(/Test Person.*test@example\.com/)).toBeTruthy();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      true,
    );
    submit.mockResolvedValue(state());
    fireEvent.submit(form);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit.mock.calls[0]).toEqual(submit.mock.calls[1]);
  });

  it("restarts a preview application so both branches can be tested without reloading", async () => {
    const publication = fixture();
    const rules = [
      { questionId: "ready", optionId: "no", outcome: "alternative" as const },
    ];
    const submit = vi.fn();
    render(
      <CallFunnelExperience
        publication={publication}
        preview
        qualificationRules={rules}
        onSubmit={submit}
      />,
    );
    chooseNo();
    contact();
    consent();
    fireEvent.click(
      screen.getByRole("button", { name: "Test application route" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "A useful place to start, at your own pace.",
        }),
      ).toBeTruthy(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Restart application" }),
    );
    expect(
      screen.queryByRole("heading", { name: "You have a saved application" }),
    ).toBeNull();
    expect(
      (screen.getByRole("radio", { name: "Not yet" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(
      sessionStorage.getItem(callDraftKey(publication, true, rules)),
    ).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Yes, I do" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Describe your project" }),
      { target: { value: "Another project" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((screen.getByLabelText("Your name") as HTMLInputElement).value).toBe(
      "",
    );
    contact();
    consent();
    fireEvent.click(
      screen.getByRole("button", { name: "Test application route" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Let’s make time for your next step.",
        }),
      ).toBeTruthy(),
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it("resets simulated outcomes when preview qualification rules change", async () => {
    const publication = fixture();
    const mounted = render(
      <CallFunnelExperience
        publication={publication}
        preview
        qualificationRules={[
          { questionId: "ready", optionId: "no", outcome: "alternative" },
        ]}
      />,
    );
    chooseNo();
    contact();
    consent();
    fireEvent.click(
      screen.getByRole("button", { name: "Test application route" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "A useful place to start, at your own pace.",
        }),
      ).toBeTruthy(),
    );
    mounted.rerender(
      <CallFunnelExperience
        publication={publication}
        preview
        qualificationRules={[]}
      />,
    );
    expect(
      screen.queryByRole("heading", {
        name: "A useful place to start, at your own pace.",
      }),
    ).toBeNull();
    chooseNo();
    contact();
    consent();
    fireEvent.click(
      screen.getByRole("button", { name: "Test application route" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Let’s make time for your next step.",
        }),
      ).toBeTruthy(),
    );
  });

  it("offers explicit draft recovery, with contact re-entry and revision isolation", () => {
    const publication = fixture();
    saveCallDraft(callDraftKey(publication, false), {
      answers: { ready: "no" },
      step: "review",
    });
    const mounted = render(<CallFunnelExperience publication={publication} />);
    expect(
      screen.getByRole("heading", { name: "You have a saved application" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue saved application" }),
    );
    expect((screen.getByLabelText("Your name") as HTMLInputElement).value).toBe(
      "",
    );
    mounted.unmount();
    render(
      <CallFunnelExperience publication={{ ...publication, revision: 2 }} />,
    );
    expect(
      screen.queryByRole("heading", { name: "You have a saved application" }),
    ).toBeNull();
    expect(
      (screen.getByRole("radio", { name: "Not yet" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it("does not claim a booking from a calendar handoff, and only unlocks preparation from a confirmed state", async () => {
    const publication = fixture();
    const refresh = vi
      .fn()
      .mockResolvedValueOnce(state())
      .mockResolvedValueOnce(
        state(publication, {
          booking: {
            status: "booked",
            startsAt: "2026-10-01T14:00:00Z",
            source: "admin",
            timezone: "America/New_York",
          },
        }),
      );
    render(
      <CallFunnelExperience
        publication={publication}
        initialState={state()}
        onRefreshState={refresh}
      />,
    );
    const calendar = screen.getByRole("link", { name: "Choose a call time" });
    expect(calendar.getAttribute("href")).toBe(
      "https://calendar.example.com/book",
    );
    expect(
      screen.queryByRole("button", { name: "Prepare for your call" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Check booking status" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "not received a booking confirmation",
      ),
    );
    expect(screen.queryByText("Your call is booked")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Check booking status" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Recorded by the team.")).toBeTruthy(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare for your call" }),
    );
    expect(
      screen.getByRole("heading", { name: "Your preparation checklist" }),
    ).toBeTruthy();
    expect(screen.getByText("0 of 4 checked")).toBeTruthy();
  });

  it("shows cancellation truth and never a false confirmed heading", () => {
    render(
      <CallFunnelExperience
        publication={fixture()}
        initialState={state(fixture(), {
          booking: {
            status: "cancelled",
            startsAt: null,
            source: "signed_webhook",
          },
        })}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "Your previous booking was cancelled",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("Your call is booked")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Prepare for your call" }),
    ).toBeNull();
  });

  it("only renders explicitly selected approved proof, with no fictional fallback", () => {
    const publication = fixture();
    publication.proof = [
      {
        id: "proof-visible",
        title: "A practical result",
        content: "A real supplied quote.",
        attribution: "Provided name",
        source_url: "",
      },
      {
        id: "proof-hidden",
        title: "Not chosen",
        content: "Wrong offer",
        attribution: "Other name",
        source_url: "",
      },
    ];
    publication.config.proofIds = ["proof-visible", "missing"];
    render(<CallFunnelExperience publication={publication} />);
    expect(
      screen.getByRole("heading", { name: "A practical result" }),
    ).toBeTruthy();
    expect(screen.queryByText("Wrong offer")).toBeNull();
    expect(screen.queryByText(/Your customer stories belong here/)).toBeNull();
  });
});

describe("safe video and local preparation", () => {
  it("sends an origin referrer for YouTube and keeps the original video accessible", () => {
    const url = "https://youtu.be/abcdefghijk";
    render(
      <CallVideo
        media={{ url, poster: "", transcript: "" }}
        title="Invitation"
      />,
    );
    const frame = screen.getByTitle("Invitation");
    expect(frame.getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/abcdefghijk",
    );
    expect(frame.getAttribute("referrerpolicy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(
      screen
        .getByRole("link", { name: "Open original video" })
        .getAttribute("href"),
    ).toBe(url);
  });
  it("preserves unlisted Vimeo access hashes and rejects unrelated or unsafe hosts", () => {
    expect(callVideoEmbed("https://vimeo.com/123456789/abcdef1234")).toBe(
      "https://player.vimeo.com/video/123456789?h=abcdef1234",
    );
    expect(
      callVideoEmbed(
        "https://player.vimeo.com/video/123456789?h=abcdef1234&badge=0",
      ),
    ).toBe("https://player.vimeo.com/video/123456789?h=abcdef1234");
    expect(callVideoEmbed("https://vimeo.com/123456789?h=abcdef1234")).toBe(
      "https://player.vimeo.com/video/123456789?h=abcdef1234",
    );
    expect(
      callVideoEmbed("https://vimeo.com.evil.example/123456789/abcdef1234"),
    ).toBeNull();
    expect(
      callVideoEmbed("https://user:password@vimeo.com/123456789"),
    ).toBeNull();
    expect(
      callVideoEmbed("https://player.vimeo.com/video/123456789?h=bad%22hash"),
    ).toBeNull();
  });
  it("does not create arbitrary iframes and does not enable preview playback", () => {
    const media = {
      url: "https://example.com/not-a-provider",
      poster: "",
      transcript: "",
    };
    const mounted = render(<CallVideo media={media} title="Training" />);
    expect(document.querySelector("iframe")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Open original video" })
        .getAttribute("href"),
    ).toBe(media.url);
    mounted.rerender(
      <CallVideo
        media={{ ...media, url: "https://youtu.be/abcdefghijk" }}
        title="Training"
        preview
      />,
    );
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("seeks native chapter positions without claiming viewing completion", () => {
    const onPosition = vi.fn();
    render(
      <CallVideo
        media={{
          url: "https://example.com/training.mp4",
          poster: "",
          transcript: "",
        }}
        title="Training"
        chapters={[{ id: "chapter", title: "The approach", seconds: 60 }]}
        onPosition={onPosition}
      />,
    );
    const video = screen.getByLabelText("Training") as HTMLVideoElement;
    expect(
      (
        screen.getByRole("button", {
          name: "1:00 The approach",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    Object.defineProperty(video, "duration", {
      value: 180,
      configurable: true,
    });
    fireEvent.loadedMetadata(video);
    fireEvent.click(screen.getByRole("button", { name: "1:00 The approach" }));
    expect(video.currentTime).toBe(60);
    video.currentTime = 61;
    fireEvent.timeUpdate(video);
    expect(onPosition).toHaveBeenLastCalledWith(61);
    expect(screen.getByText(/Playback position: 1:01/)).toBeTruthy();
    expect(screen.queryByText(/training complete/i)).toBeNull();
  });

  it("keeps preparation notes and checklist local, with a clear-all action", () => {
    render(<CallFunnelExperience publication={fixture()} preview />);
    fireEvent.click(screen.getByRole("button", { name: "Preparation" }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Bring one example of the work you want to improve.",
      }),
    );
    expect(screen.getByText("1 of 4 checked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open the training" }));
    fireEvent.change(screen.getByLabelText("What would you like to discuss?"), {
      target: { value: "My private notes" },
    });
    expect(
      screen.getByText(/These notes stay in this tab and are not sent/),
    ).toBeTruthy();
    expect(Object.values(sessionStorage).join("")).toContain(
      "My private notes",
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Clear my preparation notes and progress",
      }),
    );
    expect(
      (
        screen.getByLabelText(
          "What would you like to discuss?",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("");
    expect(Object.values(sessionStorage).join("")).not.toContain(
      "My private notes",
    );
  });

  it("rejects corrupted and expired recovery without exposing invalid answers", () => {
    const publication = fixture();
    const key = callDraftKey(publication, false);
    sessionStorage.setItem(key, "not json");
    expect(readCallDraft(key, publication)).toBeNull();
    sessionStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        savedAt: Date.now() - 8 * 86400000,
        answers: { ready: "no" },
      }),
    );
    expect(readCallDraft(key, publication)).toBeNull();
    saveCallDraft(key, {
      answers: {
        ready: "no",
        detail: "Hidden old answer",
        arbitrary: "Not a question",
      },
      step: "review",
    });
    expect(readCallDraft(key, publication)?.answers).toEqual({ ready: "no" });
  });
});
