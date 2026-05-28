import * as core from "@actions/core";
import { HttpClient } from "@actions/http-client";
import type { TypedResponse } from "@actions/http-client/lib/interfaces";
import { REPO_OWNER, REPO_NAME } from "./constants";

interface GitHubRelease {
  tag_name: string;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [500, 1500, 4500];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
  core.debug(`API URL: ${url}`);

  const attempts: string[] = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response: TypedResponse<GitHubRelease> | undefined;
    let thrown: unknown;
    try {
      response = await client.getJson<GitHubRelease>(url, headers);
    } catch (error) {
      thrown = error;
    }

    if (thrown) {
      const msg = thrown instanceof Error ? thrown.message : String(thrown);
      attempts.push(`attempt ${attempt + 1}: error ${msg}`);
    } else if (!response) {
      // unreachable, here for type narrowing
      attempts.push(`attempt ${attempt + 1}: no response`);
    } else if (response.statusCode >= 500) {
      attempts.push(`attempt ${attempt + 1}: HTTP ${response.statusCode}`);
    } else if (!response.result?.tag_name) {
      attempts.push(
        `attempt ${attempt + 1}: HTTP ${response.statusCode} with empty release body`,
      );
    } else {
      const resolved = response.result.tag_name.replace(/^v/, "");
      if (attempt > 0) {
        core.info(`Resolved after ${attempt + 1} attempts.`);
      }
      core.info(`Resolved latest version: ${resolved}`);
      return resolved;
    }

    if (attempt < MAX_ATTEMPTS - 1) {
      const delay = BACKOFF_MS[attempt];
      core.warning(
        `Failed to resolve latest OCX version (${attempts[attempts.length - 1]}); retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }

  throw new Error(
    `Failed to resolve latest OCX version after ${MAX_ATTEMPTS} attempts: ${attempts.join("; ")}`,
  );
}
