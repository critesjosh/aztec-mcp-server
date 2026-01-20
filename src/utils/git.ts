/**
 * Git utilities for cloning and updating repositories
 */

import { simpleGit, SimpleGit } from "simple-git";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { RepoConfig } from "../repos/config.js";

/** Base directory for cloned repos */
export const REPOS_DIR = join(
  process.env.AZTEC_MCP_REPOS_DIR || join(homedir(), ".aztec-mcp"),
  "repos"
);

/**
 * Ensure the repos directory exists
 */
export function ensureReposDir(): void {
  mkdirSync(REPOS_DIR, { recursive: true });
}

/**
 * Get the local path for a repository
 */
export function getRepoPath(repoName: string): string {
  return join(REPOS_DIR, repoName);
}

/**
 * Check if a repository is already cloned
 */
export function isRepoCloned(repoName: string): boolean {
  const repoPath = getRepoPath(repoName);
  return existsSync(join(repoPath, ".git"));
}

/**
 * Clone a repository with optional sparse checkout and tag support
 */
export async function cloneRepo(
  config: RepoConfig,
  force: boolean = false
): Promise<string> {
  ensureReposDir();
  const repoPath = getRepoPath(config.name);

  // Remove existing if force is set
  if (force && existsSync(repoPath)) {
    rmSync(repoPath, { recursive: true, force: true });
  }

  // If already cloned and not forcing, just update
  if (isRepoCloned(config.name)) {
    return await updateRepo(config.name);
  }

  const git: SimpleGit = simpleGit();

  // Determine ref to checkout: tag takes precedence over branch
  const ref = config.tag || config.branch;
  const refType = config.tag ? "tag" : "branch";

  if (config.sparse && config.sparse.length > 0) {
    // Clone with sparse checkout for large repos
    // For tags, we need to clone without -b first, then checkout the tag
    if (config.tag) {
      await git.clone(config.url, repoPath, [
        "--filter=blob:none",
        "--sparse",
        "--no-checkout",
      ]);

      const repoGit = simpleGit(repoPath);
      await repoGit.raw(["sparse-checkout", "set", ...config.sparse]);
      await repoGit.fetch(["--depth=1", "origin", `refs/tags/${config.tag}:refs/tags/${config.tag}`]);
      await repoGit.checkout(config.tag);
    } else {
      await git.clone(config.url, repoPath, [
        "--filter=blob:none",
        "--sparse",
        "--depth=1",
        ...(config.branch ? ["-b", config.branch] : []),
      ]);

      const repoGit = simpleGit(repoPath);
      await repoGit.raw(["sparse-checkout", "set", ...config.sparse]);
    }

    return `Cloned ${config.name} @ ${ref} (${refType}, sparse: ${config.sparse.join(", ")})`;
  } else {
    // Shallow clone for smaller repos
    if (config.tag) {
      // Clone and checkout tag
      await git.clone(config.url, repoPath, ["--no-checkout"]);
      const repoGit = simpleGit(repoPath);
      await repoGit.fetch(["--depth=1", "origin", `refs/tags/${config.tag}:refs/tags/${config.tag}`]);
      await repoGit.checkout(config.tag);
    } else {
      await git.clone(config.url, repoPath, [
        "--depth=1",
        ...(config.branch ? ["-b", config.branch] : []),
      ]);
    }

    return `Cloned ${config.name} @ ${ref} (${refType})`;
  }
}

/**
 * Update an existing repository
 */
export async function updateRepo(repoName: string): Promise<string> {
  const repoPath = getRepoPath(repoName);

  if (!isRepoCloned(repoName)) {
    throw new Error(`Repository ${repoName} is not cloned`);
  }

  const git = simpleGit(repoPath);

  try {
    await git.fetch(["--depth=1"]);
    await git.reset(["--hard", "origin/HEAD"]);
    return `Updated ${repoName}`;
  } catch (error) {
    // If fetch fails, try a simple pull
    try {
      await git.pull();
      return `Updated ${repoName}`;
    } catch (pullError) {
      return `Failed to update ${repoName}: ${pullError}`;
    }
  }
}

/**
 * Get the current commit hash for a repo
 */
export async function getRepoCommit(repoName: string): Promise<string | null> {
  const repoPath = getRepoPath(repoName);

  if (!isRepoCloned(repoName)) {
    return null;
  }

  const git = simpleGit(repoPath);
  const log = await git.log(["-1"]);
  return log.latest?.hash.substring(0, 7) || null;
}

/**
 * Get status of all repos
 */
export async function getReposStatus(
  configs: RepoConfig[]
): Promise<Map<string, { cloned: boolean; commit?: string }>> {
  const status = new Map<string, { cloned: boolean; commit?: string }>();

  for (const config of configs) {
    const cloned = isRepoCloned(config.name);
    const commit = cloned ? (await getRepoCommit(config.name)) || undefined : undefined;
    status.set(config.name, { cloned, commit });
  }

  return status;
}
