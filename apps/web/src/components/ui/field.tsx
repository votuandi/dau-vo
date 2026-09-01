import type { InputHTMLAttributes, ReactNode } from 'react';
import { Input } from './input';
interface FieldProps extends InputHTMLAttributes<HTMLInputElement> { label: string; hint?: ReactNode | undefined; error?: string | undefined; }
export function Field({ label, hint, error, id, ...props }: FieldProps) { const inputId = id ?? props.name; return <label className="grid gap-2 text-sm font-semibold" htmlFor={inputId}><span>{label}</span><Input aria-invalid={Boolean(error)} id={inputId} {...props} />{error ? <span className="text-xs text-destructive">{error}</span> : !error && hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}</label>; }
