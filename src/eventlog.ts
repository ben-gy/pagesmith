// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import { clockStamp } from './format';

export type LogKind = 'info' | 'good' | 'warn' | 'bad';

export interface LogEntry {
  time: string;
  kind: LogKind;
  message: string;
}

const ICON: Record<LogKind, string> = {
  info: '·',
  good: '✓',
  warn: '!',
  bad: '✕',
};

/**
 * The event-log drawer: a collapsible panel that streams state transitions so
 * the user can see exactly what the tool did — and that it never phoned home.
 */
export class EventLog {
  private entries: LogEntry[] = [];
  private listEl: HTMLElement;
  private countEl: HTMLElement;
  private drawer: HTMLElement;
  private liveRegion: HTMLElement;
  private open = false;

  constructor(root: {
    drawer: HTMLElement;
    list: HTMLElement;
    count: HTMLElement;
    live: HTMLElement;
  }) {
    this.drawer = root.drawer;
    this.listEl = root.list;
    this.countEl = root.count;
    this.liveRegion = root.live;
  }

  add(message: string, kind: LogKind = 'info'): void {
    const entry: LogEntry = { time: clockStamp(new Date()), kind, message };
    this.entries.push(entry);

    const row = document.createElement('div');
    row.className = `log-row log-${kind}`;
    const t = document.createElement('span');
    t.className = 'log-time';
    t.textContent = entry.time;
    const ic = document.createElement('span');
    ic.className = 'log-icon';
    ic.textContent = ICON[kind];
    const msg = document.createElement('span');
    msg.className = 'log-msg';
    msg.textContent = message;
    row.append(t, ic, msg);
    this.listEl.appendChild(row);
    this.listEl.scrollTop = this.listEl.scrollHeight;

    this.countEl.textContent = String(this.entries.length);
    // Mirror important events to the aria-live region for screen readers.
    if (kind !== 'info') this.liveRegion.textContent = message;
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.drawer.classList.toggle('open', this.open);
    this.drawer.setAttribute('aria-hidden', String(!this.open));
  }

  toText(): string {
    return this.entries.map((e) => `[${e.time}] ${ICON[e.kind]} ${e.message}`).join('\n');
  }

  get size(): number {
    return this.entries.length;
  }
}
