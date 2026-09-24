// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HomeTestimonials from "@/components/HomeTestimonials";
import { groupItemLayout } from "@/components/testimonials/layout";
import { testimonialCopy } from "@/components/testimonials/copy";
import { SiteConfigContext } from "@/config/SiteConfigContext";
import { memberPreset } from "@/config/presets/member";
import { brianHomepageTestimonials } from "@/config/presets/brianTestimonials";
import type { SiteConfig } from "@/config/types";
import {
  SPEC_COMMUNITY,
  SPEC_DISCLOSURE,
  SPEC_NOT_A_TECHIE,
  SPEC_RESULTS,
  SPEC_WALL,
} from "@/config/__tests__/fixtures/testimonialSpec";

// The member preset is the stable base; only the testimonials block matters.
const grouped: SiteConfig = {
  ...memberPreset,
  homepageTestimonials: brianHomepageTestimonials,
};
const SCREENSHOTS = [...SPEC_RESULTS, ...SPEC_NOT_A_TECHIE].filter(
  (item) => item.screenshot,
);
const shotOf = (name: string) =>
  SCREENSHOTS.find((item) => item.attribution === name)!.screenshot!;

function renderHome(config: SiteConfig = grouped) {
  return render(
    <SiteConfigContext.Provider value={config}>
      <HomeTestimonials />
    </SiteConfigContext.Provider>,
  );
}
function markup(config: SiteConfig = grouped) {
  return renderToStaticMarkup(
    <SiteConfigContext.Provider value={config}>
      <HomeTestimonials />
    </SiteConfigContext.Provider>,
  );
}
const results = () =>
  screen.getByRole("region", {
    name: brianHomepageTestimonials.groups![0].label,
  });
const wall = () =>
  screen.getByRole("region", { name: brianHomepageTestimonials.wall!.label });

afterEach(cleanup);

describe("grouped homepage testimonials", () => {
  it("keeps the section anchor and a short header", () => {
    renderHome();
    const section = document.getElementById("testimonials")!;
    expect(section.tagName).toBe("SECTION");
    expect(
      within(section).getByRole("heading", {
        level: 2,
        name: brianHomepageTestimonials.heading,
      }),
    ).toBeTruthy();
    expect(section.textContent).toContain(brianHomepageTestimonials.overline);
    expect(section.textContent).toContain(brianHomepageTestimonials.intro);
  });

  it("renders each group as a labelled section with one list item per person", () => {
    renderHome();
    for (const group of brianHomepageTestimonials.groups!) {
      const section = screen.getByRole("region", { name: group.label });
      expect(section.tagName).toBe("SECTION");
      expect(
        within(section).getByRole("heading", { level: 3, name: group.label }),
      ).toBeTruthy();
      const list = within(section).getByRole("list");
      expect(list.tagName).toBe("UL");
      const items = within(list).getAllByRole("listitem");
      expect(items).toHaveLength(group.items.length);
      group.items.forEach((item, i) =>
        expect(items[i].textContent).toContain(item.attribution),
      );
    }
  });

  it("shows every name from the groups, the wall and the community list", () => {
    renderHome();
    const text = document.getElementById("testimonials")!.textContent!;
    for (const item of [
      ...SPEC_RESULTS,
      ...SPEC_NOT_A_TECHIE,
      ...SPEC_WALL,
      ...SPEC_COMMUNITY,
    ])
      expect(text).toContain(item.attribution);
  });

  it("uses the exact visible screenshot text as alt text", () => {
    renderHome();
    for (const item of SCREENSHOTS) {
      const shot = item.screenshot!;
      const image = screen.getByRole("img", { name: shot.alt });
      expect(image.getAttribute("alt")).toBe(shot.alt);
      expect(image.getAttribute("src")).toBe(shot.src);
    }
  });

  it("loads screenshots lazily at half their natural size so nothing shifts", () => {
    renderHome();
    for (const item of SCREENSHOTS) {
      const shot = item.screenshot!;
      const image = screen.getByRole("img", { name: shot.alt });
      expect(image.getAttribute("width")).toBe(String(shot.width / 2));
      expect(image.getAttribute("height")).toBe(String(shot.height / 2));
      expect(image.getAttribute("loading")).toBe("lazy");
      expect(image.getAttribute("decoding")).toBe("async");
      expect(image.className).toContain("max-w-full");
      expect(image.className).toContain("h-auto");
    }
  });

  it("captions screenshot cards with the name and context", () => {
    renderHome();
    const kathy = shotOf("Kathy Bryant");
    const caption = screen
      .getByRole("img", { name: kathy.alt })
      .closest("figure")!
      .querySelector("figcaption")!;
    expect(caption.textContent).toContain("Kathy Bryant");
    expect(caption.textContent).toContain(SPEC_RESULTS[0].context);
    expect(caption.textContent).not.toContain("Over $2k");
  });

  it("captions Heshie's full screenshot with her contiguous typed excerpt only", () => {
    renderHome();
    const heshie = SPEC_NOT_A_TECHIE[1];
    const image = screen.getByRole("img", { name: heshie.screenshot!.alt });
    const caption = image.closest("figure")!.querySelector("figcaption")!;
    expect(caption.querySelector("blockquote")?.textContent).toContain(
      heshie.quote,
    );
    expect(caption.textContent).not.toContain("Francis");
    expect(image.getAttribute("alt")).toContain("Francis is amazing");
  });

  it("puts the readable income disclosure directly under the results list", () => {
    renderHome();
    const section = results();
    const list = within(section).getByRole("list");
    const note = list.nextElementSibling as HTMLElement;
    expect(note.tagName).toBe("P");
    expect(note.textContent).toBe(SPEC_DISCLOSURE);
    expect(section.getAttribute("aria-describedby")).toBe(note.id);
    // At least 14px and at least 70% white: never tiny grey fine print.
    expect(note.className).toContain("text-body");
    expect(note.className).toMatch(/text-white\/(?:[7-9]\d)\b/);
    expect(note.className).not.toMatch(/text-(?:xs|\[1[0-3]px\])/);
    const notATechie = screen.getByRole("region", {
      name: "You don't have to be a techie",
    });
    expect(notATechie.textContent).not.toContain(SPEC_DISCLOSURE);
  });

  it("enlarges a screenshot in an accessible dialog that repeats the disclosure", async () => {
    renderHome();
    const kathy = shotOf("Kathy Bryant");
    const trigger = screen.getByRole("button", {
      name: `${testimonialCopy.enlargeMessageFrom} Kathy Bryant`,
    });
    expect(trigger.getAttribute("type")).toBe("button");
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Kathy Bryant" });
    const full = within(dialog).getByRole("img", { name: kathy.alt });
    expect(full.getAttribute("width")).toBe(String(kathy.width));
    expect(full.getAttribute("height")).toBe(String(kathy.height));
    expect(within(dialog).getByText(SPEC_DISCLOSURE)).toBeTruthy();
    const described = (dialog.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect(described).toContain(SPEC_RESULTS[0].context);
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("does not attach the income disclosure to screenshots outside the results group", async () => {
    renderHome();
    fireEvent.click(
      screen.getByRole("button", {
        name: `${testimonialCopy.enlargeMessageFrom} Susie Satram`,
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Susie Satram" });
    expect(dialog.textContent).not.toContain(SPEC_DISCLOSURE);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("scrolls the short-lines wall with one readable copy and a hidden loop copy", () => {
    renderHome();
    const section = wall();
    const lists = section.querySelectorAll("ul");
    expect(lists).toHaveLength(2);
    const [live, loop] = Array.from(lists);
    expect(live.getAttribute("aria-hidden")).toBeNull();
    expect(loop.getAttribute("aria-hidden")).toBe("true");
    expect(loop.querySelector("a, button, input, [tabindex]")).toBeNull();
    const readable = within(section).getAllByRole("listitem");
    expect(readable).toHaveLength(SPEC_WALL.length);
    SPEC_WALL.forEach((line, i) => {
      expect(readable[i].querySelector("blockquote")?.textContent).toBe(
        line.quote,
      );
      expect(readable[i].textContent).toContain(line.attribution);
    });
    expect(loop.querySelectorAll("li")).toHaveLength(SPEC_WALL.length);
  });

  it("moves the wall only when motion is allowed and pauses on hover and focus", () => {
    renderHome();
    const section = wall();
    const [live, loop] = Array.from(section.querySelectorAll("ul"));
    const track = live.parentElement!;
    expect(track).toBe(loop.parentElement);
    expect(track.className).toMatch(
      /(?:^|\s)motion-safe:animate-\[testimonial-wall-scroll_/,
    );
    expect(track.className).not.toMatch(/(?:^|\s)animate-/);
    expect(track.className).toContain(
      "group-hover/wall:[animation-play-state:paused]",
    );
    expect(track.className).toContain(
      "group-focus-within/wall:[animation-play-state:paused]",
    );
    const viewport = within(section).getByRole("group", {
      name: brianHomepageTestimonials.wall!.label,
    });
    expect(viewport.getAttribute("tabindex")).toBe("0");
    expect(viewport.className).toContain("group/wall");
    expect(viewport.contains(track)).toBe(true);
    expect(
      document.head.querySelector('style[data-href="testimonial-wall-scroll"]')
        ?.textContent,
    ).toContain("@keyframes testimonial-wall-scroll");
  });

  it("turns the wall into a static wrapped grid when reduced motion is requested", () => {
    renderHome();
    const section = wall();
    const [live, loop] = Array.from(section.querySelectorAll("ul"));
    expect(loop.className).toContain("motion-reduce:hidden");
    expect(live.className).toContain("motion-reduce:grid");
    expect(live.className).toContain("motion-reduce:w-full");
    // Fixed marquee card widths only apply when motion is allowed.
    for (const item of Array.from(live.querySelectorAll("li"))) {
      expect(item.className).toMatch(/(?:^|\s)motion-safe:w-\[/);
      expect(item.className).not.toMatch(/(?:^|\s)(?:sm:)?w-\[/);
    }
    const track = live.parentElement!;
    expect(track.className).not.toMatch(/(?:^|\s)w-max/);
    expect(track.className).toContain("motion-safe:w-max");
    const toggle = within(section).getByRole("button", {
      name: `${testimonialCopy.pause} ${testimonialCopy.wallControlTarget}`,
    });
    expect(toggle.className).toContain("motion-reduce:hidden");
  });

  it("lets anyone pause and restart the wall with a button", () => {
    renderHome();
    const section = wall();
    const track = section.querySelector("ul")!.parentElement!;
    expect(track.style.animationPlayState).toBe("");
    fireEvent.click(
      within(section).getByRole("button", {
        name: `${testimonialCopy.pause} ${testimonialCopy.wallControlTarget}`,
      }),
    );
    // Inline, so the later `animation` shorthand cannot reset it.
    expect(track.style.animationPlayState).toBe("paused");
    fireEvent.click(
      within(section).getByRole("button", {
        name: `${testimonialCopy.play} ${testimonialCopy.wallControlTarget}`,
      }),
    );
    expect(track.style.animationPlayState).toBe("");
    expect(track.style.getPropertyValue("--wall-duration")).toBe(
      `${SPEC_WALL.length * 11}s`,
    );
  });

  it("keeps the six earlier quotes in a collapsed community list", () => {
    renderHome();
    const details = document.querySelector("#testimonials details")!;
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toBe(
      testimonialCopy.moreFromCommunity,
    );
    const figures = details.querySelectorAll("figure");
    expect(figures).toHaveLength(SPEC_COMMUNITY.length);
    SPEC_COMMUNITY.forEach((item, i) => {
      expect(figures[i].querySelector("blockquote")?.textContent).toBe(
        `“${item.quote}”`,
      );
      expect(figures[i].textContent).toContain(item.attribution);
      expect(figures[i].textContent).toContain(item.context);
    });
  });

  it("server-renders verbatim alt text and no review structured data", () => {
    const html = markup();
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(
      Array.from(doc.querySelectorAll("img")).map((img) =>
        img.getAttribute("alt"),
      ),
    ).toEqual(SCREENSHOTS.map((item) => item.screenshot!.alt));
    expect(html).not.toContain("application/ld+json");
    expect(html).not.toMatch(/AggregateRating|Review|itemtype|itemprop/);
    expect(doc.querySelectorAll('[role="dialog"]')).toHaveLength(0);
  });

  it("sizes cards so the two and three column grids have no gaps", () => {
    const [results, notATechie] = brianHomepageTestimonials.groups!;
    // Two columns: Kathy|Heiko, Randi|Alim, then Jayme's full-width feature.
    // Three columns: Kathy|Heiko|Randi, then Jayme (two wide)|Alim.
    expect(
      results.items.map((_, i) => groupItemLayout(results.items, i)),
    ).toEqual(["", "", "", "md:col-span-2", ""]);
    // Three columns: two tall screenshots beside two stacked quotes.
    expect(
      notATechie.items.map((_, i) => groupItemLayout(notATechie.items, i)),
    ).toEqual(["xl:row-span-2", "xl:row-span-2", "", ""]);
    // An odd card out spans both columns on two-column screens only.
    const three = results.items.slice(0, 3);
    expect(three.map((_, i) => groupItemLayout(three, i))).toEqual([
      "",
      "",
      "md:col-span-2 xl:col-span-1",
    ]);
    renderHome();
    for (const group of brianHomepageTestimonials.groups!)
      expect(
        within(screen.getByRole("region", { name: group.label })).getByRole(
          "list",
        ).className,
      ).toContain("md:grid-flow-row-dense");
  });
});

describe("flat testimonial lists stay backward compatible", () => {
  const flat = (
    block: NonNullable<SiteConfig["homepageTestimonials"]>,
  ): SiteConfig => ({ ...memberPreset, homepageTestimonials: block });

  it("renders a flat list exactly as before", () => {
    expect(
      markup(
        flat({
          overline: "Feedback",
          heading: "What clients say",
          items: [
            {
              quote: "First quote",
              attribution: "Ann Lee",
              context: "Workshop · 2026",
            },
            { quote: "Second quote", attribution: "Bo Diaz" },
          ],
        }),
      ),
    ).toBe(
      '<section id="testimonials" aria-label="What clients say" class="bg-[var(--brand-backdrop)] py-20 lg:py-28"><div class="mx-auto max-w-[1440px] px-6 lg:px-14"><header class="mb-12 grid gap-6 lg:grid-cols-2 lg:gap-24"><div><p class="mb-4 font-body text-xs font-bold uppercase tracking-[.18em] text-[var(--brand-accent)]">Feedback</p><h2 class="font-display text-4xl leading-[1.12] text-white lg:text-5xl">What clients say</h2></div></header><div class="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-16"><figure class="m-0 flex flex-col justify-between border-l-2 border-[var(--brand-accent)] bg-[linear-gradient(135deg,rgba(var(--brand-accent-rgb),.08),transparent)] p-7 lg:p-10"><div><span aria-hidden="true" class="font-display text-7xl leading-none text-[var(--brand-accent)]">“</span><blockquote class="font-display text-2xl leading-snug text-white md:text-3xl lg:text-4xl"><p>First quote</p></blockquote></div><figcaption class="mt-8 font-body"><span class="block text-sm font-semibold text-white">Ann Lee</span><span class="mt-1 block text-xs text-white/60">Workshop · 2026</span></figcaption></figure><div class="divide-y divide-white/15"><figure class="m-0 py-6 first:pt-0 last:pb-0"><blockquote class="font-body text-base leading-relaxed text-white/80"><p>“Second quote”</p></blockquote><figcaption class="mt-5 font-body text-sm"><span class="font-semibold text-white">Bo Diaz</span></figcaption></figure></div></div></div></section>',
    );
  });

  it("keeps the lead quote, two featured quotes and the collapsed rest", () => {
    render(
      <SiteConfigContext.Provider
        value={flat({
          overline: "From the Community",
          heading: "In their own words",
          intro: "Feedback from live training",
          items: SPEC_COMMUNITY,
        })}
      >
        <HomeTestimonials />
      </SiteConfigContext.Provider>,
    );
    const section = document.getElementById("testimonials")!;
    expect(section.getAttribute("aria-label")).toBe("In their own words");
    expect(within(section).queryAllByRole("heading", { level: 3 })).toEqual([]);
    const details = section.querySelector("details")!;
    expect(details.querySelectorAll("figure")).toHaveLength(3);
    for (const item of SPEC_COMMUNITY)
      expect(section.textContent).toContain(item.attribution);
    expect(section.querySelector("img")).toBeNull();
  });

  it("renders nothing without testimonials, as member sites start", () => {
    expect(markup(memberPreset)).toBe("");
    expect(
      markup(flat({ overline: "Feedback", heading: "Quotes", items: [] })),
    ).toBe("");
  });
});
