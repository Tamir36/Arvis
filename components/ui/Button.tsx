import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent" | "outline";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variants = {
  primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-sm focus:ring-blue-500",
  secondary: "bg-slate-100 hover:bg-slate-200 text-slate-700 focus:ring-slate-400",
  ghost: "hover:bg-slate-100 text-slate-600 focus:ring-slate-400",
  danger: "bg-red-600 hover:bg-red-700 text-white shadow-sm focus:ring-red-500",
  accent: "bg-orange-500 hover:bg-orange-600 text-white shadow-sm focus:ring-orange-400",
  outline: "border border-slate-200 hover:bg-slate-50 text-slate-700 focus:ring-slate-400",
};

const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading,
      leftIcon,
      rightIcon,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium rounded-xl",
          "transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        {children}
        {rightIcon && !isLoading && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
