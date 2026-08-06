import * as core from "@actions/core";
import { HttpClient } from "@actions/http-client";
import { REPO_OWNER, REPO_NAME } from "./constants.js";
import { parseRetryAfterMs, withRetry } from "./http-retry.js";
import type { Decision, Outcome } from "./http-retry.js";

interface GitHubRelease {
  tag_name: string;
}

/**
 * Compare two dotted numeric versions (optional leading `v`).
 * Returns <0 if a<b, 0 if equal, >0 if a>b. Missing numeric segments are
 * treated as 0. A prerelease suffix (`0.4.3-rc.1`) sorts below its release
 * (SemVer rule) so capability floors reject prerelease builds of the floor
 * version; two prereleases of the same version compare textually.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): { nums: number[]; pre: string } => {
    const [core = "", ...pre] = v.replace(/^v/, "").split("-");
    return {
      nums: core.split(".").map((s) => Number.parseInt(s, 10) || 0),
      pre: pre.join("-"),
    };
  };
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.nums.length, pb.nums.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (!pa.pre && !pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  return pa.pre < pb.pre ? -1 : pa.pre > pb.pre ? 1 : 0;
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
