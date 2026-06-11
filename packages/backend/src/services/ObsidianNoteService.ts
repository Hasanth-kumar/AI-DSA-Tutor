import {
  createObsidianVault,
  slugifyProblemName,
  type ObsidianNoteFile,
  type ObsidianVault,
} from "@dsa/integrations";
import type { AppConfig } from "@dsa/shared";
import type { NoteRepository, NoteRow } from "../repositories/NoteRepository.js";
import type { ProblemRepository, ProblemRow } from "../repositories/ProblemRepository.js";

export interface NoteScanResult {
  scanned: number;
  matched: number;
  unmatched: number;
}

export interface NoteTemplateResult {
  created: boolean;
  path?: string;
  reason?: string;
}

/**
 * Read-only Obsidian vault ingestion (Phase 2). Watches the vault, matches
 * notes to problems (frontmatter slug first, filename fallback), and mirrors
 * metadata + content into SQLite. Existing notes are never modified; the only
 * write is creating brand-new template files (2.4).
 */
export class ObsidianNoteService {
  private readonly vault: ObsidianVault | null;
  private watching = false;

  constructor(
    config: AppConfig,
    private readonly noteRepo: NoteRepository,
    private readonly problemRepo: ProblemRepository,
    private readonly onIngest?: () => void,
  ) {
    this.vault = config.obsidian.vaultPath
      ? createObsidianVault(config.obsidian.vaultPath)
      : null;
  }

  isConfigured(): boolean {
    return this.vault?.isConfigured() ?? false;
  }

  /** Full vault scan — run on startup and on each sync. */
  scanVault(): NoteScanResult {
    if (!this.vault?.isConfigured()) {
      return { scanned: 0, matched: 0, unmatched: 0 };
    }

    const noteFiles = this.vault.scan();
    const problems = this.problemRepo.findAll();
    let matched = 0;

    const livePaths = new Set<string>();
    for (const note of noteFiles) {
      livePaths.add(note.path);
      if (this.ingestNote(note, problems)) matched += 1;
    }

    // Drop rows whose files vanished while the watcher was down.
    for (const row of this.noteRepo.findAll()) {
      if (!livePaths.has(row.path)) {
        this.noteRepo.deleteByPath(row.path);
      }
    }

    return {
      scanned: noteFiles.length,
      matched,
      unmatched: noteFiles.length - matched,
    };
  }

  startWatching(onError?: (err: unknown) => void): void {
    if (!this.vault?.isConfigured() || this.watching) return;
    this.watching = true;

    this.vault.startWatching({
      onChanged: (note) => {
        this.ingestNote(note, this.problemRepo.findAll());
        this.onIngest?.();
      },
      onRemoved: (path) => {
        this.noteRepo.deleteByPath(path);
        this.onIngest?.();
      },
      onError,
    });
  }

  async stopWatching(): Promise<void> {
    await this.vault?.stopWatching();
    this.watching = false;
  }

  getNoteForProblem(problemId: string): NoteRow | null {
    return this.noteRepo.findByProblemId(problemId);
  }

  getNotesForTopic(topicId: string): NoteRow[] {
    return this.noteRepo.findByTopicId(topicId);
  }

  /**
   * Generate a pre-filled note template for a just-logged problem (2.4).
   * New files only — never overwrites.
   */
  createTemplateForProblem(problemId: string): NoteTemplateResult {
    if (!this.vault?.isConfigured()) {
      return { created: false, reason: "Obsidian vault not configured" };
    }
    const problem = this.problemRepo.findById(problemId);
    if (!problem) {
      return { created: false, reason: "Problem not found" };
    }
    if (this.noteRepo.findByProblemId(problemId)) {
      return { created: false, reason: "A note for this problem already exists" };
    }

    const slug = slugifyProblemName(problem.name);
    const topicName = problem.topicId ?? "";
    const content = `---
problem: ${slug}
topic: ${topicName}
difficulty: ${(problem.difficulty ?? "medium").toLowerCase()}
---

# ${problem.name}

## Approach

## Mistake

## Key insight
`;

    const relativePath = this.vault.createNoteFile(problem.name, content);
    if (!relativePath) {
      return { created: false, reason: "A file with this name already exists in the vault" };
    }

    const written = this.vault.readNote(relativePath);
    if (written) {
      this.ingestNote(written, this.problemRepo.findAll());
    }
    return { created: true, path: relativePath };
  }

  /** Frontmatter `problem:` slug wins; fallback to filename ↔ problem-name matching. */
  private ingestNote(note: ObsidianNoteFile, problems: ProblemRow[]): boolean {
    let matchedProblem: ProblemRow | null = null;
    let matchedBy: "frontmatter" | "filename" | null = null;

    const frontmatterSlug = note.frontmatter["problem"];
    if (frontmatterSlug) {
      matchedProblem =
        problems.find((p) => slugifyProblemName(p.name) === slugifyProblemName(frontmatterSlug)) ??
        null;
      if (matchedProblem) matchedBy = "frontmatter";
    }

    if (!matchedProblem) {
      matchedProblem = matchNoteTitleToProblem(note.title, problems);
      if (matchedProblem) matchedBy = "filename";
    }

    this.noteRepo.upsertByPath({
      path: note.path,
      title: note.title,
      problemId: matchedProblem?.id ?? null,
      topicId: matchedProblem?.topicId ?? null,
      frontmatter: note.frontmatter,
      content: note.content,
      contentHash: note.contentHash,
      matchedBy,
    });

    return matchedProblem != null;
  }
}

/**
 * Filename → problem matching, mirroring the GitHub solution matcher's
 * exact-slug then unique-substring strategy.
 */
export function matchNoteTitleToProblem(
  title: string,
  problems: ProblemRow[],
): ProblemRow | null {
  const titleSlug = slugifyProblemName(title);
  if (!titleSlug) return null;

  const exact = problems.find((p) => slugifyProblemName(p.name) === titleSlug);
  if (exact) return exact;

  const contains = problems.filter((p) => {
    const slug = slugifyProblemName(p.name);
    return slug.includes(titleSlug) || titleSlug.includes(slug);
  });
  if (contains.length === 1) return contains[0];

  return null;
}
