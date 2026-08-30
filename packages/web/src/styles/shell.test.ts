import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const shellCss = readFileSync(
  resolve(process.cwd(), 'src/styles/shell.css'),
  'utf8',
);

describe('Industry KPI strip frame', () => {
  it('uses a tokenized 1px outer frame and vertical-only spacing', () => {
    expect(shellCss).toMatch(
      /\.app-shell \.stats-bar\s*\{[\s\S]*?margin-block:\s*var\(--space-3\);[\s\S]*?border:\s*1px solid var\(--color-divider\);[\s\S]*?border-radius:\s*0;/,
    );
  });

  it('keeps the 1px internal dividers and avoids plate-edge doubling', () => {
    expect(shellCss).toMatch(
      /\.app-shell \.stats-bar\s*\{[\s\S]*?gap:\s*1px;[\s\S]*?background:\s*var\(--color-divider\);/,
    );
    expect(shellCss).toMatch(
      /\.app-shell \.stats-plate\s*\{[\s\S]*?border:\s*0;/,
    );
  });
});
