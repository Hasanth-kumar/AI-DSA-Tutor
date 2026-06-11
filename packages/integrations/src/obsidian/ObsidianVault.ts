import { watch, type FSWatcher } from "chokidar";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

export interface ObsidianNoteFile {
  /** Path relative to the vault root. */
  path: string;
  /** Filename without extension. */
  title: string;
  frontmatter: Record<string, string>;
  /** Markdown body (frontmatter stripped). */
  content: string;
  contentHash: string;
  modifiedAt: number;
}

export interface VaultWatchHandlers {
  onChanged: (note: ObsidianNoteFile) => void;
  onRemoved: (relativePath: string) => void;
  onError?: (err: unknown) => void;
}

/** Sync-conflict duplicates that must never be ingested. */
const CONFLICT_PATTERNS = [
  /\s\(\d+\)\.md$/i, // "Two Sum (1).md"
  /conflicted copy/i, // Dropbox
  /\.sync-conflict-/i, // Syncthing
];

export function isConflictFile(filename: string): boolean {
  return CONFLICT_PATTERNS.some((re) => re.test(filename));
}

/**
 * Minimal YAML frontmatter parser — flat `key: value` pairs only, which is all
 * the note templates use. Unparseable lines are skipped, never fatal.
 */
export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, string>;
  content: string;
} {
  if (!raw.startsWith("---")) {
    return { frontmatter: {}, content: raw };
  }
  const end = raw.indexOf("\n---", 3);
  if (end === -1) {
    return { frontmatter: {}, content: raw };
  }

  const block = raw.slice(raw.indexOf("\n") + 1, end);
  const content = raw.slice(end + 4).replace(/^\r?\n/, "");
  const frontmatter: Record<string, string> = {};

  for (const line of block.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (value) frontmatter[match[1].toLowerCase()] = value;
  }

  return { frontmatter, content };
}

/**
 * Strip Obsidian-specific syntax so LLMs never see raw link markup:
 * `![[embed]]` is dropped, `[[target|alias]]` → alias, `[[target]]` → target.
 */
export function stripWikiLinks(markdown: string): string {
  return markdown
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1");
}

/**
 * Read-only Obsidian vault access. The system never modifies existing notes;
 * the only write path is `createNoteFile`, which refuses to overwrite.
 */
export class ObsidianVault {
  private watcher: FSWatcher | null = null;

  constructor(private readonly vaultPath: string) {}

  isConfigured(): boolean {
    return Boolean(this.vaultPath) && existsSync(this.vaultPath);
  }

  get root(): string {
    return this.vaultPath;
  }

  /** Full scan of every markdown note in the vault (recursive). */
  scan(): ObsidianNoteFile[] {
    if (!this.isConfigured()) return [];
    const notes: ObsidianNoteFile[] = [];
    this.walk(this.vaultPath, notes);
    return notes;
  }

  readNote(relativePath: string): ObsidianNoteFile | null {
    const absolute = join(this.vaultPath, relativePath);
    if (!existsSync(absolute)) return null;
    return this.toNote(absolute);
  }

  /** Watch for created/modified/deleted markdown files. */
  startWatching(handlers: VaultWatchHandlers): void {
    if (!this.isConfigured() || this.watcher) return;

    this.watcher = watch(this.vaultPath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    const handleFile = (absolutePath: string) => {
      if (extname(absolutePath).toLowerCase() !== ".md") return;
      if (isConflictFile(basename(absolutePath))) return;
      try {
        const note = this.toNote(absolutePath);
        if (note) handlers.onChanged(note);
      } catch (err) {
        handlers.onError?.(err);
      }
    };

    this.watcher
      .on("add", handleFile)
      .on("change", handleFile)
      .on("unlink", (absolutePath) => {
        if (extname(absolutePath).toLowerCase() !== ".md") return;
        handlers.onRemoved(relative(this.vaultPath, absolutePath));
      })
      .on("error", (err) => handlers.onError?.(err));
  }

  async stopWatching(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Create a brand-new note file (2.4). Never overwrites: returns null when a
   * file with that name already exists.
   */
  createNoteFile(filename: string, content: string): string | null {
    if (!this.isConfigured()) return null;
    const safe = filename.replace(/[/\\]/g, "-");
    const absolute = join(this.vaultPath, safe.endsWith(".md") ? safe : `${safe}.md`);
    if (existsSync(absolute)) return null;
    writeFileSync(absolute, content, { encoding: "utf-8", flag: "wx" });
    return relative(this.vaultPath, absolute);
  }

  private walk(dir: string, out: ObsidianNoteFile[]): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walk(absolute, out);
      } else if (
        extname(entry.name).toLowerCase() === ".md" &&
        !isConflictFile(entry.name)
      ) {
        const note = this.toNote(absolute);
        if (note) out.push(note);
      }
    }
  }

  private toNote(absolutePath: string): ObsidianNoteFile | null {
    let raw: string;
    let modifiedAt: number;
    try {
      raw = readFileSync(absolutePath, "utf-8");
      modifiedAt = statSync(absolutePath).mtimeMs;
    } catch {
      return null;
    }

    const { frontmatter, content } = parseFrontmatter(raw);
    return {
      path: relative(this.vaultPath, absolutePath),
      title: basename(absolutePath, ".md"),
      frontmatter,
      content,
      contentHash: createHash("sha1").update(raw).digest("hex"),
      modifiedAt,
    };
  }
}

export function createObsidianVault(vaultPath: string): ObsidianVault {
  return new ObsidianVault(vaultPath);
}
