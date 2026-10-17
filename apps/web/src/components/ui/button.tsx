import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Variant guide: one `default` (primary) action per area; `outline` for secondary
// actions; the `*-soft` variants for compact row actions whose color carries meaning
// (edit = soft, activate = success-soft, pause/regenerate = warning-soft, delete =
// destructive-soft). Icon-only buttons must have an aria-label and a title.
const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg text-center text-sm font-semibold leading-tight transition-[color,background-color,border-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25',
        destructive:
          'bg-destructive text-destructive-foreground shadow-md shadow-destructive/15 hover:bg-destructive/90',
        'destructive-gradient':
          'bg-gradient-to-r from-red-600 to-red-800 text-white shadow-md shadow-red-900/15 hover:from-red-700 hover:to-red-900 hover:shadow-lg focus-visible:ring-red-600',
        success:
          'bg-success text-success-foreground shadow-md shadow-success/15 hover:bg-success/90',
        outline:
          'border border-input bg-white/85 text-foreground shadow-sm hover:border-primary/40 hover:bg-accent hover:text-primary',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/75',
        soft: 'border border-primary/15 bg-primary/10 text-primary hover:border-primary/30 hover:bg-primary/15',
        'success-soft':
          'border border-success/20 bg-success/10 text-success hover:border-success/35 hover:bg-success/15',
        'warning-soft':
          'border border-warning/20 bg-warning/10 text-warning hover:border-warning/35 hover:bg-warning/15',
        'destructive-soft':
          'border border-destructive/20 bg-destructive/10 text-destructive hover:border-destructive/35 hover:bg-destructive/15',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-primary',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        // min-h lets long labels wrap on narrow screens instead of overflowing.
        default: 'min-h-10 px-4 py-2',
        sm: 'min-h-9 rounded-lg px-3 py-1.5',
        lg: 'min-h-11 rounded-lg px-8 py-2',
        icon: 'size-10',
        'icon-sm': 'size-9',
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
