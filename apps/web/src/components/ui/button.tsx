import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Also for links that look like buttons: `<Link className={buttonVariants({ variant: "outline" })}>`. */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap no-underline transition-[background-color,border-color,color,opacity] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary font-semibold text-primary-foreground hover:not-disabled:bg-[color-mix(in_oklab,var(--color-primary)_86%,var(--color-foreground))]",
        outline: "border border-border-strong bg-panel font-medium text-foreground hover:not-disabled:border-primary",
        secondary: "border border-border-strong bg-card font-semibold text-foreground hover:not-disabled:border-primary",
        destructive:
          "bg-destructive font-semibold text-card hover:not-disabled:bg-[color-mix(in_oklab,var(--color-destructive)_86%,var(--color-foreground))]",
        "destructive-outline":
          "border border-destructive/50 bg-card font-semibold text-destructive hover:not-disabled:border-destructive",
        ghost: "text-muted-foreground hover:not-disabled:bg-card hover:not-disabled:text-foreground",
        link: "h-auto p-0 text-xs text-primary underline underline-offset-3",
      },
      size: {
        default: "h-[34px] gap-[7px] rounded-[9px] px-[13px] text-[13px] [&_svg]:size-3.5",
        sm: "h-8 gap-[7px] rounded-md px-3 text-[12.5px] [&_svg]:size-3.5",
        lg: "h-[42px] gap-[9px] rounded-lg px-[18px] text-sm [&_svg]:size-3.5",
        icon: "size-[30px] rounded-md p-0 [&_svg]:size-4",
        inline: "",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size: variant === "link" && !size ? "inline" : size }), className)}
      {...props}
    />
  );
}
