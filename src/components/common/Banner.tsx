import type { ReactNode } from 'react';

export function Banner({
  variant = 'info',
  children,
  role,
}: {
  variant?: 'info' | 'sim' | 'error';
  children: ReactNode;
  role?: 'status' | 'alert';
}) {
  const cls =
    variant === 'sim'
      ? 'mode-banner mode-banner--sim'
      : variant === 'error'
        ? 'mode-banner mode-banner--error'
        : 'mode-banner';
  return (
    <div className={cls} role={role ?? (variant === 'error' ? 'alert' : 'status')}>
      {children}
    </div>
  );
}
