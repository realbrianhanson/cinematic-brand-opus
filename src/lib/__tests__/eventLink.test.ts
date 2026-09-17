import { describe, expect, it } from "vitest";
import { linkifyEventMentions } from "../../../supabase/functions/_shared/eventLink";
describe("event links respect site ownership", () => {
  const text = "Join the free 3-day virtual AI training.";
  it("preserves the configured original event", () => {
    expect(
      linkifyEventMentions(text, "https://aiforbeginners.com/?via=blog"),
    ).toContain("](https://aiforbeginners.com/?via=blog)");
  });
  it("does not insert owner event links into a member's unrelated offer", () => {
    for (const url of [
      null,
      "",
      "https://cedar.example.com/contact",
      "javascript:alert(1)",
    ]) {
      expect(linkifyEventMentions(text, url)).toBe(text);
    }
  });
});
