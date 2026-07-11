export interface LeetCodeConfig {
  username: string;
  graphqlUrl?: string;
  timeoutMs?: number;
}

export interface LeetCodeDifficultyStats {
  difficulty: "Easy" | "Medium" | "Hard" | "All";
  solved: number;
  submissions: number;
}

export interface LeetCodeUserStats {
  username: string;
  ranking: number | null;
  totalSolved: number;
  totalSubmissions: number;
  byDifficulty: LeetCodeDifficultyStats[];
  fetchedAt: string;
}

/** ISO date (YYYY-MM-DD, UTC) → accepted submissions that day */
export interface LeetCodeActivity {
  username: string;
  dailyCounts: Record<string, number>;
  currentStreak: number;
  fetchedAt: string;
}

const PROFILE_QUERY = `
query userPublicProfile($username: String!) {
  matchedUser(username: $username) {
    profile {
      ranking
    }
    submitStats {
      acSubmissionNum {
        difficulty
        count
        submissions
      }
      totalSubmissionNum {
        difficulty
        count
        submissions
      }
    }
  }
}`;

const CALENDAR_QUERY = `
query userProfileCalendar($username: String!, $year: Int) {
  matchedUser(username: $username) {
    userCalendar(year: $year) {
      streak
      submissionCalendar
    }
  }
}`;

export class LeetCodeClient {
  constructor(private readonly config: LeetCodeConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.username?.trim());
  }

  async fetchUserStats(): Promise<LeetCodeUserStats> {
    const username = this.config.username.trim();
    const payload = await this.graphql<{
      matchedUser?: {
        profile?: { ranking?: number | null };
        submitStats?: {
          acSubmissionNum?: {
            difficulty: string;
            count: number;
            submissions: number;
          }[];
          totalSubmissionNum?: {
            difficulty: string;
            count: number;
            submissions: number;
          }[];
        };
      };
    }>(PROFILE_QUERY, { username });

    const user = payload.matchedUser;
    if (!user) {
      throw new Error(`LeetCode user not found: ${username}`);
    }

    const ac = user.submitStats?.acSubmissionNum ?? [];
    const total = user.submitStats?.totalSubmissionNum ?? [];

    const byDifficulty: LeetCodeDifficultyStats[] = ac.map((entry) => {
      const totalEntry = total.find((t) => t.difficulty === entry.difficulty);
      return {
        difficulty: normalizeDifficulty(entry.difficulty),
        solved: entry.count ?? 0,
        submissions: totalEntry?.submissions ?? entry.submissions ?? 0,
      };
    });

    const allSolved = byDifficulty.find((d) => d.difficulty === "All");
    const allTotal = total.find((t) => t.difficulty === "All");

    return {
      username,
      ranking: user.profile?.ranking ?? null,
      totalSolved: allSolved?.solved ?? byDifficulty.reduce((s, d) => s + d.solved, 0),
      totalSubmissions: allTotal?.submissions ?? 0,
      byDifficulty,
      fetchedAt: new Date().toISOString(),
    };
  }

  async fetchActivity(): Promise<LeetCodeActivity> {
    const username = this.config.username.trim();
    const currentYear = new Date().getUTCFullYear();
    const years = [currentYear, currentYear - 1];

    const dailyCounts: Record<string, number> = {};
    let currentStreak = 0;

    for (const year of years) {
      const payload = await this.graphql<{
        matchedUser?: {
          userCalendar?: {
            streak?: number;
            submissionCalendar?: string;
          };
        };
      }>(CALENDAR_QUERY, { username, year });

      const calendar = payload.matchedUser?.userCalendar;
      if (!calendar) {
        throw new Error(`LeetCode user not found: ${username}`);
      }

      if (year === currentYear) {
        currentStreak = calendar.streak ?? 0;
      }

      mergeSubmissionCalendar(dailyCounts, calendar.submissionCalendar ?? "{}");
    }

    return {
      username,
      dailyCounts,
      currentStreak,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Does a problem slug exist on LeetCode? (E3 suggestion validation — no
   * username needed, it's a public query.) `null` = couldn't check (network),
   * so callers should keep the suggestion rather than drop it.
   */
  async validateProblemSlug(slug: string): Promise<boolean | null> {
    try {
      const payload = await this.graphql<{
        question?: { titleSlug?: string } | null;
      }>(
        `query questionTitle($titleSlug: String!) {
          question(titleSlug: $titleSlug) { titleSlug }
        }`,
        { titleSlug: slug },
      );
      return Boolean(payload.question?.titleSlug);
    } catch {
      return null;
    }
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const url = this.config.graphqlUrl ?? "https://leetcode.com/graphql";
    const timeoutMs = this.config.timeoutMs ?? 15_000;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`LeetCode API returned ${res.status}`);
    }

    const payload = (await res.json()) as {
      data?: T;
      errors?: { message: string }[];
    };

    if (payload.errors?.length) {
      throw new Error(payload.errors[0]!.message);
    }

    if (!payload.data) {
      throw new Error("LeetCode API returned no data");
    }

    return payload.data;
  }
}

/** Parses LeetCode submissionCalendar JSON into ISO date keys (UTC). */
export function parseSubmissionCalendar(
  submissionCalendar: string,
): Record<string, number> {
  const raw = JSON.parse(submissionCalendar) as Record<string, number>;
  const counts: Record<string, number> = {};

  for (const [ts, count] of Object.entries(raw)) {
    const key = new Date(Number(ts) * 1000).toISOString().slice(0, 10);
    counts[key] = count;
  }

  return counts;
}

function mergeSubmissionCalendar(
  target: Record<string, number>,
  submissionCalendar: string,
): void {
  const parsed = parseSubmissionCalendar(submissionCalendar);
  for (const [date, count] of Object.entries(parsed)) {
    target[date] = count;
  }
}

function normalizeDifficulty(
  value: string,
): LeetCodeDifficultyStats["difficulty"] {
  if (value === "Easy" || value === "Medium" || value === "Hard" || value === "All") {
    return value;
  }
  return "All";
}

export function createLeetCodeClient(config: LeetCodeConfig): LeetCodeClient {
  return new LeetCodeClient(config);
}
