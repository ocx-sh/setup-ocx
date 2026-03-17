import * as core from "@actions/core";
import { HttpClient } from "@actions/http-client";
import { REPO_OWNER, REPO_NAME } from "./constants";

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
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
  core.debug(`API URL: ${url}`);

  let response;
  try {
    response = await client.getJson<GitHubRelease>(url, headers);
  } catch (error) {
    throw new Error(
      `Failed to fetch latest OCX version: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (!response.result?.tag_name) {
    throw new Error("GitHub API returned no release information for OCX");
  }

  const resolved = response.result.tag_name.replace(/^v/, "");
  core.info(`Resolved latest version: ${resolved}`);
  return resolved;
}
