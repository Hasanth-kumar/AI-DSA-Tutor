import {
  createGitHubClient,
  matchProblemToFile,
  type GitHubClient,
} from "@dsa/integrations";
import type { AppConfig } from "@dsa/shared";
import type { ProblemRepository } from "../repositories/ProblemRepository.js";
import type { MirrorCache } from "./MirrorCache.js";

export interface GitHubSyncResult {
  repo: string;
  path: string;
  filesScanned: number;
  matched: number;
  unmatched: number;
  updates: { problemId: string; problemName: string; githubUrl: string }[];
}

export class GitHubSyncService {
  private readonly client: GitHubClient | null;

  constructor(
    config: AppConfig,
    private readonly problemRepo: ProblemRepository,
    private readonly mirrorCache: MirrorCache,
    client?: GitHubClient | null,
  ) {
    this.client =
      client ??
      (config.github.repo
        ? createGitHubClient({
            token: config.github.token,
            repo: config.github.repo,
            solutionsPath: config.github.solutionsPath,
          })
        : null);
  }

  isConfigured(): boolean {
    return Boolean(this.client?.isConfigured());
  }

  async syncSolutions(): Promise<GitHubSyncResult> {
    if (!this.client?.isConfigured()) {
      throw new Error("GitHub is not configured (set GITHUB_REPO)");
    }

    const listing = await this.client.listSolutionFiles(true);
    const problems = this.problemRepo.findAll();

    return this.mirrorCache.batch(() => {
      const updates: GitHubSyncResult["updates"] = [];
      let matched = 0;

      for (const problem of problems) {
        const file = matchProblemToFile(problem.name, listing.files);
        if (!file) continue;

        matched += 1;
        this.problemRepo.update(problem.id, { githubUrl: file.htmlUrl });
        updates.push({
          problemId: problem.id,
          problemName: problem.name,
          githubUrl: file.htmlUrl,
        });
      }

      return {
        repo: listing.repo,
        path: listing.path,
        filesScanned: listing.files.length,
        matched,
        unmatched: problems.length - matched,
        updates,
      };
    });
  }
}
