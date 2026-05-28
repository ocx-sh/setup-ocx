import * as core from "@actions/core";
import { HttpClient } from "@actions/http-client";
import { REPO_OWNER, REPO_NAME } from "./constants.js";
import { parseRetryAfterMs, withRetry } from "./http-retry.js";
import type { Decision, Outcome } from "./http-retry.js";

interface GitHubRelease {
  tag_name: string;
}

export async function resolveVersion(version: string, token: string): Promise<string> {
  if (version !== "latest") {
    return version.replace(/^v/, "");
  }

  core.info("Resolving latest OCX version...");

  const client = new HttpClient("setup-ocx");
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
  core.debug(`API URL: ${url}`);

  const resolved = await withRetry<string>(
    async (): Promise<Outcome<string>> => {
      try {
        const response = await client.getJson<GitHubRelease>(url, headers);
        const out: Outcome<string> = {
          response: {
            statusCode: response.statusCode,
            headers: response.headers,
          },
        };
        const tag = response.result?.tag_name.replace(/^v/, "");
        if (tag) out.result = tag;
        return out;
      } catch (error) {
        return { error };
      }
    },
    (outcome): Decision => {
      if (outcome.error !== undefined) {
        const msg =
          outcome.error instanceof Error ? outcome.error.message : JSON.stringify(outcome.error);
        return { kind: "retry", reason: `network error ${msg}` };
      }
      const status = outcome.response?.statusCode ?? 0;
      const retryAfterMs = parseRetryAfterMs(outcome.response?.headers?.["retry-after"]);
      const retryDecision = (reason: string): Decision =>
        retryAfterMs !== undefined
          ? { kind: "retry", reason, retryAfterMs }
          : { kind: "retry", reason };
      if (status >= 500) return retryDecision(`HTTP ${status}`);
      if (status === 408 || status === 429) return retryDecision(`HTTP ${status}`);
      if (status >= 400) return { kind: "fail", reason: `HTTP ${status}` };
      if (!outcome.result)
        return { kind: "retry", reason: `HTTP ${status} with empty release body` };
      return { kind: "success" };
    },
    { label: "resolve latest OCX version" },
  );

  core.info(`Resolved latest version: ${resolved}`);
  return resolved;
}
