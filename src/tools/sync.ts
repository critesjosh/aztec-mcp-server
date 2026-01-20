/**
 * Repository sync tool - clones and updates Aztec repositories
 */

import { AZTEC_REPOS, getAztecRepos, DEFAULT_AZTEC_VERSION } from "../repos/config.js";
import { cloneRepo, getReposStatus, REPOS_DIR } from "../utils/git.js";

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
  const reposToSync = repoNames
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

  for (const config of reposToSync) {
    try {
      const status = await cloneRepo(config, force);
      results.push({
        name: config.name,
        status,
      });
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
