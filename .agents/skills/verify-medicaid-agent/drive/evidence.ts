// Small evidence recorder shared by the *.verify.ts recipes.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

export class Evidence {
  readonly dir: string;
  private steps: Array<Record<string, unknown>> = [];

  constructor(readonly feature: string, readonly entryPoint: string) {
    this.dir = path.join(process.env.VERIFY_EVIDENCE_DIR!, 'artifacts');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /** Screenshot plus ARIA snapshot of <main> for one named step. */
  async capture(page: Page, step: string, note: string): Promise<void> {
    const shot = `${this.steps.length + 1}-${step}.png`;
    const aria = `${this.steps.length + 1}-${step}.aria.yml`;
    await page.screenshot({ path: path.join(this.dir, shot), fullPage: true });
    fs.writeFileSync(path.join(this.dir, aria), await page.locator('main, body').first().ariaSnapshot());
    this.steps.push({ step, note, url: page.url(), screenshot: shot, aria, at: new Date().toISOString() });
  }

  json(name: string, value: unknown): void {
    fs.writeFileSync(path.join(this.dir, name), JSON.stringify(value, null, 2));
  }

  write(result: Record<string, unknown>): void {
    this.json('summary.json', { feature: this.feature, entryPoint: this.entryPoint, steps: this.steps, ...result });
  }
}
