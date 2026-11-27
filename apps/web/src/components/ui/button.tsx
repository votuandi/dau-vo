import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Variant guide: one `default` (primary) action per area; `outline` for secondary
// actions; the `*-soft` variants for compact row actions whose color carries meaning
// (edit = soft, activate = success-soft, pause/regenerate = warning-soft, delete =
// destructive-soft). Icon-only buttons must have an aria-label and a title.
const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg text-center text-sm font-medium leading-tight transition-[color,background-color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:bg-destructive/90',
        'destructive-gradient':
          'bg-destructive text-destructive-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:bg-destructive/90 focus-visible:ring-destructive',
        success:
          'bg-success text-success-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:bg-success/90',
        outline:
          'border border-foreground/[0.12] bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-foreground/[0.2] hover:bg-muted/60',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        soft: 'border border-primary/15 bg-primary/10 text-primary hover:bg-primary/15',
        'success-soft': 'border border-success/20 bg-success/10 text-success hover:bg-success/15',
        'warning-soft': 'border border-warning/20 bg-warning/10 text-warning hover:bg-warning/15',
        'destructive-soft':
          'border border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15',
        ghost: 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        // min-h lets long labels wrap on narrow screens instead of overflowing.
        default: 'min-h-10 px-4 py-2',
        sm: 'min-h-9 rounded-lg px-3 py-1.5',
        lg: 'min-h-11 rounded-lg px-6 py-2.5 text-sm',
        icon: 'size-9',
        'icon-sm': 'size-8 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : 'button';

    return (
      <Component
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button };
