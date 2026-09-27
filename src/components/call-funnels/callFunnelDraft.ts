import {
  callAnswerError,
  cleanCallAnswers,
  type CallAnswers,
  type CallFunnelConfig,
  type CallPublication,
} from "../../../supabase/functions/_shared/callFunnels";

export type ApplicationDraft = {
  answers: CallAnswers;
  step: string;
};
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** Changes to draft questions invalidate recovery, including unpublished previews. */
export function callDraftKey(
  publication: CallPublication,
  preview: boolean,
  qualificationRules: CallFunnelConfig["qualificationRules"] = [],
) {
  const signature = JSON.stringify([
    publication.config.questions,
    publication.config.application.consentText,
    preview ? qualificationRules : [],
  ]);
  let hash = 2166136261;
  for (let i = 0; i < signature.length; i++) {
    hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619);
  }
  return `call-application:v1:${preview ? "preview" : "live"}:${publication.id}:${publication.revision}:${hash >>> 0}`;
}

export function readCallDraft(
  key: string,
  publication: CallPublication,
): ApplicationDraft | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw || raw.length > 40000) return null;
    const value = JSON.parse(raw);
    if (
      value?.version !== 1 ||
      !Number.isFinite(value.savedAt) ||
      Date.now() - value.savedAt > MAX_AGE ||
      value.savedAt > Date.now() + 60000 ||
      !value.answers ||
      typeof value.answers !== "object" ||
      Array.isArray(value.answers)
    )
      return null;
    const valid = Object.fromEntries(
      publication.config.questions
        .filter(
          (q) =>
            typeof value.answers[q.id] === "string" &&
            !callAnswerError(q, value.answers[q.id]),
        )
        .map((q) => [q.id, value.answers[q.id]]),
    );
    return {
      answers: cleanCallAnswers(publication.config, valid),
      step: typeof value.step === "string" ? value.step : "",
    };
  } catch {
    return null;
  }
}

export function saveCallDraft(key: string, draft: ApplicationDraft): boolean {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ version: 1, savedAt: Date.now(), ...draft }),
    );
    return true;
  } catch {
    return false;
  }
}

export function removeCallDraft(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* Recovery is optional. */
  }
}
