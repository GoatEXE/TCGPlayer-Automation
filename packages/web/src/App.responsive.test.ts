import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8');
const responsiveCss = appCss.slice(appCss.indexOf('/* Responsive */'));
const shellCss = readFileSync(resolve(process.cwd(), 'src/styles/shell.css'), 'utf8');
const industryCss = readFileSync(
  resolve(process.cwd(), 'src/styles/industry.css'),
  'utf8',
);
const inventoryCss = readFileSync(
  resolve(process.cwd(), 'src/styles/inventory.css'),
  'utf8',
);
const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('Inventory filters responsive layout', () => {
  it('keeps filters and search controls shrinkable at the mobile breakpoint', () => {
    expect(responsiveCss).toMatch(
      /\.filters\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;/,
    );
    expect(responsiveCss).toMatch(
      /\.status-filters\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;/,
    );
    expect(responsiveCss).toMatch(
      /\.search-form\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;[\s\S]*?min-width:\s*0;[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;/,
    );
    expect(responsiveCss).toMatch(
      /\.search-input\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?width:\s*100%;/,
    );
  });

  it('uses contiguous desktop status segments and a full-width two-column grid below 760px', () => {
    expect(inventoryCss).toMatch(
      /\.inventory-workspace \.status-filters\.inventory-status-filters\s*\{[\s\S]*?display:\s*flex;[\s\S]*?gap:\s*0;[\s\S]*?isolation:\s*isolate;/,
    );
    expect(inventoryCss).toMatch(
      /\.status-filters\.inventory-status-filters \.filter-button \+ \.filter-button\s*\{[\s\S]*?margin-left:\s*-1px;/,
    );
    expect(inventoryCss).toMatch(
      /\.filter-button:hover,[\s\S]*?\.filter-button:focus-visible\s*\{[\s\S]*?z-index:\s*2;/,
    );
    expect(inventoryCss).toMatch(
      /\.filter-button\.active\s*\{[\s\S]*?z-index:\s*3;/,
    );
    expect(inventoryCss).toMatch(
      /@media \(max-width: 759px\)[\s\S]*?\.inventory-workspace \.status-filters\.inventory-status-filters\s*\{[\s\S]*?display:\s*grid;[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[\s\S]*?gap:\s*0;/,
    );
    expect(inventoryCss).toMatch(
      /\.status-filters\.inventory-status-filters \.filter-button\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?margin:\s*0;/,
    );
    expect(inventoryCss).toMatch(
      /\.filter-button:nth-child\(even\)\s*\{[\s\S]*?margin-left:\s*-1px;/,
    );
    expect(inventoryCss).not.toMatch(/@media \(max-width: 360px\)/);
  });
});

describe('Industry shell header responsiveness', () => {
  it('keeps the desktop tabs right-aligned before the square utility controls', () => {
    expect(shellCss).toMatch(
      /\.app\.app-shell \.app-header-top\s*\{[\s\S]*?grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto;/,
    );
    expect(shellCss).toMatch(
      /\.app-shell \.shell-view-tabs\s*\{[\s\S]*?width:\s*fit-content;[\s\S]*?justify-self:\s*end;/,
    );
    expect(shellCss).toMatch(
      /button\.shell-utility-button\s*\{[\s\S]*?width:\s*2\.25rem;[\s\S]*?height:\s*2\.25rem;/,
    );
  });

  it('keeps the header controls reachable without document-width overflow below 760px', () => {
    expect(shellCss).toMatch(
      /\.app\.app-shell\s*\{[\s\S]*?overflow-x:\s*clip;/,
    );
    expect(shellCss).toMatch(
      /@media \(max-width: 759px\)[\s\S]*?\.shell-view-tabs\[data-layout='phone'\]\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;[\s\S]*?width:\s*100%;/,
    );
  });

  it('defines a document-wide dark token set with semantic feedback surfaces', () => {
    expect(industryCss).toMatch(
      /:root\[data-theme='dark'\]\s*\{[\s\S]*?--industry-ground:[\s\S]*?--color-success-surface:[\s\S]*?--color-warning-surface:[\s\S]*?--color-error-surface:/,
    );
  });

  it('sets the saved or system theme before Vite mounts the SPA', () => {
    expect(indexHtml).toMatch(/const storageKey = 'tcgplayer-theme';/);
    expect(indexHtml).toMatch(/document\.documentElement\.dataset\.theme = theme;/);
    expect(indexHtml.indexOf('document.documentElement.dataset.theme = theme;')).toBeLessThan(
      indexHtml.indexOf('<script type="module" src="/src/main.tsx"></script>'),
    );
  });
});
