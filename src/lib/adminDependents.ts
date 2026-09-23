import { errorMessage } from "@/lib/errorMessage";

/**
 * Helpers for admin screens that edit or delete rows other content depends on
 * (niches, content formats). Kept pure so the rules are unit-tested.
 */

export type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Merge the edit form's context fields over the niche's stored context.
 * Keys the form does not know about (target_keyword, content_focus, anything
 * added later by pipelines) are kept. Returns a new object.
 */
export function mergeNicheContext(
  original: unknown,
  formContext: JsonRecord,
): JsonRecord {
  const base = isRecord(original) ? original : {};
  return { ...base, ...formContext };
}

export interface NicheDependents {
  /** generated_pages rows that point at the niche via niche_id or silo_niche_id */
  generated: number;
  /** pillar_pages rows (ON DELETE SET NULL — they get unlinked) */
  pillars: number;
  /** child niches (ON DELETE SET NULL — they lose their parent) */
  children: number;
}

export interface DeleteVerdict {
  blocked: boolean;
  message: string;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export function describeNicheDelete(
  name: string,
  deps: NicheDependents,
): DeleteVerdict {
  if (deps.generated > 0) {
    return {
      blocked: true,
      message: `"${name}" is used by ${plural(deps.generated, "generated page", "generated pages")}, so it can't be deleted. Deactivate it instead to stop it being used for new content. Existing pages stay as they are.`,
    };
  }
  const effects: string[] = [];
  if (deps.pillars > 0) {
    effects.push(
      `${plural(deps.pillars, "topic guide", "topic guides")} will be unlinked from this niche.`,
    );
  }
  if (deps.children > 0) {
    effects.push(
      `${plural(deps.children, "sub-niche", "sub-niches")} will no longer have a parent.`,
    );
  }
  return {
    blocked: false,
    message: [...effects, "This cannot be undone."].join(" "),
  };
}

export function describeContentTypeDelete(pageCount: number): DeleteVerdict {
  if (pageCount > 0) {
    return {
      blocked: true,
      message: `${plural(pageCount, "generated page uses", "generated pages use")} this format, so it can't be deleted. Delete or reassign those pages first, or deactivate the format to stop generating new pages with it. Existing pages stay live.`,
    };
  }
  return {
    blocked: false,
    message:
      "No generated pages use this format. Deleting it cannot be undone.",
  };
}

const FK_VIOLATION = "23503";

const isForeignKeyViolation = (error: unknown): boolean => {
  if (isRecord(error) && error.code === FK_VIOLATION) return true;
  return /violates foreign key constraint/i.test(errorMessage(error));
};

/** Plain-English message for a failed delete; maps FK violations (23503). */
export function deleteErrorMessage(error: unknown, subject: string): string {
  if (isForeignKeyViolation(error)) {
    return `This ${subject} is still used by other content (pages or guides), so it can't be deleted. Remove or reassign that content first, or deactivate it instead.`;
  }
  return errorMessage(error);
}
