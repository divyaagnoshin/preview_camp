import React, { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { Loader2, X } from 'lucide-react';

// ── Button ─────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'amber';
type BtnSize = 'sm' | 'md' | 'lg';

const btnVariants: Record<BtnVariant, string> = {
  primary:
    'bg-gradient-to-r from-[#F4521E] to-[#F5A623] text-white shadow-[0_4px_14px_rgba(244,82,30,0.35)] hover:shadow-[0_4px_20px_rgba(244,82,30,0.5)] hover:brightness-105 active:brightness-95',
  amber:
    'bg-gradient-to-r from-[#F5A623] to-[#F4521E] text-white shadow-[0_4px_14px_rgba(245,166,35,0.35)] hover:brightness-105',
  secondary:
    'bg-white text-[#1A0F00] border border-[#FFD0B0] hover:border-[#F4521E] hover:text-[#F4521E] hover:bg-orange-50',
  danger:
    'bg-red-600 hover:bg-red-700 text-white shadow-sm',
  ghost:
    'hover:bg-orange-50 text-[#5C4030] hover:text-[#F4521E]',
  success:
    'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
};

const btnSizes: Record<BtnSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
  icon?: ReactNode;
}
export function Button({
  variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
        'font-["DM_Sans"]',
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

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx(
      'bg-white rounded-2xl border border-[#FFE0C8] shadow-[0_2px_16px_rgba(244,82,30,0.06)]',
      className,
    )}>
      {children}
    </div>
  );
}
export function CardHeader({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className='flex items-center justify-between px-6 py-4 border-b border-[#FFE8D6]'>
      <div>
        <h3 className='font-semibold text-[#1A0F00] text-sm' style={{ fontFamily: 'Syne, sans-serif' }}>
          {title}
        </h3>
        {subtitle && <p className='text-xs text-[#7A5C44] mt-0.5'>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Badge ───────────────────────────────────────────────────────────────────
type BadgeColor = 'gray' | 'green' | 'red' | 'yellow' | 'blue' | 'indigo' | 'orange' | 'purple';
const badgeColors: Record<BadgeColor, string> = {
  gray:   'bg-stone-100 text-stone-600',
  green:  'bg-emerald-50 text-emerald-700 border border-emerald-100',
  red:    'bg-red-50 text-red-700 border border-red-100',
  yellow: 'bg-amber-50 text-amber-700 border border-amber-100',
  blue:   'bg-sky-50 text-sky-700 border border-sky-100',
  indigo: 'bg-violet-50 text-violet-700 border border-violet-100',
  orange: 'bg-orange-50 text-[#F4521E] border border-orange-100',
  purple: 'bg-purple-50 text-purple-700 border border-purple-100',
};
export function Badge({ label, color = 'gray' }: { label: string; color?: BadgeColor }) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      badgeColors[color],
    )}>
      {label}
    </span>
  );
}

const statusColors: Record<string, BadgeColor> = {
  draft: 'gray', active: 'green', completed: 'blue', stopped: 'red',
  inactive: 'red', queued: 'yellow', with_agent: 'indigo', exhausted: 'orange',
  dnc: 'red', available: 'green', offline: 'gray', processing: 'yellow',
  done: 'green', CLOSED: 'blue', NEXT_ATTEMPT: 'yellow', RESCHEDULE: 'purple',
  finite: 'gray', infinite: 'purple',
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge label={status.replace('_', ' ')} color={statusColors[status] || 'gray'} />;
}

// ── Spinner / Loader ────────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin text-[#F4521E]', className || 'w-6 h-6')} />;
}
export function PageLoader() {
  return (
    <div className='flex flex-col items-center justify-center h-64 gap-3'>
      <div className='w-10 h-10 rounded-full border-4 border-[#FFE0C8] border-t-[#F4521E] animate-spin' />
      <span className='text-xs text-[#7A5C44]'>Loading…</span>
    </div>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────
interface Col<T> { header: string; key?: keyof T; render?: (row: T) => ReactNode; width?: string; }
interface TableProps<T> { cols: Col<T>[]; rows: T[]; keyFn: (row: T) => string; onRowClick?: (row: T) => void; emptyMessage?: string; }
export function Table<T>({ cols, rows, keyFn, onRowClick, emptyMessage = 'No data' }: TableProps<T>) {
  return (
    <div className='overflow-x-auto'>
      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b border-[#FFE8D6] bg-[#FFF4EE]'>
            {cols.map((c) => (
              <th key={c.header} style={{ width: c.width }}
                className='text-left text-xs font-semibold text-[#7A5C44] uppercase tracking-wider px-5 py-3'
                style={{ fontFamily: 'Syne, sans-serif', width: c.width }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} className='text-center text-[#7A5C44] py-14 text-sm'>
                {emptyMessage}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={keyFn(row)} onClick={() => onRowClick?.(row)}
              className={clsx(
                'border-b border-[#FFF0E8] transition-colors duration-150',
                onRowClick ? 'cursor-pointer hover:bg-[#FFF4EE]' : 'hover:bg-[#FFFAF7]',
              )}>
              {cols.map((c) => (
                <td key={c.header} className='px-5 py-3.5 text-[#1A0F00]'>
                  {c.render ? c.render(row) : c.key ? String(row[c.key] ?? '—') : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────
// Portals to document.body so `position: fixed` is anchored to the viewport
// even when the page wrapper sits inside a transformed ancestor (e.g. the
// `.animate-fade-up` class on every page applies a translate that turns
// fixed-positioned children into wrapper-relative children).
export function Modal({ title, open, onClose, children, size = 'md' }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-5xl' };
  return createPortal(
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A0F00]/50 backdrop-blur-sm'
      onClick={onClose}>
      <div className={clsx('bg-white rounded-2xl shadow-2xl w-full border border-[#FFE0C8]', widths[size])}
        onClick={(e) => e.stopPropagation()}>
        <div className='flex items-center justify-between px-6 py-4 border-b border-[#FFE8D6]'>
          <h3 className='font-bold text-[#1A0F00]' style={{ fontFamily: 'Syne, sans-serif' }}>{title}</h3>
          <button onClick={onClose}
            className='p-1.5 rounded-xl hover:bg-orange-50 text-[#7A5C44] hover:text-[#F4521E] transition-colors'>
            <X className='w-4 h-4' />
          </button>
        </div>
        <div className='p-6'>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ── Input / Select / Textarea ─────────────────────────────────────────────
const inputCls =
  'w-full border border-[#FFD0B0] rounded-xl px-3.5 py-2.5 text-sm bg-white text-[#1A0F00] placeholder-[#B89070] focus:outline-none focus:ring-2 focus:ring-[#F4521E]/30 focus:border-[#F4521E] transition-all disabled:bg-[#FFF4EE] disabled:text-[#7A5C44]';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  const { label, error, ...rest } = props;
  return (
    <div>
      {label && <label className='block text-xs font-medium text-[#5C4030] mb-1.5'>{label}</label>}
      <input className={clsx(inputCls, error && 'border-red-400 focus:ring-red-200')} {...rest} />
      {error && <p className='text-xs text-red-500 mt-1'>{error}</p>}
    </div>
  );
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; options: { value: string; label: string }[] }) {
  const { label, options, ...rest } = props;
  return (
    <div>
      {label && <label className='block text-xs font-medium text-[#5C4030] mb-1.5'>{label}</label>}
      <select className={inputCls} {...rest}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const { label, ...rest } = props;
  return (
    <div>
      {label && <label className='block text-xs font-medium text-[#5C4030] mb-1.5'>{label}</label>}
      <textarea className={clsx(inputCls, 'resize-none')} {...rest} />
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className='p-5'>
      <p className='text-xs text-[#7A5C44] mb-1 font-medium'>{label}</p>
      <p className='text-2xl font-bold text-[#F4521E]' style={{ fontFamily: 'Syne, sans-serif' }}>{value}</p>
      {sub && <p className='text-xs text-[#7A5C44] mt-1'>{sub}</p>}
    </Card>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className='text-center py-16'>
      <div className='w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-4'>
        <span className='text-2xl'>📭</span>
      </div>
      <p className='font-semibold text-[#1A0F00] mb-1' style={{ fontFamily: 'Syne, sans-serif' }}>{title}</p>
      <p className='text-sm text-[#7A5C44] mb-5'>{description}</p>
      {action}
    </div>
  );
}

// ── Progress bar ─────────────────────────────────────────────────────────
export function Progress({ value }: { value: number; color?: string }) {
  return (
    <div className='w-full bg-[#FFE8D6] rounded-full h-2'>
      <div
        className='h-2 rounded-full bg-gradient-to-r from-[#F4521E] to-[#F5A623] transition-all'
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}
