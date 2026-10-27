import { describe, expect, it } from "vitest";
import {
  ghlBookingWidgetId,
  ghlEmbedUrl,
  isGhlBookingUrl,
} from "../../../supabase/functions/_shared/ghlBooking";

const widget =
  "https://api.aiforbusiness.com/widget/booking/mEmvmXjJ7RG3TywMLIir";

describe("GHL booking widgets", () => {
  it("recognizes white-label widget links and nothing else", () => {
    expect(ghlBookingWidgetId(widget)).toBe("mEmvmXjJ7RG3TywMLIir");
    expect(
      isGhlBookingUrl(
        "https://api.leadconnectorhq.com/widget/booking/abc12345",
      ),
    ).toBe(true);
    expect(
      isGhlBookingUrl(
        "http://api.aiforbusiness.com/widget/booking/mEmvmXjJ7RG3TywMLIir",
      ),
    ).toBe(false);
    expect(isGhlBookingUrl("https://calendly.com/brian/strategy")).toBe(false);
    expect(isGhlBookingUrl("https://example.com/widget/booking/")).toBe(false);
    expect(isGhlBookingUrl("not a url")).toBe(false);
  });

  it("prefills first name, last name, email and phone", () => {
    const url = new URL(
      ghlEmbedUrl(
        widget,
        { name: "Pat Van Lee", email: "pat@example.com" },
        " 5155550142 ",
      ),
    );
    expect(url.searchParams.get("first_name")).toBe("Pat");
    expect(url.searchParams.get("last_name")).toBe("Van Lee");
    expect(url.searchParams.get("email")).toBe("pat@example.com");
    expect(url.searchParams.get("phone")).toBe("5155550142");
  });

  it("leaves out fields the applicant never gave", () => {
    const url = new URL(ghlEmbedUrl(widget, { name: "Pat", email: "" }));
    expect(url.searchParams.get("first_name")).toBe("Pat");
    expect(url.searchParams.has("last_name")).toBe(false);
    expect(url.searchParams.has("email")).toBe(false);
    expect(url.searchParams.has("phone")).toBe(false);
  });
});
