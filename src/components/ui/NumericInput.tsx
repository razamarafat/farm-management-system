import * as React from 'react';
import { Input, type InputProps } from './Input';

// Persian ۰-۹ and Arabic-Indic ٠-٩ -> ASCII. Local to this component because
// toEnglishDigits in utils intentionally covers only the Persian block.
function normalizeDigits(raw: string): string {
  return raw
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/٫/g, '.');
}

export interface NumericInputProps extends Omit<InputProps, 'type' | 'onChange'> {
  /** Receives an ASCII-normalized string, including valid partial values. */
  onValueChange: (value: string) => void;
  /** Allow decimal point (default true). */
  decimal?: boolean;
}

export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ onValueChange, decimal = true, dir = 'ltr', inputMode, ...props }, ref) => {
    const pattern = decimal ? /^-?\d*(\.\d*)?$/ : /^-?\d*$/;

    return (
      <Input
        ref={ref}
        type="text"
        dir={dir}
        inputMode={inputMode ?? (decimal ? 'decimal' : 'numeric')}
        onChange={(e) => {
          const normalized = normalizeDigits(e.target.value);
          if (normalized === '' || pattern.test(normalized)) {
            onValueChange(normalized);
          }
        }}
        {...props}
      />
    );
  }
);
NumericInput.displayName = 'NumericInput';
