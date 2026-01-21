/**
 * Repository sync tool - clones and updates Aztec repositories
 */

import { AZTEC_REPOS, getAztecRepos, DEFAULT_AZTEC_VERSION, RepoConfig } from "../repos/config.js";
import { cloneRepo, getReposStatus, getNoirCommitFromAztec, REPOS_DIR } from "../utils/git.js";

export interface SyncResult {
  success: boolean;
  message: string;
  version: string;
  repos: {
    name: string;
    status: string;
    commit?: string;
  }[];
}

/**
 * Sync all repositories (clone if missing, update if exists)
 * Syncs aztec-packages first to determine the correct Noir version
 */
export async function syncRepos(options: {
  force?: boolean;
  repos?: string[];
  version?: string;
}): Promise<SyncResult> {
  const { force = false, repos: repoNames, version } = options;

  // Get repos configured for the specified version
  const configuredRepos = version ? getAztecRepos(version) : AZTEC_REPOS;
  const effectiveVersion = version || DEFAULT_AZTEC_VERSION;

  // Filter repos if specific ones requested
  let reposToSync = repoNames
    ? configuredRepos.filter((r) => repoNames.includes(r.name))
    : configuredRepos;

  if (reposToSync.length === 0) {
    return {
      success: false,
      message: "No repositories matched the specified names",
      version: effectiveVersion,
      repos: [],
    };
  }

  const results: SyncResult["repos"] = [];

  // Sort repos so aztec-packages is cloned first (needed to determine Noir version)
  const aztecPackages = reposToSync.find((r) => r.name === "aztec-packages");
  const noirRepos = reposToSync.filter((r) => r.url.includes("noir-lang"));
  const otherRepos = reposToSync.filter(
    (r) => r.name !== "aztec-packages" && !r.url.includes("noir-lang")
  );

  // Clone aztec-packages first if present
  if (aztecPackages) {
    try {
      const status = await cloneRepo(aztecPackages, force);
      results.push({ name: aztecPackages.name, status });
    } catch (error) {
      results.push({
        name: aztecPackages.name,
        status: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // Get the Noir commit from aztec-packages (if available)
  const noirCommit = await getNoirCommitFromAztec();

  // Clone Noir repos with the commit from aztec-packages
  for (const config of noirRepos) {
    try {
      // Apply the noir commit from aztec-packages to noir repo
      const noirConfig: RepoConfig =
        config.name === "noir" && noirCommit
          ? { ...config, commit: noirCommit, branch: undefined }
          : config;

      const status = await cloneRepo(noirConfig, force);
      const finalStatus =
        config.name === "noir" && noirCommit
          ? status.replace("(branch", `(commit from aztec-packages`)
          : status;
      results.push({ name: config.name, status: finalStatus });
    } catch (error) {
      results.push({
        name: config.name,
        status: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // Clone other repos
  for (const config of otherRepos) {
    try {
      const status = await cloneRepo(config, force);
      results.push({ name: config.name, status });
    } catch (error) {
      results.push({
        name: config.name,
        status: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const allSuccess = results.every(
    (r) => !r.status.toLowerCase().includes("error")
  );

  return {
    success: allSuccess,
    message: allSuccess
      ? `Successfully synced ${results.length} repositories to ${REPOS_DIR}`
      : "Some repositories failed to sync",
    version: effectiveVersion,
    repos: results,
  };
}

/**
 * Get status of all configured repositories
 */
export async function getStatus(): Promise<{
  reposDir: string;
  repos: {
    name: string;
    description: string;
    cloned: boolean;
    commit?: string;
  }[];
}> {
  const statusMap = await getReposStatus(AZTEC_REPOS);

  const repos = AZTEC_REPOS.map((config) => {
    const status = statusMap.get(config.name);
    return {
      name: config.name,
      description: config.description,
      cloned: status?.cloned || false,
      commit: status?.commit,
    };
  });

  return {
    reposDir: REPOS_DIR,
    repos,
  };
}
