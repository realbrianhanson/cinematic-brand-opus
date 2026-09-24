import { describe, expect, it } from "vitest";
import { errorMessage, isErrorCode } from "../errorMessage";

const pg = (code: string, message: string, details = "") => ({
  code,
  message,
  details,
  hint: null,
});

describe("errorMessage", () => {
  it("keeps plain errors, message objects and unknown values compatible", () => {
    expect(errorMessage(new Error("Network down"))).toBe("Network down");
    expect(errorMessage({ message: "Row not found" })).toBe("Row not found");
    expect(errorMessage(pg("42501", "permission denied for table x"))).toBe(
      "permission denied for table x",
    );
    expect(errorMessage(null)).toBe(
      "An unexpected error occurred. Please try again.",
    );
    expect(errorMessage("text")).toBe(
      "An unexpected error occurred. Please try again.",
    );
  });
  it("explains a duplicate offer URL", () => {
    expect(
      errorMessage(
        pg(
          "23505",
          'duplicate key value violates unique constraint "offers_slug_key"',
          "Key (slug)=(guide) already exists.",
        ),
      ),
    ).toBe(
      "That URL is already used by another offer. Choose a different page URL slug.",
    );
  });
  it("explains other duplicates without database wording", () => {
    const message = errorMessage(
      pg(
        "23505",
        'duplicate key value violates unique constraint "niches_slug_key"',
      ),
    );
    expect(message).toMatch(/already in use/);
    expect(message).not.toMatch(/constraint|duplicate key/);
  });
  it("gives reload guidance for concurrent changes", () => {
    const message = errorMessage(
      pg("40001", "Offer changed elsewhere. Reload before saving."),
    );
    expect(message).toMatch(/changed in another tab or by another admin/);
    expect(message).toMatch(/Reload/);
  });
  it("names the invalid offer builder input when the database rejects it", () => {
    expect(errorMessage(pg("22023", "Invalid offer builder document"))).toMatch(
      /could not be saved.*check/i,
    );
    expect(
      errorMessage(
        pg(
          "22023",
          "Save request identifier was already used for different content",
        ),
      ),
    ).toMatch(/Reload/);
  });
  it("puts foreign-key failures in plain English", () => {
    expect(
      errorMessage(
        pg(
          "23503",
          'insert or update on table "offers" violates foreign key constraint "offers_next_offer_id_fkey"',
        ),
      ),
    ).toBe(
      "The selected follow-up offer no longer exists. Choose another follow-up and save again.",
    );
    expect(
      errorMessage(
        pg(
          "23503",
          'update or delete on table "offers" violates foreign key constraint "offer_orders_offer_id_fkey" on table "offer_orders"',
        ),
      ),
    ).toMatch(/has orders.*Archive/);
    const generic = errorMessage(
      pg(
        "23503",
        'update or delete on table "niches" violates foreign key constraint "x" on table "pages"',
      ),
    );
    expect(generic).toMatch(/still used by other records/);
    expect(generic).not.toMatch(/constraint/);
    expect(
      errorMessage(
        pg(
          "23503",
          'insert or update on table "posts" violates foreign key constraint "posts_niche_fkey"',
        ),
      ),
    ).toMatch(/linked item no longer exists/);
  });
  it("detects Postgres codes", () => {
    expect(isErrorCode(pg("40001", "x"), "40001")).toBe(true);
    expect(isErrorCode(new Error("40001"), "40001")).toBe(false);
  });
});
