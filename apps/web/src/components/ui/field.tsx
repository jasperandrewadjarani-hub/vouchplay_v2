import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

const controlClass =
  'w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-offset-2';

export function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-foreground block text-sm font-medium">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-foreground-muted text-xs">{hint}</p>}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={controlClass} {...props} />;
}

export function Select({
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={controlClass} {...props}>
      {children}
    </select>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="bg-danger/10 text-danger rounded-lg px-3 py-2 text-sm">
      {children}
    </p>
  );
}

export function FormMessage({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="bg-success/10 text-success rounded-lg px-3 py-2 text-sm">{children}</p>;
}
