import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression guard for icons vanishing inside buttons.
 *
 * The reset applies `max-width: 100%` to every svg. Inside a tight flex parent
 * — an icon-only ghost button, a table action cell — that resolves against a
 * container with no width of its own and collapses the icon to nothing. The
 * button still renders, so the admin sees blank squares where Edit / Delete /
 * View should be, which is exactly what was reported on the children table.
 *
 * Asserted against the stylesheet text because these rules have no component
 * to render: jsdom does not do layout, so a mounted test could not observe the
 * collapse either.
 */
describe('globals.css — icon sizing', () => {
  const css = fs.readFileSync(path.join(__dirname, 'globals.css'), 'utf8');

  it('still applies the reset that constrains media', () => {
    // Guards the premise: if this reset ever goes away the exemptions below
    // become dead weight and this suite should be revisited.
    expect(css).toMatch(/img,\s*video,\s*canvas,\s*svg\s*\{[^}]*max-width:\s*100%/);
  });

  it('exempts icons inside buttons and links from that constraint', () => {
    const exemption = css.match(/button svg[\s\S]{0,120}?\{[^}]*\}/);
    expect(exemption).not.toBeNull();
    expect(exemption![0]).toContain('max-width: none');
  });

  it('covers anchors and role=button, not just <button>', () => {
    // The View action is a lucide icon inside a next/link anchor.
    const block = css.slice(css.indexOf('button svg'));
    expect(block).toContain('a svg');
    expect(block).toContain("[role='button'] svg");
  });

  it('stops a flex parent squeezing an icon', () => {
    expect(css).toMatch(/svg\s*\{[^}]*flex-shrink:\s*0/);
  });
});
