import fs from 'node:fs';
import path from 'node:path';
import { frodo } from '@rockcarver/frodo-lib';

/**
 * A history entry that spans several lines cannot be stored as-is in a
 * file with one entry per line. It is stored as this prefix plus the
 * JSON-encoded text (the metadata-less form; with metadata it takes the
 * rich form below). The prefix cannot begin a JavaScript statement (a
 * bare `#` is only valid before a private field name), so no ordinary
 * entry is mistaken for an encoded one, and history files written before
 * this existed read back unchanged.
 */
const MULTILINE_PREFIX = '#ml:';

/**
 * A rich entry: the prefix plus a JSON object `{text, ts, host, id}`. The
 * same cannot-begin-a-statement argument holds, and the two prefixes are
 * told apart by the character after `#`. Files written before this existed
 * read back unchanged (bare lines, and #ml: lines, keep their meaning).
 * A multi-line entry with metadata (every one since the rich form) uses
 * this prefix too: the JSON object holds the line breaks as readily as a
 * JSON string would.
 */
const RICH_PREFIX = '#h:';

/**
 * The base name of the file the shared history (the web console, and the
 * terminal run without a host) writes, without the .txt suffix. The v2
 * marks the entry format that stores a multi-line script whole with its
 * metadata: the files this replaced (default.txt and the per-host ones)
 * predate it and hold the corrupted per-line fragments of the old paste
 * handling. They are still read (see absorbPerHostFiles), so a downgrade
 * does not crash; they just stop being the record. A future format change
 * bumps the version: v3, v4, ...
 */
const SHARED_HISTORY_BASE = 'shared-v2';

/**
 * The most entries a history file holds. Beyond it, the oldest entries are
 * dropped on the next add: the file stays bounded, the newest (the ones
 * recall and search actually use) survive. High enough that a heavy
 * console user needs months to reach it.
 */
const MAX_ENTRIES = 10_000;

/** What an entry carries beyond its text. All fields optional. */
export type HistoryMeta = {
  /** When the input ran (epoch ms). */
  ts?: number;
  /** The environment it ran against (the frodo host). */
  host?: string;
  /**
   * A stable id for the entry, unique within the history file and
   * monotonic in insertion order. Stamped by the store on add (and by
   * the fold of the old per-host files); display only, so entries from
   * files written before it exist carry none and everything about them
   * works unchanged.
   */
  id?: number;
};

export type HistoryEntry = { text: string } & HistoryMeta;

function encodeEntry(entry: HistoryEntry): string {
  const hasMeta =
    entry.ts !== undefined ||
    entry.host !== undefined ||
    entry.id !== undefined;
  // A multi-line text is a JSON string either way; with metadata it is
  // a JSON object (the #h: form holds the line breaks just as well).
  if (/[\r\n]/.test(entry.text)) {
    return hasMeta
      ? RICH_PREFIX + JSON.stringify(entry)
      : MULTILINE_PREFIX + JSON.stringify(entry.text);
  }
  // Any metadata (the id included) needs the rich form: a bare line
  // carries nothing but the command, so an id written bare would be
  // lost on reload.
  if (hasMeta) {
    return RICH_PREFIX + JSON.stringify(entry);
  }
  return entry.text;
}

function decodeEntry(raw: string): HistoryEntry {
  if (raw.startsWith(MULTILINE_PREFIX)) {
    try {
      const decoded: unknown = JSON.parse(raw.slice(MULTILINE_PREFIX.length));
      if (typeof decoded === 'string') return { text: decoded };
    } catch {
      // not an encoded entry after all: fall through and keep the raw text
    }
  }
  if (raw.startsWith(RICH_PREFIX)) {
    try {
      const decoded: unknown = JSON.parse(raw.slice(RICH_PREFIX.length));
      if (
        decoded !== null &&
        typeof decoded === 'object' &&
        typeof (decoded as HistoryEntry).text === 'string'
      ) {
        const { text, ts, host, id } = decoded as HistoryEntry;
        return {
          text,
          ts,
          host,
          id: typeof id === 'number' ? id : undefined,
        };
      }
    } catch {
      // not a rich entry after all: fall through and keep the raw text
    }
  }
  return { text: raw };
}

/**
 * Manages persistent shell history per connection host.
 *
 * History files are stored under the Frodo home directory in shell-history/
 * with files keyed by a normalized host identifier. Entries are one per
 * line: plain lines carry just the command; `#h:` lines carry the command
 * plus its metadata (when it ran, against which environment, its id) as a
 * JSON object, and a multi-line script with metadata uses that form too;
 * `#ml:` lines carry a multi-line script as a JSON string (no metadata).
 */
export class ShellHistory {
  private historyDir: string;
  private historyFile: string;
  private entries: HistoryEntry[] = [];
  /** The next id an added entry gets; seeded past what the file holds. */
  private nextId = 1;

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
    // No host means the shared file. Its name carries a format version:
    // the first shared format corrupted multi-line entries (each pasted
    // line stored as a separate, reversed fragment), and rather than try
    // to tell those fragments from real single-line commands, the file is
    // cut over and the old one abandoned (read-only by absorbPerHostFiles,
    // so nothing crashes but the fragments are left behind). A future
    // format change bumps the version the same way.
    const hostKey = host ? this.normalizeHostKey(host) : SHARED_HISTORY_BASE;
    this.historyFile = path.join(this.historyDir, `${hostKey}.txt`);

    // Load existing history
    this.loadHistory();
  }

  /**
   * One shared file for every web-console engine: the same commands, typed
   * against whichever environment, live in one history. Existing per-host
   * files are folded in read-only so nothing the user built up is lost;
   * new entries all land here. Folded entries keep their environment: the
   * file name names the host they were typed against.
   */
  static shared(): ShellHistory {
    const shared = new ShellHistory();
    shared.absorbPerHostFiles();
    return shared;
  }

  /**
   * Read the per-host files earlier versions wrote (default.txt plus one
   * per environment) into the shared one, without re-writing them: their
   * entries join the shared file on the next addLine, and the files stop
   * being the record. Each folded entry is stamped with the host its file
   * names, so the provenance the per-host layout held is not lost to the
   * fold. The pre-shared default.txt is folded like the rest; it predates
   * the whole-entry format and may hold the corrupted per-line fragments
   * of the old paste handling (they fold in as the single-line commands
   * they were stored as; the cutover to shared-v2 keeps them out of the
   * way but cannot tell them from real commands). Versioned shared files
   * (shared-v3 if one ever exists) are left alone: only the current
   * shared file is this instance's.
   */
  private absorbPerHostFiles(): void {
    try {
      const files = fs
        .readdirSync(this.historyDir)
        .filter((name) => name.endsWith('.txt'));
      const merged = [...this.entries];
      let changed = false;
      for (const name of files) {
        if (path.join(this.historyDir, name) === this.historyFile) continue;
        // Another version's shared file is not folded in either: its
        // entries belong to whichever format wrote them, and a future
        // reader cuts over deliberately, not by absorption.
        if (/^shared-v\d+\.txt$/.test(name)) continue;
        // yyc_dev.txt -> yyc dev; the reverse of normalizeHostKey is lossy,
        // but the name is still the only host hint the file carries.
        const foldedHost = name
          .replace(/\.txt$/, '')
          .replace(/_/g, '.')
          .replace(/^default$/, '');
        try {
          const content = fs.readFileSync(
            path.join(this.historyDir, name),
            'utf-8'
          );
          for (const raw of content.split('\n')) {
            if (raw.length === 0) continue;
            const entry = decodeEntry(raw);
            // Keep the file's own order; drop what the shared file has.
            if (!merged.some((m) => m.text === entry.text)) {
              merged.push({
                ...entry,
                host: entry.host || foldedHost || undefined,
                id: entry.id ?? this.nextId++,
              });
              changed = true;
            }
          }
        } catch {
          // One unreadable file must not sink the rest.
        }
      }
      if (changed) {
        this.entries = merged;
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
        const texts = loaded.map((e) => e.text);
        const deduped = loaded.filter(
          (_entry, i) => texts.lastIndexOf(texts[i]) === i
        );
        this.entries = deduped.slice(Math.max(0, deduped.length - MAX_ENTRIES));
        // The id counter continues past every id the file holds, so a
        // reloaded entry's id is never reissued to a new one.
        for (const e of this.entries) {
          if (typeof e.id === 'number' && e.id >= this.nextId) {
            this.nextId = e.id + 1;
          }
        }
      } else {
        this.entries = [];
      }
    } catch {
      // If we can't read, just start with empty history
      this.entries = [];
    }
  }

  /**
   * Save current history to disk.
   */
  public save(): void {
    try {
      const content = this.entries.map(encodeEntry).join('\n');
      fs.writeFileSync(this.historyFile, content, 'utf-8');
    } catch {
      // Silently fail if we can't write (don't break the shell)
    }
  }

  /**
   * Add a line to history and persist it. A repeat of an earlier entry
   * moves it to the end instead of adding a copy: history records the
   * last time each distinct input ran, so re-running a command does not
   * bury the rest of the history under copies of it. Metadata follows the
   * move: the newest run's time and environment replace the old, and an
   * entry without metadata gains it when it repeats with some.
   */
  public addLine(line: string, meta?: HistoryMeta): void {
    if (line.trim().length === 0) return;
    const at = this.entries.findIndex((e) => e.text === line);
    if (at !== -1) {
      const existing = this.entries[at];
      const next: HistoryEntry = { text: line, ...meta };
      this.entries.splice(at, 1);
      // A repeat refreshes what the entry says about itself; fields the
      // caller does not supply keep the older values. The id is the
      // entry's, not the run's: it never moves with a repeat (it is
      // stable, that is the point), and a repeat is not an insertion,
      // so it spends no id.
      const { id: _ignored, ...rest } = next;
      void _ignored;
      this.entries.push({
        ...existing,
        ...Object.fromEntries(
          Object.entries(rest).filter(([, v]) => v !== undefined)
        ),
      } as HistoryEntry);
    } else {
      this.entries.push({ text: line, id: this.nextId++, ...meta });
    }
    // Oldest entries fall off past the cap (this.entries is oldest-first).
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    this.save();
  }

  /**
   * Remove the entry with exactly this text and persist. History dedups by
   * text (a repeat moves rather than adds), so at most one entry carries a
   * given text: one call removes it whole. False when no entry matched.
   */
  public deleteEntry(text: string): boolean {
    const at = this.entries.findIndex((e) => e.text === text);
    if (at === -1) return false;
    this.entries.splice(at, 1);
    this.save();
    return true;
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
      ? this.entries.filter((e) => !/[\r\n]/.test(e.text))
      : this.entries;
    return lines.map((e) => e.text).reverse();
  }

  /**
   * Get the full entries (text plus metadata), newest first, for consumers
   * that show more than the command: the Ctrl+R popups and the .history
   * listing.
   */
  public getEntries(
    options: { singleLineOnly?: boolean } = {}
  ): HistoryEntry[] {
    const entries = options.singleLineOnly
      ? this.entries.filter((e) => !/[\r\n]/.test(e.text))
      : this.entries;
    return [...entries].reverse();
  }

  /**
   * Replace history with the provided newest-first array and persist.
   * Used to sync after in-memory mutations (clear, trim).
   */
  public setLinesFromNewest(lines: string[]): void {
    this.entries = [...lines].reverse().map((text) => ({ text }));
    this.save();
  }

  /**
   * Get the path where history is stored (for debugging/info).
   */
  public getHistoryPath(): string {
    return this.historyFile;
  }
}
