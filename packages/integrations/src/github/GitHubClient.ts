export interface GitHubConfig {
  token?: string;
  repo: string;
  solutionsPath?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
}

export interface GitHubFileEntry {
  name: string;
  path: string;
  sha: string;
  htmlUrl: string;
  downloadUrl: string | null;
}

export interface GitHubListResult {
  repo: string;
  path: string;
  files: GitHubFileEntry[];
}

interface GitHubApiItem {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
  html_url?: string;
  download_url?: string | null;
}

export class GitHubClient {
  constructor(private readonly config: GitHubConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.repo?.includes("/"));
  }

  async listSolutionFiles(recursive = true): Promise<GitHubListResult> {
    const [owner, repoName] = this.parseRepo();
    const basePath = (this.config.solutionsPath ?? "").replace(/^\/|\/$/g, "");
    const apiBase = this.config.apiBaseUrl ?? "https://api.github.com";
    const timeoutMs = this.config.timeoutMs ?? 15_000;

    const files: GitHubFileEntry[] = [];
    await this.walkPath(
      apiBase,
      owner,
      repoName,
      basePath,
      files,
      recursive,
      timeoutMs,
    );

    return {
      repo: this.config.repo,
      path: basePath || "/",
      files,
    };
  }

  private async walkPath(
    apiBase: string,
    owner: string,
    repo: string,
    path: string,
    files: GitHubFileEntry[],
    recursive: boolean,
    timeoutMs: number,
  ): Promise<void> {
    const url = path
      ? `${apiBase}/repos/${owner}/${repo}/contents/${path}`
      : `${apiBase}/repos/${owner}/${repo}/contents`;

    const items = await this.fetchContents(url, timeoutMs);
    for (const item of items) {
      if (item.type === "file" && isSolutionFile(item.name)) {
        files.push({
          name: item.name,
          path: item.path,
          sha: item.sha,
          htmlUrl: item.html_url ?? `https://github.com/${owner}/${repo}/blob/main/${item.path}`,
          downloadUrl: item.download_url ?? null,
        });
      } else if (recursive && item.type === "dir") {
        await this.walkPath(apiBase, owner, repo, item.path, files, recursive, timeoutMs);
      }
    }
  }

  private async fetchContents(url: string, timeoutMs: number): Promise<GitHubApiItem[]> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "dsa-mastery-os",
    };
    if (this.config.token) {
      headers.Authorization = `Bearer ${this.config.token}`;
    }

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status === 404) return [];
    if (!res.ok) {
      throw new Error(`GitHub API returned ${res.status}`);
    }

    const data = (await res.json()) as GitHubApiItem | GitHubApiItem[];
    return Array.isArray(data) ? data : [data];
  }

  private parseRepo(): [string, string] {
    const parts = this.config.repo.split("/").filter(Boolean);
    if (parts.length !== 2) {
      throw new Error(`Invalid GITHUB_REPO: ${this.config.repo}`);
    }
    return [parts[0]!, parts[1]!];
  }
}

const SOLUTION_EXTENSIONS = [".ts", ".js", ".py", ".java", ".cpp", ".c", ".go", ".rs"];

function isSolutionFile(name: string): boolean {
  const lower = name.toLowerCase();
  return SOLUTION_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function createGitHubClient(config: GitHubConfig): GitHubClient {
  return new GitHubClient(config);
}

export function slugifyProblemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function matchProblemToFile(
  problemName: string,
  files: GitHubFileEntry[],
): GitHubFileEntry | null {
  const slug = slugifyProblemName(problemName);
  const normalizedName = problemName.toLowerCase().replace(/[^a-z0-9]/g, "");

  const exact = files.find((f) => slugifyProblemName(stripExtension(f.name)) === slug);
  if (exact) return exact;

  const contains = files.filter((f) => {
    const fileSlug = slugifyProblemName(stripExtension(f.name));
    return fileSlug.includes(slug) || slug.includes(fileSlug);
  });
  if (contains.length === 1) return contains[0]!;

  const fuzzy = files.filter((f) => {
    const base = stripExtension(f.name).toLowerCase().replace(/[^a-z0-9]/g, "");
    return base.includes(normalizedName) || normalizedName.includes(base);
  });
  if (fuzzy.length === 1) return fuzzy[0]!;

  return null;
}

function stripExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx > 0 ? filename.slice(0, idx) : filename;
}
