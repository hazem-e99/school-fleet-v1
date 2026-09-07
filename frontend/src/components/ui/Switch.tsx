'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked = false, onCheckedChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (onCheckedChange) {
        onCheckedChange(e.target.checked);
      }
    };

    return (
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={handleChange}
          ref={ref}
          {...props}
        />
        <div
          className={cn(
            'relative w-11 h-6 rounded-full transition-all duration-200 ease-in-out shadow-sm',
            checked ? 'bg-primary shadow-md' : 'bg-border hover:bg-border-light',
            className
          )}
        >
          <div
            className={cn(
              // `start-0.5` and an RTL-flipped translate: with the physical
              // `left-0.5` + `translate-x-5` the knob started on the left and
              // travelled right in Arabic too, so the switch animated the wrong
              // way and sat outside its track when on.
              'absolute top-0.5 start-0.5 w-5 h-5 bg-white rounded-full transition-all duration-200 ease-in-out shadow-md',
              checked ? 'translate-x-5 rtl:-translate-x-5 shadow-lg' : 'translate-x-0'
            )}
          />
        </div>
      </label>
    );
  }
);

Switch.displayName = 'Switch';

export { Switch };
