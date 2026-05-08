import React, { ReactNode } from 'react';
import { clsx } from 'clsx';
import { Loader2, X } from 'lucide-react';

// ── Button ────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type BtnSize = 'sm' | 'md' | 'lg';

const btnVariants: Record<BtnVariant, string> = {
  primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  secondary: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  ghost: 'hover:bg-gray-100 text-gray-600',
  success: 'bg-green-600 hover:bg-green-700 text-white',
};
const btnSizes: Record<BtnSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
  icon?: ReactNode;
}
export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center gap-2 font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed',
        btnVariants[variant],
        btnSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className='w-3.5 h-3.5 animate-spin' /> : icon}
      {children}
    </button>
  );
}

// ── Card ─────────────────────────────────────────────────
export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'bg-white rounded-xl border border-gray-200 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}
export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className='flex items-center justify-between px-5 py-4 border-b border-gray-100'>
      <div>
        <h3 className='font-semibold text-gray-900 text-sm'>{title}</h3>
        {subtitle && <p className='text-xs text-gray-400 mt-0.5'>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────
type BadgeColor =
  | 'gray'
  | 'green'
  | 'red'
  | 'yellow'
  | 'blue'
  | 'indigo'
  | 'orange'
  | 'purple';
const badgeColors: Record<BadgeColor, string> = {
  gray: 'bg-gray-100 text-gray-600',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  blue: 'bg-blue-100 text-blue-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  orange: 'bg-orange-100 text-orange-700',
  purple: 'bg-purple-100 text-purple-700',
};
export function Badge({
  label,
  color = 'gray',
}: {
  label: string;
  color?: BadgeColor;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        badgeColors[color],
      )}
    >
      {label}
    </span>
  );
}

// ── Status Badge ──────────────────────────────────────────
const statusColors: Record<string, BadgeColor> = {
  draft: 'gray',
  active: 'green',
  completed: 'blue',
  stopped: 'red',
  inactive: 'red',
  queued: 'yellow',
  with_agent: 'indigo',
  exhausted: 'orange',
  dnc: 'red',
  available: 'green',
  offline: 'gray',
  processing: 'yellow',
  done: 'green',
  CLOSED: 'blue',
  NEXT_ATTEMPT: 'yellow',
  RESCHEDULE: 'purple',
  finite: 'gray',
  infinite: 'purple',
};
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      label={status.replace('_', ' ')}
      color={statusColors[status] || 'gray'}
    />
  );
}

// ── Spinner ───────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={clsx('animate-spin text-indigo-500', className || 'w-6 h-6')}
    />
  );
}
export function PageLoader() {
  return (
    <div className='flex items-center justify-center h-64'>
      <Spinner className='w-8 h-8' />
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────
interface Col<T> {
  header: string;
  key?: keyof T;
  render?: (row: T) => ReactNode;
  width?: string;
}
interface TableProps<T> {
  cols: Col<T>[];
  rows: T[];
  keyFn: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}
export function Table<T>({
  cols,
  rows,
  keyFn,
  onRowClick,
  emptyMessage = 'No data',
}: TableProps<T>) {
  return (
    <div className='overflow-x-auto'>
      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b border-gray-100'>
            {cols.map((c) => (
              <th
                key={c.header}
                style={{ width: c.width }}
                className='text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3'
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={cols.length}
                className='text-center text-gray-400 py-12 text-sm'
              >
                {emptyMessage}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={keyFn(row)}
              onClick={() => onRowClick?.(row)}
              className={clsx(
                'border-b border-gray-50 hover:bg-gray-50 transition',
                onRowClick && 'cursor-pointer',
              )}
            >
              {cols.map((c) => (
                <td key={c.header} className='px-4 py-3 text-gray-700'>
                  {c.render
                    ? c.render(row)
                    : c.key
                      ? String(row[c.key] ?? '—')
                      : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────
export function Modal({
  title,
  open,
  onClose,
  children,
  size = 'md',
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  if (!open) return null;
  const widths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-6xl',
  };
  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40'
      onClick={onClose}
    >
      <div
        className={clsx('bg-white rounded-xl shadow-xl w-full', widths[size])}
        onClick={(e) => e.stopPropagation()}
      >
        <div className='flex items-center justify-between px-5 py-4 border-b border-gray-100'>
          <h3 className='font-semibold text-gray-900'>{title}</h3>
          <button onClick={onClose} className='p-1 rounded hover:bg-gray-100'>
            <X className='w-4 h-4 text-gray-400' />
          </button>
        </div>
        <div className='p-5'>{children}</div>
      </div>
    </div>
  );
}

// ── Input / Select / Textarea ─────────────────────────────
const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50';

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    label?: string;
    error?: string;
  },
) {
  const { label, error, ...rest } = props;
  return (
    <div>
      {label && (
        <label className='block text-xs text-gray-500 mb-1'>{label}</label>
      )}
      <input className={clsx(inputCls, error && 'border-red-300')} {...rest} />
      {error && <p className='text-xs text-red-500 mt-1'>{error}</p>}
    </div>
  );
}
export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & {
    label?: string;
    options: { value: string; label: string }[];
  },
) {
  const { label, options, ...rest } = props;
  return (
    <div>
      {label && (
        <label className='block text-xs text-gray-500 mb-1'>{label}</label>
      )}
      <select className={inputCls} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string },
) {
  const { label, ...rest } = props;
  return (
    <div>
      {label && (
        <label className='block text-xs text-gray-500 mb-1'>{label}</label>
      )}
      <textarea className={clsx(inputCls, 'resize-none')} {...rest} />
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────
export function StatCard({
  label,
  value,
  sub,
  color = 'indigo',
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className='p-5'>
      <p className='text-xs text-gray-400 mb-1'>{label}</p>
      <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
      {sub && <p className='text-xs text-gray-400 mt-1'>{sub}</p>}
    </Card>
  );
}

// ── Empty state ───────────────────────────────────────────
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className='text-center py-16'>
      <p className='font-medium text-gray-900 mb-1'>{title}</p>
      <p className='text-sm text-gray-400 mb-4'>{description}</p>
      {action}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────
export function Progress({
  value,
  color = 'indigo',
}: {
  value: number;
  color?: string;
}) {
  return (
    <div className='w-full bg-gray-100 rounded-full h-1.5'>
      <div
        className={`h-1.5 rounded-full bg-${color}-500 transition-all`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}
