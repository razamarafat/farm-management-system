import * as React from "react";
import { cn } from "@/utils/cn";
import { toPersianDigits, toEnglishDigits } from "@/utils/persianNumbers";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
  persianNumbers?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, label, persianNumbers = type === "number", value, onChange, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState<string>(() => {
      if (persianNumbers && type === "number" && value) {
        return toPersianDigits(value.toString());
      }
      return value ? value.toString() : "";
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let inputValue = e.target.value;
      
      if (persianNumbers && type === "number") {
        // Convert Persian digits to English for storage
        const englishValue = toEnglishDigits(inputValue);
        setDisplayValue(inputValue);
        
        // Create a synthetic event with English value for onChange
        const syntheticEvent = {
          ...e,
          target: {
            ...e.target,
            value: englishValue,
          },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange?.(syntheticEvent);
      } else {
        setDisplayValue(inputValue);
        onChange?.(e);
      }
    };

    React.useEffect(() => {
      if (persianNumbers && type === "number" && value) {
        setDisplayValue(toPersianDigits(value.toString()));
      } else if (value) {
        setDisplayValue(value.toString());
      }
    }, [value, persianNumbers, type]);

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-foreground mb-1">
            {label}
          </label>
        )}
        <input
          type={persianNumbers && type === "number" ? "text" : type}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
            type === "number" && "no-spinners",
            persianNumbers && type === "number" && "text-center",
            error && "border-destructive focus-visible:ring-destructive",
            className
          )}
          ref={ref}
          value={displayValue}
          onChange={handleChange}
          inputMode={persianNumbers && type === "number" ? "numeric" : undefined}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-destructive">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
