import fs from 'node:fs';
import path from 'node:path';

import { frodo } from '@rockcarver/frodo-lib';

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

    // Determine the history file based on the host
    const hostKey = this.normalizeHostKey(host || 'default');
    this.historyFile = path.join(this.historyDir, `${hostKey}.txt`);

    // Load existing history
    this.loadHistory();
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
        this.lines = content.split('\n').filter((line) => line.length > 0);
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
      const content = this.lines.join('\n');
      fs.writeFileSync(this.historyFile, content, 'utf-8');
    } catch {
      // Silently fail if we can't write (don't break the shell)
    }
  }

  /**
   * Add a line to history and persist it.
   */
  public addLine(line: string): void {
    if (line.trim().length > 0) {
      this.lines.push(line);
      this.save();
    }
  }

  /**
   * Get all history lines for use with the REPL.
   * Returns lines in newest-first order to match Node.js REPL's history
   * convention (replServer.history[0] === most recent command).
   */
  public getLines(): string[] {
    return [...this.lines].reverse();
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
