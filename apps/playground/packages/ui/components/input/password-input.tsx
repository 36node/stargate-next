"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/packages/ui/components/shadcn/button";
import { Input, type InputProps } from "./input";

export type PasswordInputProps = Omit<InputProps, "type" | "suffix">;

function PasswordInput({
  ref,
  ...props
}: PasswordInputProps & { ref?: React.Ref<HTMLInputElement> }) {
  const [showPassword, setShowPassword] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  const toggleButton = (
    <Button
      aria-label={showPassword ? "Hide password" : "Show password"}
      className="-mr-1 h-6 w-6 text-muted-foreground hover:text-accent-foreground"
      onClick={togglePasswordVisibility}
      size="icon"
      tabIndex={-1}
      type="button"
      variant="ghost"
    >
      {showPassword ? (
        <Eye className="h-4 w-4" />
      ) : (
        <EyeOff className="h-4 w-4" />
      )}
    </Button>
  );

  return (
    <Input
      {...props}
      ref={ref}
      suffix={toggleButton}
      type={showPassword ? "text" : "password"}
    />
  );
}

export { PasswordInput };
