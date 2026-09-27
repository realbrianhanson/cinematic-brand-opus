import { useId, useRef, useState, type ReactNode } from "react";
import type {
  CallFunnelConfig,
  CallMedia,
  CallQuestion,
} from "@/lib/callFunnels";
import { emptyCallPreparationExtras } from "@/lib/callFunnels";
import type { OfferProof } from "@/lib/offerBuilder";
import { normalizeCallFunnelScripts } from "@/lib/callFunnelScripts";
import CallScriptWorkspace from "./CallScriptWorkspace";

const tabs = [
  "Design",
  "Invitation",
  "Application",
  "Booking",
  "Preparation",
  "Training",
  "Alternative",
  "Proof",
  "Scripts",
] as const;
type Tab = (typeof tabs)[number];
const inputClass = "admin-input mt-2 w-full min-h-11 text-base";
const buttonClass = "admin-btn-ghost min-h-11";
const stableId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function TextField({
  label,
  value,
  onChange,
  maxLength = 500,
  multiline = false,
  help,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  multiline?: boolean;
  help?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          className={inputClass}
          rows={4}
          maxLength={maxLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={help ? `${id}-help` : undefined}
          placeholder={placeholder}
        />
      ) : (
        <input
          id={id}
          className={inputClass}
          maxLength={maxLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={help ? `${id}-help` : undefined}
          placeholder={placeholder}
        />
      )}
      {help && (
        <p id={`${id}-help`} className="admin-help mt-1">
          {help}
        </p>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  help,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  help?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        step={1}
        min={min}
        max={max}
        className={inputClass}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        aria-describedby={help ? `${id}-help` : undefined}
      />
      {help && (
        <p id={`${id}-help`} className="admin-help mt-1">
          {help}
        </p>
      )}
    </div>
  );
}

function MediaFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CallMedia;
  onChange: (value: CallMedia) => void;
}) {
  return (
    <fieldset className="min-w-0 rounded-xl border border-current/10 p-4 space-y-4">
      <legend className="px-2 text-sm font-semibold">{label} video</legend>
      <TextField
        label={`${label} video URL`}
        value={value.url}
        maxLength={2048}
        onChange={(url) => onChange({ ...value, url })}
        help="Use a supported video address. Leave blank until your video is ready."
      />
      <TextField
        label={`${label} poster image URL`}
        value={value.poster}
        maxLength={2048}
        onChange={(poster) => onChange({ ...value, poster })}
        help="Optional still image shown before playback."
      />
      <TextField
        label={`${label} transcript`}
        value={value.transcript}
        maxLength={12000}
        multiline
        onChange={(transcript) => onChange({ ...value, transcript })}
        help="Add the spoken content so visitors can read it as well as watch."
      />
    </fieldset>
  );
}

function Panel({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-card p-5 space-y-5">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        {help && <p className="admin-help">{help}</p>}
      </div>
      {children}
    </div>
  );
}

/** Stable UI keys for schema lists that intentionally store plain strings/objects without IDs. */
function RepeatList<T>({
  label,
  items,
  onChange,
  max,
  blank,
  children,
}: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  max: number;
  blank: () => T;
  children: (item: T, update: (item: T) => void, index: number) => ReactNode;
}) {
  const keys = useRef<string[]>([]);
  while (keys.current.length < items.length) keys.current.push(stableId("row"));
  if (keys.current.length > items.length) keys.current.length = items.length;
  function move(index: number, offset: number) {
    const next = [...items];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    [keys.current[index], keys.current[index + offset]] = [
      keys.current[index + offset],
      keys.current[index],
    ];
    onChange(next);
  }
  return (
    <fieldset className="min-w-0 space-y-4">
      <legend className="text-base font-semibold">{label}</legend>
      {items.map((item, index) => (
        <div
          key={keys.current[index]}
          className="rounded-xl border border-current/10 p-4 space-y-3"
        >
          {children(
            item,
            (next) =>
              onChange(
                items.map((existing, at) => (at === index ? next : existing)),
              ),
            index,
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={index === 0}
              aria-label={`Move ${label.toLowerCase()} item ${index + 1} up`}
              onClick={() => move(index, -1)}
            >
              Move up
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={index === items.length - 1}
              aria-label={`Move ${label.toLowerCase()} item ${index + 1} down`}
              onClick={() => move(index, 1)}
            >
              Move down
            </button>
            <button
              type="button"
              className={buttonClass}
              aria-label={`Remove ${label.toLowerCase()} item ${index + 1}`}
              onClick={() => {
                keys.current.splice(index, 1);
                onChange(items.filter((_, at) => at !== index));
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className={buttonClass}
        disabled={items.length >= max}
        onClick={() => {
          keys.current.push(stableId("row"));
          onChange([...items, blank()]);
        }}
      >
        Add {label.toLowerCase()} item
      </button>
      <p className="admin-help">
        {items.length} of {max} items
      </p>
    </fieldset>
  );
}

export default function CallFunnelEditor({
  config,
  onChange,
  proof,
  disabled = false,
}: {
  config: CallFunnelConfig;
  onChange: (next: CallFunnelConfig) => void;
  proof: OfferProof[];
  disabled?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("Design");
  const [notice, setNotice] = useState("");
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const extras = config.preparation.extras ?? emptyCallPreparationExtras();
  function updateExtras(next: typeof extras) {
    update("preparation", { ...config.preparation, extras: next });
  }
  function update<K extends keyof CallFunnelConfig>(
    key: K,
    next: CallFunnelConfig[K],
  ) {
    if (!disabled) {
      setNotice("");
      onChange({ ...config, [key]: next });
    }
  }
  function updateQuestion(question: CallQuestion) {
    update(
      "questions",
      config.questions.map((item) =>
        item.id === question.id ? question : item,
      ),
    );
  }
  function isReferenced(questionId: string, optionId?: string) {
    return (
      config.questions.some(
        (question) =>
          question.showWhen?.questionId === questionId &&
          (!optionId || question.showWhen.optionId === optionId),
      ) ||
      config.qualificationRules.some(
        (rule) =>
          rule.questionId === questionId &&
          (!optionId || rule.optionId === optionId),
      )
    );
  }
  function removeQuestion(question: CallQuestion) {
    if (isReferenced(question.id)) {
      setNotice(
        "This question is used by a conditional question or fit rule. Remove those connections before deleting it.",
      );
      return;
    }
    update(
      "questions",
      config.questions.filter((item) => item.id !== question.id),
    );
  }
  function moveQuestion(index: number, offset: number) {
    const next = [...config.questions];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    if (
      next.some(
        (question, at) =>
          question.showWhen &&
          !next
            .slice(0, at)
            .some((prior) => prior.id === question.showWhen!.questionId),
      )
    ) {
      setNotice(
        "Keep each conditional question after the question that controls it. Update its display condition before moving it here.",
      );
      return;
    }
    update("questions", next);
  }
  function changeQuestionType(
    question: CallQuestion,
    type: CallQuestion["type"],
  ) {
    if (type === question.type) return;
    if (isReferenced(question.id)) {
      setNotice(
        "This answer type is used by a conditional question or fit rule. Remove those connections before changing its type.",
      );
      return;
    }
    updateQuestion({
      ...question,
      type,
      options:
        type === "single"
          ? [
              { id: stableId("choice"), label: "First option" },
              { id: stableId("choice"), label: "Second option" },
            ]
          : [],
    });
  }
  function toggleProof(
    itemId: string,
    location: "invitation" | "alternative" | "preparation",
    selected: boolean,
  ) {
    const ids =
      location === "invitation"
        ? config.proofIds
        : location === "preparation"
          ? extras.proofIds
          : config.alternative.proofIds;
    const next = selected
      ? [...ids, itemId]
      : ids.filter((value) => value !== itemId);
    if (next.length > 12 || disabled) return;
    const proofImages = { ...config.proofImages };
    const other = [
      ...(location !== "invitation" ? config.proofIds : []),
      ...(location !== "alternative" ? config.alternative.proofIds : []),
      ...(location !== "preparation" ? extras.proofIds : []),
    ];
    if (!selected && !other.includes(itemId)) delete proofImages[itemId];
    setNotice("");
    onChange({
      ...config,
      proofImages,
      ...(location === "invitation"
        ? { proofIds: next }
        : location === "preparation"
          ? {
              preparation: {
                ...config.preparation,
                extras: { ...extras, proofIds: next },
              },
            }
          : { alternative: { ...config.alternative, proofIds: next } }),
    });
  }
  const approvedProof = proof.filter((item) => item.approved);
  const unavailableProof = [
    ...new Set([
      ...config.proofIds,
      ...config.alternative.proofIds,
      ...extras.proofIds,
    ]),
  ].filter((proofId) => !approvedProof.some((item) => item.id === proofId));

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Call funnel settings"
        className="flex gap-2 overflow-x-auto pb-2"
      >
        {tabs.map((name, index) => (
          <button
            key={name}
            type="button"
            id={`${id}-tab-${name}`}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            role="tab"
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            aria-controls={`${id}-panel-${name}`}
            className={`${tab === name ? "admin-btn-primary" : "admin-btn-ghost"} min-h-11 whitespace-nowrap`}
            onClick={() => {
              setTab(name);
              setNotice("");
            }}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index - 1 + tabs.length) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                setTab(tabs[next]);
                setNotice("");
                tabRefs.current[next]?.focus();
              }
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {notice && (
        <p role="alert" className="admin-notice admin-notice-error">
          {notice}
        </p>
      )}
      <div
        role="tabpanel"
        id={`${id}-panel-${tab}`}
        aria-labelledby={`${id}-tab-${tab}`}
        tabIndex={0}
      >
        <fieldset disabled={disabled} className="min-w-0 space-y-5">
          <legend className="sr-only">{tab} settings</legend>
          {tab === "Design" && (
            <>
              <Panel
                title="Make the template yours"
                help="The layout keeps a clear hierarchy from the headline to the video, proof and application."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium">
                    Color mode
                    <select
                      className={inputClass}
                      value={config.theme.mode}
                      onChange={(event) =>
                        update("theme", {
                          ...config.theme,
                          mode: event.target
                            .value as CallFunnelConfig["theme"]["mode"],
                        })
                      }
                    >
                      <option value="dark">Dark</option>
                      <option value="light">White</option>
                      <option value="site">Follow the site</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Heading style
                    <select
                      className={inputClass}
                      value={config.theme.font}
                      onChange={(event) =>
                        update("theme", {
                          ...config.theme,
                          font: event.target
                            .value as CallFunnelConfig["theme"]["font"],
                        })
                      }
                    >
                      <option value="sans">Clean sans serif</option>
                      <option value="serif">Editorial serif</option>
                      <option value="brand">Site brand font</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Accent color picker
                    <input
                      type="color"
                      aria-label="Accent color picker"
                      className={`${inputClass} h-12`}
                      value={
                        /^#[a-f0-9]{6}$/i.test(config.theme.accent)
                          ? config.theme.accent
                          : "#7c3aed"
                      }
                      onChange={(event) =>
                        update("theme", {
                          ...config.theme,
                          accent: event.target.value,
                        })
                      }
                    />
                  </label>
                  <TextField
                    label="Accent color hex"
                    value={config.theme.accent}
                    maxLength={7}
                    onChange={(accent) =>
                      update("theme", { ...config.theme, accent })
                    }
                    help="Use a six-digit color such as #7c3aed. Check the preview in both modes."
                  />
                </div>
                <TextField
                  label="Brand name"
                  value={config.brand.name}
                  maxLength={160}
                  onChange={(name) =>
                    update("brand", { ...config.brand, name })
                  }
                />
              </Panel>
              <Panel title="Introduce the host">
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    label="Host name"
                    value={config.brand.hostName}
                    maxLength={160}
                    onChange={(hostName) =>
                      update("brand", { ...config.brand, hostName })
                    }
                  />
                  <TextField
                    label="Host role"
                    value={config.brand.hostRole}
                    maxLength={160}
                    onChange={(hostRole) =>
                      update("brand", { ...config.brand, hostRole })
                    }
                  />
                </div>
                <TextField
                  label="Host introduction"
                  value={config.brand.hostBio}
                  maxLength={3000}
                  multiline
                  onChange={(hostBio) =>
                    update("brand", { ...config.brand, hostBio })
                  }
                />
                <TextField
                  label="Host image URL"
                  value={config.brand.hostImage}
                  maxLength={2048}
                  onChange={(hostImage) =>
                    update("brand", { ...config.brand, hostImage })
                  }
                />
              </Panel>
            </>
          )}
          {tab === "Invitation" && (
            <Panel
              title="Video invitation"
              help="Make one clear promise, show the idea and invite the right person to apply."
            >
              <TextField
                label="Audience qualifier"
                value={config.invitation.audience}
                onChange={(audience) =>
                  update("invitation", { ...config.invitation, audience })
                }
              />
              <TextField
                label="Invitation headline"
                value={config.invitation.headline}
                onChange={(headline) =>
                  update("invitation", { ...config.invitation, headline })
                }
              />
              <TextField
                label="Invitation description"
                value={config.invitation.description}
                maxLength={2000}
                multiline
                onChange={(description) =>
                  update("invitation", { ...config.invitation, description })
                }
              />
              <TextField
                label="Watch prompt"
                value={config.invitation.watchPrompt}
                onChange={(watchPrompt) =>
                  update("invitation", { ...config.invitation, watchPrompt })
                }
              />
              <MediaFields
                label="Invitation"
                value={config.invitation.video}
                onChange={(video) =>
                  update("invitation", { ...config.invitation, video })
                }
              />
              <TextField
                label="Core promise"
                value={config.invitation.promise}
                onChange={(promise) =>
                  update("invitation", { ...config.invitation, promise })
                }
              />
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Application button text"
                  value={config.invitation.cta}
                  onChange={(cta) =>
                    update("invitation", { ...config.invitation, cta })
                  }
                />
                <TextField
                  label="Button supporting text"
                  value={config.invitation.ctaSubline}
                  onChange={(ctaSubline) =>
                    update("invitation", { ...config.invitation, ctaSubline })
                  }
                />
              </div>
              <TextField
                label="Reassurance"
                value={config.invitation.reassurance}
                maxLength={2000}
                multiline
                onChange={(reassurance) =>
                  update("invitation", { ...config.invitation, reassurance })
                }
              />
              <TextField
                label="Testimonial section heading"
                value={config.invitation.proofHeading}
                onChange={(proofHeading) =>
                  update("invitation", { ...config.invitation, proofHeading })
                }
              />
              <TextField
                label="Closing headline"
                value={config.invitation.closingHeadline}
                onChange={(closingHeadline) =>
                  update("invitation", {
                    ...config.invitation,
                    closingHeadline,
                  })
                }
              />
            </Panel>
          )}
          {tab === "Application" && (
            <>
              <Panel
                title="A guided application"
                help="Visitors answer one question at a time, review their answers, then submit their name and email."
              >
                <TextField
                  label="Application heading"
                  value={config.application.heading}
                  maxLength={300}
                  onChange={(heading) =>
                    update("application", { ...config.application, heading })
                  }
                />
                <TextField
                  label="Application introduction"
                  value={config.application.intro}
                  maxLength={1200}
                  multiline
                  onChange={(intro) =>
                    update("application", { ...config.application, intro })
                  }
                />
                <TextField
                  label="Application consent text"
                  value={config.application.consentText}
                  maxLength={1200}
                  multiline
                  onChange={(consentText) =>
                    update("application", {
                      ...config.application,
                      consentText,
                    })
                  }
                  help="Explain how you will use the answers and contact details. This is separate from marketing consent."
                />
                <TextField
                  label="Privacy notice URL"
                  value={config.application.privacyUrl}
                  maxLength={2048}
                  onChange={(privacyUrl) =>
                    update("application", { ...config.application, privacyUrl })
                  }
                  help="Use an HTTPS address or a path on this site, such as /privacy."
                />
              </Panel>
              <Panel
                title="Application questions"
                help="Use choice questions for fit rules. Conditional questions can depend on an earlier choice answer."
              >
                {config.questions.map((question, index) => (
                  <fieldset
                    key={question.id}
                    className="min-w-0 rounded-xl border border-current/10 p-4 space-y-4"
                  >
                    <legend className="px-2 text-sm font-semibold">
                      Question {index + 1}
                    </legend>
                    <TextField
                      label={`Question ${index + 1} label`}
                      value={question.label}
                      onChange={(label) =>
                        updateQuestion({ ...question, label })
                      }
                    />
                    <TextField
                      label={`Question ${index + 1} help`}
                      value={question.help}
                      maxLength={1000}
                      onChange={(help) => updateQuestion({ ...question, help })}
                    />
                    <label className="block text-sm font-medium">
                      Question {index + 1} answer type
                      <select
                        className={inputClass}
                        value={question.type}
                        onChange={(event) =>
                          changeQuestionType(
                            question,
                            event.target.value as CallQuestion["type"],
                          )
                        }
                      >
                        <option value="single">Choose one answer</option>
                        <option value="text">Short answer</option>
                        <option value="textarea">Long answer</option>
                      </select>
                    </label>
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={question.required}
                        onChange={(event) =>
                          updateQuestion({
                            ...question,
                            required: event.target.checked,
                          })
                        }
                      />
                      Question {index + 1} is required
                    </label>
                    {question.type === "single" && (
                      <div className="space-y-3">
                        {question.options.map((option, at) => (
                          <div
                            key={option.id}
                            className="rounded-lg border border-current/10 p-3 space-y-2"
                          >
                            <TextField
                              label={`Question ${index + 1}, choice ${at + 1}`}
                              value={option.label}
                              maxLength={300}
                              onChange={(label) =>
                                updateQuestion({
                                  ...question,
                                  options: question.options.map((item) =>
                                    item.id === option.id
                                      ? { ...item, label }
                                      : item,
                                  ),
                                })
                              }
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className={buttonClass}
                                disabled={at === 0}
                                aria-label={`Move question ${index + 1} choice ${at + 1} up`}
                                onClick={() => {
                                  const options = [...question.options];
                                  [options[at], options[at - 1]] = [
                                    options[at - 1],
                                    options[at],
                                  ];
                                  updateQuestion({ ...question, options });
                                }}
                              >
                                Move up
                              </button>
                              <button
                                type="button"
                                className={buttonClass}
                                disabled={at === question.options.length - 1}
                                aria-label={`Move question ${index + 1} choice ${at + 1} down`}
                                onClick={() => {
                                  const options = [...question.options];
                                  [options[at], options[at + 1]] = [
                                    options[at + 1],
                                    options[at],
                                  ];
                                  updateQuestion({ ...question, options });
                                }}
                              >
                                Move down
                              </button>
                              <button
                                type="button"
                                className={buttonClass}
                                disabled={question.options.length <= 2}
                                aria-label={`Remove question ${index + 1} choice ${at + 1}`}
                                onClick={() => {
                                  if (isReferenced(question.id, option.id)) {
                                    setNotice(
                                      "This answer is used by a conditional question or fit rule. Remove those connections before deleting it.",
                                    );
                                    return;
                                  }
                                  updateQuestion({
                                    ...question,
                                    options: question.options.filter(
                                      (item) => item.id !== option.id,
                                    ),
                                  });
                                }}
                              >
                                Remove choice
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={question.options.length >= 8}
                          onClick={() =>
                            updateQuestion({
                              ...question,
                              options: [
                                ...question.options,
                                { id: stableId("choice"), label: "New option" },
                              ],
                            })
                          }
                        >
                          Add choice to question {index + 1}
                        </button>
                      </div>
                    )}
                    <label className="block text-sm font-medium">
                      Show question {index + 1} when
                      <select
                        className={inputClass}
                        value={
                          question.showWhen
                            ? `${question.showWhen.questionId}:${question.showWhen.optionId}`
                            : ""
                        }
                        onChange={(event) => {
                          const next = { ...question };
                          if (!event.target.value) delete next.showWhen;
                          else {
                            const [questionId, optionId] =
                              event.target.value.split(":");
                            next.showWhen = { questionId, optionId };
                          }
                          updateQuestion(next);
                        }}
                      >
                        <option value="">Always show</option>
                        {config.questions
                          .slice(0, index)
                          .filter((prior) => prior.type === "single")
                          .flatMap((prior) =>
                            prior.options.map((option) => (
                              <option
                                key={`${prior.id}:${option.id}`}
                                value={`${prior.id}:${option.id}`}
                              >
                                {prior.label} → {option.label}
                              </option>
                            )),
                          )}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={index === 0}
                        onClick={() => moveQuestion(index, -1)}
                        aria-label={`Move question ${index + 1} up`}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={index === config.questions.length - 1}
                        onClick={() => moveQuestion(index, 1)}
                        aria-label={`Move question ${index + 1} down`}
                      >
                        Move down
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={config.questions.length <= 1}
                        onClick={() => removeQuestion(question)}
                        aria-label={`Remove question ${index + 1}`}
                      >
                        Remove question
                      </button>
                    </div>
                  </fieldset>
                ))}
                <button
                  type="button"
                  className={buttonClass}
                  disabled={config.questions.length >= 15}
                  onClick={() =>
                    update("questions", [
                      ...config.questions,
                      {
                        id: stableId("question"),
                        label: "New question",
                        help: "",
                        type: "single",
                        required: true,
                        options: [
                          { id: stableId("choice"), label: "First option" },
                          { id: stableId("choice"), label: "Second option" },
                        ],
                      },
                    ])
                  }
                >
                  Add question
                </button>
                <p className="admin-help">
                  {config.questions.length} of 15 questions
                </p>
              </Panel>
              <Panel
                title="Fit rules"
                help="If any selected answer below matches, the visitor sees your alternative offer. All other completed applications continue to the calendar. Answers to hidden questions do not count."
              >
                {config.questions
                  .filter((question) => question.type === "single")
                  .map((question) => (
                    <fieldset key={question.id} className="space-y-2">
                      <legend className="text-sm font-medium">
                        {question.label}
                      </legend>
                      {question.options.map((option) => {
                        const selected = config.qualificationRules.some(
                          (rule) =>
                            rule.questionId === question.id &&
                            rule.optionId === option.id,
                        );
                        return (
                          <label
                            key={option.id}
                            className="flex min-h-11 items-center gap-3 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={
                                !selected &&
                                config.qualificationRules.length >= 30
                              }
                              onChange={(event) =>
                                update(
                                  "qualificationRules",
                                  event.target.checked
                                    ? [
                                        ...config.qualificationRules,
                                        {
                                          questionId: question.id,
                                          optionId: option.id,
                                          outcome: "alternative",
                                        },
                                      ]
                                    : config.qualificationRules.filter(
                                        (rule) =>
                                          rule.questionId !== question.id ||
                                          rule.optionId !== option.id,
                                      ),
                                )
                              }
                            />
                            Send to alternative: {question.label} —{" "}
                            {option.label}
                          </label>
                        );
                      })}
                    </fieldset>
                  ))}
                {!config.questions.some(
                  (question) => question.type === "single",
                ) && (
                  <p className="admin-help">
                    Add a choice question to create a fit rule.
                  </p>
                )}
                <p className="admin-help">
                  {config.qualificationRules.length} of 30 fit rules
                </p>
              </Panel>
            </>
          )}
          {tab === "Booking" && (
            <Panel
              title="Connect the calendar"
              help="A calendar click is an invitation to schedule. The preparation page only confirms a booking after a verified update or your manual confirmation."
            >
              <TextField
                label="Calendar URL"
                value={config.booking.url}
                maxLength={2048}
                onChange={(url) =>
                  update("booking", { ...config.booking, url })
                }
                help="Paste the complete HTTPS booking address from your scheduling provider."
              />
              <TextField
                label="Calendar button text"
                value={config.booking.label}
                maxLength={120}
                onChange={(label) =>
                  update("booking", { ...config.booking, label })
                }
              />
              <NumberField
                label="Call length in minutes"
                value={config.booking.minutes}
                min={5}
                max={240}
                onChange={(minutes) =>
                  update("booking", { ...config.booking, minutes })
                }
              />
              <TextField
                label="Call agenda"
                value={config.booking.agenda}
                maxLength={3000}
                multiline
                onChange={(agenda) =>
                  update("booking", { ...config.booking, agenda })
                }
              />
            </Panel>
          )}
          {tab === "Preparation" && (
            <Panel title="Help prospects arrive prepared">
              <TextField
                label="Preparation headline"
                value={config.preparation.headline}
                maxLength={300}
                onChange={(headline) =>
                  update("preparation", { ...config.preparation, headline })
                }
              />
              <TextField
                label="Preparation introduction"
                value={config.preparation.intro}
                maxLength={2000}
                multiline
                onChange={(intro) =>
                  update("preparation", { ...config.preparation, intro })
                }
              />
              <MediaFields
                label="Preparation"
                value={config.preparation.video}
                onChange={(video) =>
                  update("preparation", { ...config.preparation, video })
                }
              />
              <RepeatList
                label="Checklist"
                items={config.preparation.checklist}
                max={12}
                blank={() => "New preparation step"}
                onChange={(checklist) =>
                  update("preparation", { ...config.preparation, checklist })
                }
              >
                {(item, change, index) => (
                  <TextField
                    label={`Checklist step ${index + 1}`}
                    value={item}
                    onChange={change}
                  />
                )}
              </RepeatList>
              <fieldset className="min-w-0 rounded-xl border border-current/10 p-4 space-y-4">
                <legend className="px-2 text-base font-semibold">
                  Offer overview
                </legend>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={extras.overview.enabled}
                    onChange={(event) =>
                      updateExtras({
                        ...extras,
                        overview: {
                          ...extras.overview,
                          enabled: event.target.checked,
                        },
                      })
                    }
                  />
                  Show the offer overview
                </label>
                <TextField
                  label="Overview heading"
                  value={extras.overview.heading}
                  maxLength={300}
                  onChange={(heading) =>
                    updateExtras({
                      ...extras,
                      overview: { ...extras.overview, heading },
                    })
                  }
                />
                <TextField
                  label="Overview description"
                  value={extras.overview.description}
                  maxLength={2000}
                  multiline
                  onChange={(description) =>
                    updateExtras({
                      ...extras,
                      overview: { ...extras.overview, description },
                    })
                  }
                />
                <TextField
                  label="Overview button"
                  value={extras.overview.button}
                  maxLength={120}
                  onChange={(button) =>
                    updateExtras({
                      ...extras,
                      overview: { ...extras.overview, button },
                    })
                  }
                />
                <TextField
                  label="Overview document or presentation URL"
                  value={extras.overview.url}
                  maxLength={2048}
                  help="Use a complete HTTPS link to an offer overview, PDF or presentation. Required to publish when enabled."
                  onChange={(url) =>
                    updateExtras({
                      ...extras,
                      overview: { ...extras.overview, url },
                    })
                  }
                />
              </fieldset>
              <fieldset className="min-w-0 rounded-xl border border-current/10 p-4 space-y-4">
                <legend className="px-2 text-base font-semibold">
                  Short answers before the call
                </legend>
                <p className="admin-help">
                  Explain the fit, investment and implementation in your own
                  words. Each answer can use text, a short video, or both.
                  Verify all offer details before publishing.
                </p>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={extras.objections.enabled}
                    onChange={(event) =>
                      updateExtras({
                        ...extras,
                        objections: {
                          ...extras.objections,
                          enabled: event.target.checked,
                        },
                      })
                    }
                  />
                  Show preparation questions
                </label>
                <TextField
                  label="Preparation questions heading"
                  value={extras.objections.heading}
                  maxLength={300}
                  onChange={(heading) =>
                    updateExtras({
                      ...extras,
                      objections: { ...extras.objections, heading },
                    })
                  }
                />
                <TextField
                  label="Preparation questions introduction"
                  value={extras.objections.intro}
                  maxLength={2000}
                  multiline
                  onChange={(intro) =>
                    updateExtras({
                      ...extras,
                      objections: { ...extras.objections, intro },
                    })
                  }
                />
                <RepeatList
                  label="Preparation answers"
                  items={extras.objections.items}
                  max={8}
                  blank={() => ({
                    enabled: true,
                    question: "Your next question",
                    answer: "",
                    video: { url: "", poster: "", transcript: "" },
                    captions: "",
                  })}
                  onChange={(items) =>
                    updateExtras({
                      ...extras,
                      objections: { ...extras.objections, items },
                    })
                  }
                >
                  {(item, change, index) => (
                    <>
                      <label className="flex min-h-11 items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={(event) =>
                            change({ ...item, enabled: event.target.checked })
                          }
                        />
                        Show answer {index + 1}
                      </label>
                      <TextField
                        label={`Preparation question ${index + 1}`}
                        value={item.question}
                        maxLength={300}
                        onChange={(question) => change({ ...item, question })}
                      />
                      <TextField
                        label={`Preparation answer ${index + 1}`}
                        value={item.answer}
                        maxLength={3000}
                        multiline
                        help="A readable answer is required when this question is published."
                        onChange={(answer) => change({ ...item, answer })}
                      />
                      <MediaFields
                        label={`Answer ${index + 1}`}
                        value={item.video}
                        onChange={(video) => change({ ...item, video })}
                      />
                      <TextField
                        label={`Answer ${index + 1} captions URL`}
                        value={item.captions}
                        maxLength={2048}
                        help="Optional HTTPS WebVTT file for an English MP4/WebM video. For YouTube/Vimeo, manage captions with that provider."
                        onChange={(captions) => change({ ...item, captions })}
                      />
                    </>
                  )}
                </RepeatList>
              </fieldset>
              <TextField
                label="Preparation proof heading"
                value={extras.proofHeading}
                maxLength={300}
                onChange={(proofHeading) =>
                  updateExtras({ ...extras, proofHeading })
                }
                help="Choose preparation-specific testimonials in the Proof tab. Leave every preparation selection unchecked to hide this section."
              />
            </Panel>
          )}
          {tab === "Training" && (
            <Panel title="Teach one useful idea">
              <TextField
                label="Training headline"
                value={config.training.headline}
                maxLength={300}
                onChange={(headline) =>
                  update("training", { ...config.training, headline })
                }
              />
              <TextField
                label="Training introduction"
                value={config.training.intro}
                maxLength={2000}
                multiline
                onChange={(intro) =>
                  update("training", { ...config.training, intro })
                }
              />
              <MediaFields
                label="Training"
                value={config.training.video}
                onChange={(video) =>
                  update("training", { ...config.training, video })
                }
              />
              <RepeatList
                label="Chapters"
                items={config.training.chapters}
                max={20}
                blank={() => ({
                  id: stableId("chapter"),
                  title: "New chapter",
                  seconds: 0,
                })}
                onChange={(chapters) =>
                  update("training", { ...config.training, chapters })
                }
              >
                {(item, change, index) => (
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField
                      label={`Chapter ${index + 1} title`}
                      value={item.title}
                      maxLength={300}
                      onChange={(title) => change({ ...item, title })}
                    />
                    <NumberField
                      label={`Chapter ${index + 1} start in seconds`}
                      value={item.seconds}
                      min={0}
                      max={86400}
                      onChange={(seconds) => change({ ...item, seconds })}
                    />
                  </div>
                )}
              </RepeatList>
              <TextField
                label="Visitor notes prompt"
                value={config.training.notesPrompt}
                onChange={(notesPrompt) =>
                  update("training", { ...config.training, notesPrompt })
                }
              />
            </Panel>
          )}
          {tab === "Alternative" && (
            <Panel
              title="Offer a useful alternative"
              help="Give people who are not ready for a call a relevant workshop, membership or resource. Keep the price and billing terms consistent with the destination."
            >
              <TextField
                label="Alternative headline"
                value={config.alternative.headline}
                maxLength={2000}
                onChange={(headline) =>
                  update("alternative", { ...config.alternative, headline })
                }
              />
              <TextField
                label="Alternative introduction"
                value={config.alternative.intro}
                maxLength={2000}
                multiline
                onChange={(intro) =>
                  update("alternative", { ...config.alternative, intro })
                }
              />
              <MediaFields
                label="Alternative"
                value={config.alternative.video}
                onChange={(video) =>
                  update("alternative", { ...config.alternative, video })
                }
              />
              <TextField
                label="Why this is the next step"
                value={config.alternative.story}
                maxLength={6000}
                multiline
                onChange={(story) =>
                  update("alternative", { ...config.alternative, story })
                }
              />
              <RepeatList
                label="Benefits"
                items={config.alternative.benefits}
                max={8}
                blank={() => ({ title: "New benefit", body: "" })}
                onChange={(benefits) =>
                  update("alternative", { ...config.alternative, benefits })
                }
              >
                {(item, change, index) => (
                  <>
                    <TextField
                      label={`Benefit ${index + 1} heading`}
                      value={item.title}
                      maxLength={300}
                      onChange={(title) => change({ ...item, title })}
                    />
                    <TextField
                      label={`Benefit ${index + 1} description`}
                      value={item.body}
                      maxLength={2000}
                      multiline
                      onChange={(body) => change({ ...item, body })}
                    />
                  </>
                )}
              </RepeatList>
              <RepeatList
                label="FAQs"
                items={config.alternative.faq}
                max={12}
                blank={() => ({ question: "New question", answer: "" })}
                onChange={(faq) =>
                  update("alternative", { ...config.alternative, faq })
                }
              >
                {(item, change, index) => (
                  <>
                    <TextField
                      label={`FAQ ${index + 1} question`}
                      value={item.question}
                      maxLength={300}
                      onChange={(question) => change({ ...item, question })}
                    />
                    <TextField
                      label={`FAQ ${index + 1} answer`}
                      value={item.answer}
                      maxLength={3000}
                      multiline
                      onChange={(answer) => change({ ...item, answer })}
                    />
                  </>
                )}
              </RepeatList>
              <TextField
                label="Alternative button text"
                value={config.alternative.cta}
                maxLength={2000}
                onChange={(cta) =>
                  update("alternative", { ...config.alternative, cta })
                }
              />
              <TextField
                label="Alternative destination URL"
                value={config.alternative.url}
                maxLength={2048}
                onChange={(url) =>
                  update("alternative", { ...config.alternative, url })
                }
              />
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Displayed price"
                  value={config.alternative.price}
                  maxLength={2000}
                  onChange={(price) =>
                    update("alternative", { ...config.alternative, price })
                  }
                />
                <TextField
                  label="Billing and cancellation terms"
                  value={config.alternative.billing}
                  maxLength={2000}
                  multiline
                  onChange={(billing) =>
                    update("alternative", { ...config.alternative, billing })
                  }
                />
              </div>
            </Panel>
          )}
          {tab === "Proof" && (
            <Panel
              title="Choose the right proof for each page"
              help="Only approved items from your proof library appear here. Choose up to 12 independently for the invitation, preparation and alternative. A quote stays in its original wording."
            >
              {!approvedProof.length && (
                <p className="admin-notice">
                  No approved proof is available. Add and approve real
                  testimonials or examples in the offer proof library first.
                </p>
              )}
              {unavailableProof.map((proofId) => (
                <div key={proofId} className="admin-notice space-y-2">
                  <p>
                    A previously selected proof item is unavailable or no longer
                    approved. Remove it before publishing.
                  </p>
                  {config.proofIds.includes(proofId) && (
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => toggleProof(proofId, "invitation", false)}
                    >
                      Remove unavailable invitation proof
                    </button>
                  )}
                  {config.alternative.proofIds.includes(proofId) && (
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => toggleProof(proofId, "alternative", false)}
                    >
                      Remove unavailable alternative proof
                    </button>
                  )}
                  {extras.proofIds.includes(proofId) && (
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => toggleProof(proofId, "preparation", false)}
                    >
                      Remove unavailable preparation proof
                    </button>
                  )}
                </div>
              ))}
              {approvedProof.map((item) => (
                <fieldset
                  key={item.id}
                  className="min-w-0 rounded-xl border border-current/10 p-4 space-y-3"
                >
                  <legend className="px-2 text-sm font-semibold">
                    {item.title || item.attribution || "Approved proof"}
                  </legend>
                  <blockquote className="text-base leading-relaxed whitespace-pre-wrap break-words">
                    {item.content}
                  </blockquote>
                  {item.attribution && (
                    <p className="admin-help">{item.attribution}</p>
                  )}
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={config.proofIds.includes(item.id)}
                      disabled={
                        !config.proofIds.includes(item.id) &&
                        config.proofIds.length >= 12
                      }
                      onChange={(event) =>
                        toggleProof(item.id, "invitation", event.target.checked)
                      }
                    />
                    Use on invitation — {item.title || item.attribution}
                  </label>
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={config.alternative.proofIds.includes(item.id)}
                      disabled={
                        !config.alternative.proofIds.includes(item.id) &&
                        config.alternative.proofIds.length >= 12
                      }
                      onChange={(event) =>
                        toggleProof(
                          item.id,
                          "alternative",
                          event.target.checked,
                        )
                      }
                    />
                    Use on alternative — {item.title || item.attribution}
                  </label>
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={extras.proofIds.includes(item.id)}
                      disabled={
                        !extras.proofIds.includes(item.id) &&
                        extras.proofIds.length >= 12
                      }
                      onChange={(event) =>
                        toggleProof(
                          item.id,
                          "preparation",
                          event.target.checked,
                        )
                      }
                    />
                    Use on preparation — {item.title || item.attribution}
                  </label>
                  {(config.proofIds.includes(item.id) ||
                    extras.proofIds.includes(item.id) ||
                    config.alternative.proofIds.includes(item.id)) && (
                    <TextField
                      label={`Portrait URL for ${item.title || item.attribution}`}
                      value={config.proofImages[item.id] || ""}
                      maxLength={2048}
                      onChange={(url) =>
                        update("proofImages", {
                          ...config.proofImages,
                          [item.id]: url,
                        })
                      }
                      help="Optional. Use a permitted photo of the person who gave this testimonial."
                    />
                  )}
                </fieldset>
              ))}
            </Panel>
          )}
          {tab === "Scripts" && (
            <CallScriptWorkspace
              value={normalizeCallFunnelScripts(config.scripts)}
              offerName={config.brand.name}
              disabled={disabled}
              onChange={(scripts) => update("scripts", scripts)}
            />
          )}
        </fieldset>
      </div>
    </div>
  );
}
