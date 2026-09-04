/** Parent-dashboard view of a blocked attempt: category, human copy, raw debug. */

export type BlockedCategory = "policy" | "classifier_infra" | "llm_error" | "filter_error";

export interface BlockedAttemptView {
  category: BlockedCategory;
  categoryLabel: string;
  summary: string;
  rawReason: string;
  stage: string;
}

const LLM_REASON_RE =
  /\b(llm error|llm stream error|empty llm stream|stream exception)\b/i;

const CLASSIFIER_INFRA_RE = /timeout|error|ambiguous/i;

/**
 * Reverse regex-style escaping from rule patterns (`how\ to\ make\ a\ bomb`)
 * and a second JSON-style backslash layer (`how\\ to`).
 */
export function unescapeReasonTokens(reason: string): string {
  let text = reason;
  for (let i = 0; i < 2; i += 1) {
    const next = text.replace(/\\(.)/g, "$1");
    if (next === text) break;
    text = next;
  }
  return text;
}

function matchPrefix(text: string, prefix: string): string | null {
  if (text.toLowerCase().startsWith(prefix.toLowerCase())) {
    return text.slice(prefix.length).trim();
  }
  return null;
}

function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

function humanizeReasonPart(part: string): string {
  const keyword = matchPrefix(part, "keyword:");
  if (keyword) return `Blocked keyword: ${keyword}`;

  const jailbreak = matchPrefix(part, "jailbreak:");
  if (jailbreak) return `Jailbreak attempt: ${jailbreak}`;

  const blocked = matchPrefix(part, "blocked:");
  if (blocked) return `Blocked phrase: ${blocked}`;

  const jailbreakPattern = matchPrefix(part, "jailbreak pattern detected:");
  if (jailbreakPattern) return `Jailbreak pattern: ${jailbreakPattern}`;

  if (part.toLowerCase() === "blocked keyword detected") {
    return "A blocked keyword matched the family policy.";
  }

  const topic = matchPrefix(part, "blocked topic:");
  if (topic) return `Blocked topic: ${topic}`;

  if (/^classifier:\s*unsafe content$/i.test(part)) {
    return "The safety classifier flagged this as unsafe.";
  }

  if (/^classifier:\s*timeout\b/i.test(part)) {
    return "The safety classifier timed out.";
  }

  const classifierError = part.match(/^classifier:\s*error\s*(?:\(([^)]+)\))?/i);
  if (classifierError) {
    return classifierError[1]
      ? `The safety classifier failed (${classifierError[1]}).`
      : "The safety classifier failed.";
  }

  if (/^classifier:\s*ambiguous/i.test(part)) {
    return "The safety classifier returned an unclear result.";
  }

  const fallbackSignal = part.match(/^fallback:\s*unsafe signal ['"](.+)['"]$/i);
  if (fallbackSignal) {
    return `A fallback keyword check flagged “${fallbackSignal[1]}”.`;
  }

  if (part.toLowerCase() === "rules fallback") {
    return "A fallback keyword check also flagged this message.";
  }

  if (/^llm error$/i.test(part)) return "The local AI model failed to reply.";
  if (/^(llm stream error|stream exception)$/i.test(part)) {
    return "The local AI model failed while streaming a reply.";
  }
  if (/^empty llm stream$/i.test(part)) {
    return "The local AI model returned an empty reply.";
  }

  if (/^empty message$/i.test(part)) return "The message was empty after cleanup.";
  if (/normalize error/i.test(part)) return "Message cleanup failed.";
  if (/^(output )?rules error$/i.test(part)) return "The safety rules check failed.";
  if (/^(output )?policy error$/i.test(part)) return "The policy check failed.";
  if (/^(output )?classifier error$/i.test(part)) return "The safety classifier failed.";

  return sentence(part);
}

export function humanizeBlockedReason(reason: string | null | undefined): string {
  const raw = unescapeReasonTokens((reason || "").trim());
  if (!raw) return "No reason recorded.";
  const parts = raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(humanizeReasonPart);
  return parts.join(" ");
}

export function categorizeBlockedAttempt(
  stage: string | null | undefined,
  reason: string | null | undefined,
): BlockedCategory {
  const stageText = (stage || "").toLowerCase();
  const reasonText = unescapeReasonTokens((reason || "").toLowerCase());

  if (stageText.startsWith("llm") || LLM_REASON_RE.test(reasonText)) {
    return "llm_error";
  }

  const classifierStage = stageText.includes("classifier");
  const classifierReason = reasonText.includes("classifier");
  if ((classifierStage || classifierReason) && CLASSIFIER_INFRA_RE.test(reasonText)) {
    return "classifier_infra";
  }
  if (/^(output )?classifier error$/.test(reasonText)) {
    return "classifier_infra";
  }

  if (
    /normalize error/.test(reasonText) ||
    /^(output )?rules error$/.test(reasonText) ||
    /^(output )?policy error$/.test(reasonText) ||
    reasonText === "empty message"
  ) {
    return "filter_error";
  }

  return "policy";
}

export function blockedCategoryLabel(
  category: BlockedCategory,
  reason: string | null | undefined,
): string {
  if (category === "policy") return "Policy";
  if (category === "llm_error") return "AI model error";
  if (category === "filter_error") return "Filter error";
  const reasonText = (reason || "").toLowerCase();
  if (reasonText.includes("timeout")) return "Classifier timeout";
  return "Classifier error";
}

export function describeBlockedAttempt(attempt: {
  stage?: string | null;
  reason?: string | null;
}): BlockedAttemptView {
  const stage = (attempt.stage || "").trim() || "unknown";
  const rawReason = (attempt.reason || "").trim();
  const category = categorizeBlockedAttempt(stage, rawReason);
  return {
    category,
    categoryLabel: blockedCategoryLabel(category, rawReason),
    summary: humanizeBlockedReason(rawReason),
    rawReason: rawReason || "unknown",
    stage,
  };
}
