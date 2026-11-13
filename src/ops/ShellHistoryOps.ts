import fs from 'node:fs';
import path from 'node:path';
import { frodo } from '@rockcarver/frodo-lib';

/**
 * A history entry that spans several lines (a script pasted into the web
 * console) cannot be stored as-is in a file with one entry per line. It is
 * stored as this prefix plus the JSON-encoded text. The prefix cannot begin
 * a JavaScript statement (a bare `#` is only valid before a private field
 * name), so no ordinary entry is mistaken for an encoded one, and history
 * files written before this existed read back unchanged.
 */
const MULTILINE_PREFIX = '#ml:';

/**
 * The most entries a history file holds. Beyond it, the oldest entries are
 * dropped on the next add: the file stays bounded, the newest (the ones
 * recall and search actually use) survive. High enough that a heavy
 * console user needs months to reach it.
 */
const MAX_ENTRIES = 10_000;

function encodeEntry(entry: string): string {
  return /[\r\n]/.test(entry)
    ? MULTILINE_PREFIX + JSON.stringify(entry)
    : entry;
}

function decodeEntry(raw: string): string {
  if (raw.startsWith(MULTILINE_PREFIX)) {
    try {
      const decoded: unknown = JSON.parse(raw.slice(MULTILINE_PREFIX.length));
      if (typeof decoded === 'string') return decoded;
    } catch {
      // not an encoded entry after all: fall through and keep the raw text
    }
  }
  return raw;
}

/**
 * Manages persistent shell history per connection host.
 *
 * History files are stored under the Frodo home directory in shell-history/
 * with files keyed by a normalized host identifier. Each line of history is
 * stored as-is (one per line).
 */
export class ShellHistory {
  private historyDir: string;
  private historyFile: string;
  private lines: string[] = [];

  constructor(host?: string) {
    // Determine the history directory
    const frodoDir = frodo.utils.getFrodoHome();
    this.historyDir = path.join(frodoDir, 'shell-history');

    // Ensure the directory exists
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }

    // The web console passes no host on purpose: its history is common
    // across connections (one console, many environments; the commands are
    // the person's, not the tenant's). A host still names the file where
    // the terminal asks for one, so per-host history keeps working there.
    const hostKey = this.normalizeHostKey(host || 'default');
    this.historyFile = path.join(this.historyDir, `${hostKey}.txt`);

    // Load existing history
    this.loadHistory();
  }

  /**
   * One shared file for every web-console engine: the same commands, typed
   * against whichever environment, live in one history. Existing per-host
   * files are folded in read-only so nothing the user built up is lost;
   * new entries all land here.
   */
  static shared(): ShellHistory {
    const shared = new ShellHistory();
    shared.absorbPerHostFiles();
    return shared;
  }

  /**
   * Read the per-host files this shared history used to write (default.txt
   * plus one per environment) into the shared one, without re-writing
   * them: their entries join the shared file on the next addLine, and the
   * files stop being the record.
   */
  private absorbPerHostFiles(): void {
    try {
      const files = fs
        .readdirSync(this.historyDir)
        .filter((name) => name.endsWith('.txt'));
      const merged = [...this.lines];
      let changed = false;
      for (const name of files) {
        if (path.join(this.historyDir, name) === this.historyFile) continue;
        try {
          const content = fs.readFileSync(
            path.join(this.historyDir, name),
            'utf-8'
          );
          for (const raw of content.split('\n')) {
            if (raw.length === 0) continue;
            const line = decodeEntry(raw);
            // Keep the file's own order; drop what the shared file has.
            if (!merged.includes(line)) {
              merged.push(line);
              changed = true;
            }
          }
        } catch {
          // One unreadable file must not sink the rest.
        }
      }
      if (changed) {
        this.lines = merged;
        this.save();
      }
    } catch {
      // No directory listing, no merge; the shared file still works.
    }
  }

  /**
   * Normalize host/URL to a safe filename.
   * Example: https://example.com/am -> example_com_am
   */
  private normalizeHostKey(host: string): string {
    return host
      .replace(/^https?:\/\//, '') // remove protocol
      .replace(/[^a-zA-Z0-9]/g, '_') // replace non-alnum with underscore
      .replace(/_+/g, '_') // collapse consecutive underscores
      .replace(/^_+|_+$/g, '') // trim edges
      .toLowerCase()
      .slice(0, 200); // cap length
  }

  /**
   * Load history from disk into memory.
   */
  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyFile)) {
        const content = fs.readFileSync(this.historyFile, 'utf-8');
        const loaded = content
          .split('\n')
          .filter((line) => line.length > 0)
          .map(decodeEntry);
        // Files written before dedup could hold repeated commands;
        // collapse those to the last occurrence of each. Then apply the
        // size cap, so a file that predates it (or was written by another
        // tool) cannot grow memory without bound.
        const deduped = loaded.filter(
          (line, i) => loaded.lastIndexOf(line) === i
        );
        this.lines = deduped.slice(Math.max(0, deduped.length - MAX_ENTRIES));
      } else {
        this.lines = [];
      }
    } catch {
      // If we can't read, just start with empty history
      this.lines = [];
    }
  }

  /**
   * Save current history to disk.
   */
  public save(): void {
    try {
      const content = this.lines.map(encodeEntry).join('\n');
      fs.writeFileSync(this.historyFile, content, 'utf-8');
    } catch {
      // Silently fail if we can't write (don't break the shell)
    }
  }

  /**
   * Add a line to history and persist it. A repeat of an earlier entry
   * moves it to the end instead of adding a copy: history records the
   * last time each distinct input ran, so re-running a command does not
   * bury the rest of the history under copies of it.
   */
  public addLine(line: string): void {
    if (line.trim().length === 0) return;
    const at = this.lines.lastIndexOf(line);
    if (at !== -1) this.lines.splice(at, 1);
    this.lines.push(line);
    // Oldest entries fall off past the cap (this.lines is oldest-first).
    if (this.lines.length > MAX_ENTRIES) {
      this.lines.splice(0, this.lines.length - MAX_ENTRIES);
    }
    this.save();
  }

  /**
   * Get all history lines for use with the REPL.
   * Returns lines in newest-first order to match Node.js REPL's history
   * convention (replServer.history[0] === most recent command). The
   * terminal asks for `singleLineOnly`: readline cannot recall an entry that
   * contains line breaks, and those entries come from the web console.
   */
  public getLines(options: { singleLineOnly?: boolean } = {}): string[] {
    const lines = options.singleLineOnly
      ? this.lines.filter((line) => !/[\r\n]/.test(line))
      : this.lines;
    return [...lines].reverse();
  }

  /**
   * Replace history with the provided newest-first array and persist.
   * Used to sync after in-memory mutations (clear, trim).
   */
  public setLinesFromNewest(lines: string[]): void {
    this.lines = [...lines].reverse();
    this.save();
  }

  /**
   * Get the path where history is stored (for debugging/info).
   */
  public getHistoryPath(): string {
    return this.historyFile;
  }
}
