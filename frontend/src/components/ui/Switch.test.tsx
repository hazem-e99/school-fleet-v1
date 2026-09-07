import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './Switch';

/**
 * Direction-sensitive logic, tested where it is practical to do so: the knob's
 * position and travel are expressed as classes, so they can be asserted
 * without a browser.
 *
 * The bug this guards: the knob used physical `left-0.5` + `translate-x-5`, so
 * in Arabic it started on the left and travelled right — animating backwards
 * and ending outside its own track. Visual breakpoint checking stays a manual
 * pass; this covers the logic.
 */
describe('Switch — RTL-safe knob', () => {
  const knobOf = (container: HTMLElement) =>
    container.querySelector('label > div > div') as HTMLElement;

  it('positions the knob with a logical property, not a physical one', () => {
    const { container } = render(<Switch checked={false} onCheckedChange={() => {}} />);
    const knob = knobOf(container);
    expect(knob.className).toContain('start-0.5');
    expect(knob.className).not.toContain('left-0.5');
  });

  it('flips the travel direction under RTL', () => {
    const { container } = render(<Switch checked onCheckedChange={() => {}} />);
    const knob = knobOf(container);
    expect(knob.className).toContain('translate-x-5');
    // Without this the knob moves the wrong way in Arabic.
    expect(knob.className).toContain('rtl:-translate-x-5');
  });

  it('does not translate the knob when unchecked', () => {
    const { container } = render(<Switch checked={false} onCheckedChange={() => {}} />);
    expect(knobOf(container).className).toContain('translate-x-0');
  });

  it('remains an operable checkbox', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch checked={false} onCheckedChange={onChange} />);
    await user.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
