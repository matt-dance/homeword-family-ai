import { describe, expect, it } from "vitest";
import {
  categorizeBlockedAttempt,
  describeBlockedAttempt,
  humanizeBlockedReason,
  unescapeReasonTokens,
} from "./blocked-attempt";

describe("unescapeReasonTokens", () => {
  it("unescapes regex-style spaces from rule patterns", () => {
    expect(unescapeReasonTokens("how\\ to\\ make\\ a\\ bomb")).toBe("how to make a bomb");
    expect(unescapeReasonTokens("ignore\\ all\\ previous")).toBe("ignore all previous");
  });

  it("unescapes a second JSON-style backslash layer", () => {
    expect(unescapeReasonTokens("how\\\\ to\\\\ make\\\\ a\\\\ bomb")).toBe("how to make a bomb");
  });

  it("leaves already-plain reasons alone", () => {
    expect(unescapeReasonTokens("keyword: kill")).toBe("keyword: kill");
  });
});

describe("categorizeBlockedAttempt", () => {
  it("maps rules and policy stages to Policy", () => {
    expect(categorizeBlockedAttempt("rules", "keyword: kill")).toBe("policy");
    expect(categorizeBlockedAttempt("rules", "jailbreak: ignore all previous")).toBe("policy");
    expect(categorizeBlockedAttempt("rules", "blocked: how to make a bomb")).toBe("policy");
    expect(categorizeBlockedAttempt("policy", "blocked topic: violence")).toBe("policy");
    expect(categorizeBlockedAttempt("classifier", "classifier: unsafe content")).toBe("policy");
    expect(categorizeBlockedAttempt("output_rules", "keyword: kill")).toBe("policy");
  });

  it("maps classifier timeout and errors to infra, not policy", () => {
    expect(
      categorizeBlockedAttempt(
        "classifier",
        "classifier: timeout; fallback: unsafe signal 'bomb'",
      ),
    ).toBe("classifier_infra");
    expect(categorizeBlockedAttempt("classifier", "classifier: error (ReadTimeout)")).toBe(
      "classifier_infra",
    );
    expect(
      describeBlockedAttempt({
        stage: "classifier",
        reason: "classifier: error (ReadTimeout)",
      }).categoryLabel,
    ).toBe("Classifier error");
    expect(categorizeBlockedAttempt("classifier", "classifier: ambiguous response")).toBe(
      "classifier_infra",
    );
    expect(categorizeBlockedAttempt("output_classifier", "classifier: timeout")).toBe(
      "classifier_infra",
    );
  });

  it("maps llm stage and reasons to AI model error", () => {
    expect(categorizeBlockedAttempt("llm", "llm error")).toBe("llm_error");
    expect(categorizeBlockedAttempt("llm", "llm stream error")).toBe("llm_error");
    expect(categorizeBlockedAttempt("llm", "empty LLM stream")).toBe("llm_error");
    expect(categorizeBlockedAttempt("unknown", "stream exception")).toBe("llm_error");
  });

  it("maps pipeline exceptions that are not policy to filter error", () => {
    expect(categorizeBlockedAttempt("normalize", "empty message")).toBe("filter_error");
    expect(categorizeBlockedAttempt("rules", "rules error")).toBe("filter_error");
    expect(categorizeBlockedAttempt("policy", "policy error")).toBe("filter_error");
  });
});

describe("humanizeBlockedReason", () => {
  it("humanizes the QA dashboard examples without leftover escapes", () => {
    expect(humanizeBlockedReason("keyword: kill")).toBe("Blocked keyword: kill");
    expect(humanizeBlockedReason("jailbreak: ignore\\ all\\ previous")).toBe(
      "Jailbreak attempt: ignore all previous",
    );
    expect(humanizeBlockedReason("blocked: how\\ to\\ make\\ a\\ bomb")).toBe(
      "Blocked phrase: how to make a bomb",
    );
    expect(
      humanizeBlockedReason("classifier: timeout; fallback: unsafe signal 'bomb'"),
    ).toBe("The safety classifier timed out. A fallback keyword check flagged “bomb”.");
    expect(humanizeBlockedReason("classifier: error (ReadTimeout)")).toBe(
      "The safety classifier failed (ReadTimeout).",
    );
  });

  it("humanizes llm and policy strings", () => {
    expect(humanizeBlockedReason("llm error")).toMatch(/local AI model failed to reply/i);
    expect(humanizeBlockedReason("llm stream error")).toMatch(/streaming/i);
    expect(humanizeBlockedReason("blocked topic: violence")).toBe("Blocked topic: violence");
  });
});

describe("describeBlockedAttempt", () => {
  it("distinguishes policy vs classifier timeout vs llm error in the parent view", () => {
    const policy = describeBlockedAttempt({ stage: "rules", reason: "keyword: kill" });
    expect(policy.category).toBe("policy");
    expect(policy.categoryLabel).toBe("Policy");
    expect(policy.summary).toBe("Blocked keyword: kill");
    expect(policy.rawReason).toBe("keyword: kill");

    const timeout = describeBlockedAttempt({
      stage: "classifier",
      reason: "classifier: timeout; fallback: unsafe signal 'bomb'",
    });
    expect(timeout.category).toBe("classifier_infra");
    expect(timeout.categoryLabel).toBe("Classifier timeout");
    expect(
      describeBlockedAttempt({
        stage: "classifier",
        reason: "classifier: error (ReadTimeout)",
      }).categoryLabel,
    ).toBe("Classifier error");
    expect(timeout.summary).toMatch(/timed out/i);
    expect(timeout.summary).not.toMatch(/\\/);
    expect(timeout.rawReason).toContain("classifier: timeout");

    const llm = describeBlockedAttempt({ stage: "llm", reason: "llm stream error" });
    expect(llm.category).toBe("llm_error");
    expect(llm.categoryLabel).toBe("AI model error");
    expect(llm.summary.toLowerCase()).not.toContain("safety flag");
  });

  it("does not treat a classifier timeout plus fallback signal as a policy block", () => {
    const view = describeBlockedAttempt({
      stage: "classifier",
      reason: "classifier: timeout; fallback: unsafe signal 'bomb'",
    });
    expect(view.category).not.toBe("policy");
    expect(view.categoryLabel).not.toBe("Policy");
  });
});
