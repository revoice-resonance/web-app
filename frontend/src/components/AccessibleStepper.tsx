import { Minus, Plus } from 'lucide-react';

interface AccessibleStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Format the display value */
  format?: (value: number) => string;
  id?: string;
}

/**
 * Accessible stepper control that replaces range sliders.
 * Large +/- buttons instead of drag — critical for users with motor impairments.
 */
export default function AccessibleStepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  id,
}: AccessibleStepperProps) {
  const displayValue = format ? format(value) : String(value);
  const canDecrement = value > min;
  const canIncrement = value < max;

  const decrement = () => {
    const newVal = Math.max(min, parseFloat((value - step).toFixed(10)));
    onChange(newVal);
  };

  const increment = () => {
    const newVal = Math.min(max, parseFloat((value + step).toFixed(10)));
    onChange(newVal);
  };

  // Calculate progress percentage for the visual bar
  const progress = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <span
          className="text-sm font-semibold text-primary tabular-nums"
          aria-live="polite"
        >
          {displayValue}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Decrement button */}
        <button
          onClick={decrement}
          disabled={!canDecrement}
          className="a11y-target flex-shrink-0 rounded-xl bg-muted text-foreground hover:bg-muted/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label={`减少${label}`}
        >
          <Minus className="h-5 w-5" aria-hidden="true" />
        </button>

        {/* Visual progress bar */}
        <div
          className="relative flex-1 h-3 rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-label={`${label}: ${displayValue}`}
          id={id}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary/60 transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Increment button */}
        <button
          onClick={increment}
          disabled={!canIncrement}
          className="a11y-target flex-shrink-0 rounded-xl bg-muted text-foreground hover:bg-muted/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label={`增加${label}`}
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Min/Max labels */}
      <div className="flex justify-between text-[10px] text-muted-foreground px-14">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}
