import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { ChevronDown, Filter, Loader2, Search, X } from 'lucide-react';

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
      'bg-white rounded-2xl border border-[#FFD0B0] shadow-[0_2px_20px_rgba(244,82,30,0.08)] overflow-hidden',
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
    <div className='flex items-center justify-between px-6 py-4' style={{ borderBottom: '2px solid #FFE0C8', background: 'linear-gradient(135deg, #FFFAF7 0%, #FFF4EE 100%)' }}>
      <div>
        <h3 className='font-semibold text-[#1A0F00] text-sm' style={{ fontFamily: 'Sora, sans-serif' }}>
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
  gray: 'bg-stone-100 text-stone-600',
  green: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  red: 'bg-red-50 text-red-700 border border-red-100',
  yellow: 'bg-amber-50 text-amber-700 border border-amber-100',
  blue: 'bg-sky-50 text-sky-700 border border-sky-100',
  indigo: 'bg-violet-50 text-violet-700 border border-violet-100',
  orange: 'bg-orange-50 text-[#F4521E] border border-orange-100',
  purple: 'bg-purple-50 text-purple-700 border border-purple-100',
};
export function Badge({ label, color = 'gray', children }: { label?: string; color?: BadgeColor; children?: React.ReactNode }) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      badgeColors[color],
    )}>
      {children ?? label}
    </span>
  );
}

const statusColors: Record<string, BadgeColor> = {
  draft: 'gray', preparing: 'yellow', active: 'green', completed: 'blue', stopped: 'red',
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
interface Col<T> { header: string; key?: keyof T; render?: (row: T, idx?: number) => ReactNode; width?: string; }
interface TableProps<T> { cols: Col<T>[]; rows: T[]; keyFn: (row: T) => string; onRowClick?: (row: T) => void; emptyMessage?: string; }
export function Table<T>({ cols, rows, keyFn, onRowClick, emptyMessage = 'No data' }: TableProps<T>) {
  return (
    <div className='w-full overflow-x-auto'>
      <table className='w-full text-sm border-collapse'>
        <thead>
          <tr style={{ background: 'linear-gradient(135deg, #FFF4EE 0%, #FFE8D6 100%)' }}>
            {cols.map((c, i) => (
              <th
                key={c.header}
                style={{
                  width: c.width,
                  fontFamily: 'Sora, sans-serif',
                  borderBottom: '2px solid #FFD0B0',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                }}
                className='text-left text-xs font-bold text-[#7A3A10] uppercase tracking-widest px-5 py-4'
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} className='text-center text-[#7A5C44] py-16 text-sm'>
                {emptyMessage}
              </td>
            </tr>
          )}
          {rows.map((row, rowIdx) => (
            <tr
              key={keyFn(row)}
              onClick={() => onRowClick?.(row)}
              className={clsx(
                'transition-all duration-150 group',
                onRowClick ? 'cursor-pointer' : '',
              )}
              style={{ borderBottom: rowIdx < rows.length - 1 ? '1px solid #FFE8D6' : 'none' }}
              onMouseEnter={e => {
                if (onRowClick) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(90deg, #FFF8F4, #FFFAF7)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = '';
              }}
            >
              {cols.map((c) => (
                <td key={c.header} className='px-5 py-4 text-[#1A0F00] align-middle'>
                  {c.render ? c.render(row, rowIdx) : c.key ? String(row[c.key] ?? '—') : ''}
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
export function Modal({ title, open, onClose, children, size = 'md' }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-5xl' };
  return createPortal(
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A0F00]/50 backdrop-blur-sm'
      onClick={onClose}>
      <div
        className={clsx('bg-white shadow-2xl w-full border border-[#FFE0C8] flex flex-col max-h-[90vh]', widths[size])}
        style={{ borderRadius: '16px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className='flex items-center justify-between px-6 py-4 border-b border-[#FFE8D6] shrink-0'
          style={{ background: 'linear-gradient(135deg, #FFF4EE 0%, #FFE8D2 100%)', borderRadius: '16px 16px 0 0' }}
        >
          <h3 className='font-bold text-[#1A0F00]' style={{ fontFamily: 'Sora, sans-serif' }}>{title}</h3>
          <button onClick={onClose}
            className='p-1.5 rounded-xl hover:bg-white/60 text-[#7A5C44] hover:text-[#F4521E] transition-colors'>
            <X className='w-4 h-4' />
          </button>
        </div>
        <div className='p-6 overflow-y-auto' style={{ borderRadius: '0 0 16px 16px' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Input / Select / Textarea ─────────────────────────────────────────────
const inputCls =
  'w-full border-2 border-[#FFD0B0] rounded-xl px-3.5 py-2.5 text-sm bg-white text-[#1A0F00] placeholder-[#B89070] focus:outline-none focus:ring-4 focus:ring-[#F4521E]/40 focus:border-[#F4521E] hover:border-[#FFB890] transition-all disabled:bg-[#FFF4EE] disabled:text-[#7A5C44]';

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
const statCardColors: Record<string, { gradient: string; tint: string; border: string; textColor: string }> = {
  gray: { gradient: 'linear-gradient(135deg,#6B7280,#4B5563)', tint: 'linear-gradient(135deg,#F9FAFB,#F3F4F6)', border: '#E5E7EB', textColor: '#374151' },
  green: { gradient: 'linear-gradient(135deg,#10B981,#059669)', tint: 'linear-gradient(135deg,#ECFDF5,#D1FAE5)', border: '#A7F3D0', textColor: '#065F46' },
  blue: { gradient: 'linear-gradient(135deg,#3B82F6,#1D4ED8)', tint: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)', border: '#BFDBFE', textColor: '#1E40AF' },
  indigo: { gradient: 'linear-gradient(135deg,#8B5CF6,#7C3AED)', tint: 'linear-gradient(135deg,#F5F3FF,#EDE9FE)', border: '#DDD6FE', textColor: '#5B21B6' },
  red: { gradient: 'linear-gradient(135deg,#EF4444,#DC2626)', tint: 'linear-gradient(135deg,#FEF2F2,#FEE2E2)', border: '#FECACA', textColor: '#991B1B' },
  orange: { gradient: 'linear-gradient(135deg,#E8470A,#F59E0B)', tint: 'linear-gradient(135deg,#FFF4EE,#FFE6D2)', border: '#FFD3B5', textColor: '#C43A06' },
  amber: { gradient: 'linear-gradient(135deg,#F59E0B,#D97706)', tint: 'linear-gradient(135deg,#FFFBEB,#FEF3C7)', border: '#FDE68A', textColor: '#92400E' },
  cyan: { gradient: 'linear-gradient(135deg,#06B6D4,#0891B2)', tint: 'linear-gradient(135deg,#ECFEFF,#CFFAFE)', border: '#A5F3FC', textColor: '#164E63' },
  purple: { gradient: 'linear-gradient(135deg,#A855F7,#7C3AED)', tint: 'linear-gradient(135deg,#F5F3FF,#EDE9FE)', border: '#DDD6FE', textColor: '#5B21B6' },
};

export function StatCard({
  label, value, sub,
  color,
  gradient, tint, border, textColor,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  gradient?: string;
  tint?: string;
  border?: string;
  textColor?: string;
  icon?: React.ElementType;
}) {
  const resolved = (gradient && tint && border && textColor)
    ? { gradient, tint, border, textColor }
    : color && statCardColors[color]
      ? statCardColors[color]
      : null;

  if (resolved) {
    return (
      <div
        className='rounded-2xl px-4 py-3.5 flex items-center gap-3 border'
        style={{ background: resolved.tint, borderColor: resolved.border }}
      >
        {Icon && (
          <div className='w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0'
            style={{ background: resolved.gradient }}>
            <Icon className='w-4 h-4 text-white' />
          </div>
        )}
        <div className='min-w-0'>
          <p className='text-xs font-semibold uppercase tracking-wide mb-0.5' style={{ color: resolved.textColor, opacity: 0.7 }}>{label}</p>
          <p className='text-xl font-bold leading-tight' style={{ color: resolved.textColor, fontFamily: 'Sora, sans-serif' }}>{value}</p>
          {sub && <p className='text-xs mt-0.5' style={{ color: resolved.textColor, opacity: 0.6 }}>{sub}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className='rounded-2xl px-4 py-3.5 border border-[#FFD3B5]'
      style={{ background: 'linear-gradient(135deg,#FFF4EE,#FFE6D2)' }}>
      <p className='text-xs font-semibold uppercase tracking-wide text-[#C43A06]/70 mb-0.5'>{label}</p>
      <p className='text-xl font-bold text-[#C43A06]' style={{ fontFamily: 'Sora, sans-serif' }}>{value}</p>
      {sub && <p className='text-xs text-[#C43A06]/60 mt-0.5'>{sub}</p>}
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className='text-center py-16'>
      <div className='w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4'
        style={{ background: 'linear-gradient(135deg, #FFF0E5, #FFE0C8)', border: '1.5px solid #FFD0B0' }}>
        <span className='text-2xl'>📭</span>
      </div>
      <p className='font-semibold text-[#1A0F00] mb-1' style={{ fontFamily: 'Sora, sans-serif' }}>{title}</p>
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

// ── Search input ─────────────────────────────────────────────────────────
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={clsx('relative flex-1 min-w-[200px] max-w-sm', className)}>
      <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none' style={{ color: '#F4521E' }} />
      <input
        type='text'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className='w-full pl-9 pr-9 py-2.5 text-sm rounded-xl focus:outline-none transition placeholder:text-[#C09070]'
        style={{
          border: '2px solid #FFD0B0',
          background: 'linear-gradient(135deg, #FFFAF7, #FFF4EE)',
          color: '#1A0F00',
          boxShadow: '0 1px 4px rgba(244,82,30,0.08)',
        }}
        onFocus={e => {
          e.currentTarget.style.borderColor = '#F4521E';
          e.currentTarget.style.boxShadow = '0 0 0 4px rgba(244,82,30,0.18)';
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = '#FFD0B0';
          e.currentTarget.style.boxShadow = '0 1px 4px rgba(244,82,30,0.08)';
        }}
      />
      {value && (
        <button
          type='button'
          onClick={() => onChange('')}
          className='absolute right-3 top-1/2 -translate-y-1/2 text-[#C09070] hover:text-[#F4521E] transition'
        >
          <X className='w-3.5 h-3.5' />
        </button>
      )}
    </div>
  );
}

// ── Filter dropdown ──────────────────────────────────────────────────────
type FilterColor = 'indigo' | 'amber' | 'green' | 'red' | 'orange' | 'purple';
const filterColorMap: Record<FilterColor, { active: string; dot: string }> = {
  indigo: { active: 'text-indigo-700', dot: '#6366F1' },
  amber: { active: 'text-amber-700', dot: '#D97706' },
  green: { active: 'text-green-700', dot: '#10B981' },
  red: { active: 'text-red-700', dot: '#EF4444' },
  orange: { active: 'text-[#F4521E]', dot: '#F4521E' },
  purple: { active: 'text-purple-700', dot: '#A855F7' },
};

export function FilterDropdown({
  label,
  options,
  value,
  onChange,
  color = 'indigo',
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  color?: FilterColor;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const isActive = !!value;
  const cm = filterColorMap[color];

  return (
    <div ref={ref} className='relative'>
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
          isActive ? cm.active : 'text-[#6A3A1A]',
        )}
        style={isActive
          ? { background: 'linear-gradient(135deg, #FFF4EE, #FFE6D2)', border: '2px solid #FFB87A', boxShadow: '0 2px 8px rgba(244,82,30,0.15)' }
          : { background: 'linear-gradient(135deg, #FFFAF7, #FFF4EE)', border: '2px solid #FFD0B0', boxShadow: '0 1px 4px rgba(244,82,30,0.06)' }
        }
      >
        <Filter className='w-3.5 h-3.5' style={{ color: isActive ? cm.dot : '#C09070' }} />
        <span>{isActive ? selected?.label : label}</span>
        {isActive ? (
          <span
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className='ml-0.5 hover:opacity-70'
          >
            <X className='w-3 h-3' />
          </span>
        ) : (
          <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} style={{ color: '#C09070' }} />
        )}
      </button>

      {open && (
        <div className='absolute top-full left-0 mt-1.5 w-52 rounded-2xl z-20 overflow-hidden'
          style={{ background: 'white', border: '1.5px solid #FFD0B0', boxShadow: '0 8px 32px rgba(244,82,30,0.14), 0 2px 8px rgba(0,0,0,0.06)' }}>
          <div className='p-1.5 max-h-72 overflow-y-auto'>
            <button
              type='button'
              onClick={() => { onChange(''); setOpen(false); }}
              className='w-full text-left px-3 py-2 text-sm text-[#9A6A50] hover:bg-[#FFF4EE] rounded-xl transition'
            >
              All {label.toLowerCase()}
            </button>
            {options.map((opt) => (
              <button
                key={opt.value}
                type='button'
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className='w-full text-left px-3 py-2 text-sm rounded-xl transition flex items-center justify-between'
                style={value === opt.value
                  ? { background: 'linear-gradient(135deg, #FFF0E5, #FFE4D0)', color: '#F4521E', fontWeight: 600 }
                  : { color: '#1A0F00' }
                }
                onMouseEnter={e => { if (value !== opt.value) (e.currentTarget as HTMLElement).style.background = '#FFF8F4'; }}
                onMouseLeave={e => { if (value !== opt.value) (e.currentTarget as HTMLElement).style.background = ''; }}
              >
                <span className='truncate'>{opt.label}</span>
                {value === opt.value && (
                  <span className='w-1.5 h-1.5 rounded-full shrink-0 ml-2' style={{ background: '#F4521E' }} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Active filter pill ───────────────────────────────────────────────────
export function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold'
      style={{ background: 'linear-gradient(135deg, #FFF0E5, #FFE4D0)', border: '1.5px solid #FFB87A', color: '#E8470A' }}>
      {label}
      <button type='button' onClick={onRemove} className='hover:opacity-70 transition'>
        <X className='w-3 h-3' />
      </button>
    </span>
  );
}

// ── Clear-all-filters button ─────────────────────────────────────────────
export function ClearFiltersButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all duration-200'
      style={{ color: '#7A5C44', border: '1.5px solid #FFD0B0', background: 'white' }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.color = '#EF4444';
        (e.currentTarget as HTMLElement).style.background = '#FEF2F2';
        (e.currentTarget as HTMLElement).style.borderColor = '#FECACA';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.color = '#7A5C44';
        (e.currentTarget as HTMLElement).style.background = 'white';
        (e.currentTarget as HTMLElement).style.borderColor = '#FFD0B0';
      }}
    >
      <X className='w-3.5 h-3.5' />
      Clear all
    </button>
  );
}
// ── Pagination ────────────────────────────────────────────────────────────────
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const;
export type PageSizeOption = typeof PAGE_SIZE_OPTIONS[number];

export function usePagination<T>(items: T[], defaultPageSize: PageSizeOption = 10) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<PageSizeOption>(defaultPageSize);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  const goTo = (p: number) => setPage(Math.max(1, Math.min(p, totalPages)));
  const changePageSize = (ps: PageSizeOption) => { setPageSize(ps); setPage(1); };

  React.useEffect(() => { setPage(1); }, [items.length]);

  return { page: safePage, pageSize, totalPages, pageItems, goTo, changePageSize, totalItems: items.length };
}

// Rows-per-page dropdown (self-contained)
function PageSizeDropdown({ value, onChange }: { value: PageSizeOption; onChange: (ps: PageSizeOption) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className='relative'>
      <button
        type='button'
        onClick={() => setOpen(o => !o)}
        className='flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 select-none'
        style={{ background: 'white', border: '1.5px solid #FFD0B0', color: '#5C4030', minWidth: '64px', justifyContent: 'space-between' }}
      >
        <span>{value}</span>
        <ChevronDown className={clsx('w-3 h-3 transition-transform', open && 'rotate-180')} style={{ color: '#C09070' }} />
      </button>

      {open && (
        <div
          className='absolute bottom-full mb-1.5 right-0 rounded-xl overflow-hidden z-30'
          style={{ background: 'white', border: '1.5px solid #FFD0B0', boxShadow: '0 6px 24px rgba(244,82,30,0.12), 0 2px 8px rgba(0,0,0,0.06)', minWidth: '72px' }}
        >
          {PAGE_SIZE_OPTIONS.map((ps) => (
            <button
              key={ps}
              type='button'
              onClick={() => { onChange(ps); setOpen(false); }}
              className='w-full text-left px-3 py-2 text-xs font-medium transition-all'
              style={ps === value
                ? { background: 'linear-gradient(135deg, #FFF0E5, #FFE4D0)', color: '#F4521E', fontWeight: 700 }
                : { color: '#3C2A1A' }
              }
              onMouseEnter={e => { if (ps !== value) (e.currentTarget as HTMLElement).style.background = '#FFF8F4'; }}
              onMouseLeave={e => { if (ps !== value) (e.currentTarget as HTMLElement).style.background = ''; }}
            >
              {ps}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: PageSizeOption;
  onPageChange: (p: number) => void;
  onPageSizeChange: (ps: PageSizeOption) => void;
}) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  const getPages = (): (number | '...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  const navBtn = (disabled: boolean) => ({
    background: disabled ? '#FFF4EE' : 'white',
    color: disabled ? '#D4A890' : '#7A5C44',
    border: '1.5px solid #FFE0C8',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  } as React.CSSProperties);

  const pageBtn = (active: boolean) => ({
    background: active ? '#FFF0E8' : 'white',
    color: active ? '#D85A20' : '#7A5C44',
    border: active ? '1.5px solid #FFBB90' : '1.5px solid #FFE0C8',
    fontWeight: active ? 700 : 500,
  } as React.CSSProperties);

  const btnCls = 'min-w-[30px] h-7 px-1.5 flex items-center justify-center rounded-lg text-xs transition-all duration-150 select-none';

  return (
    <div
      className='flex items-center justify-end px-5 py-2.5 gap-4 flex-wrap'
      style={{ borderTop: '1px solid #FFE8D6', background: 'linear-gradient(135deg, #FFFAF7, #FFF4EE)' }}
    >
      {/* Count */}
      {totalItems > 0 && (
        <span className='text-xs text-[#9A6A50] whitespace-nowrap'>
          {start}–{end} of {totalItems}
        </span>
      )}

      {/* Page numbers */}
      <div className='flex items-center gap-1'>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className={btnCls} style={navBtn(page === 1)}>‹</button>

        {getPages().map((p, idx) =>
          p === '...' ? (
            <span key={`el-${idx}`} className='min-w-[28px] h-7 flex items-center justify-center text-xs text-[#C09070]'>…</span>
          ) : (
            <button key={p} onClick={() => onPageChange(p)} className={btnCls} style={pageBtn(p === page)}>{p}</button>
          )
        )}

        <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className={btnCls} style={navBtn(page === totalPages)}>›</button>
      </div>

      {/* Rows-per-page dropdown — rightmost */}
      <div className='flex items-center gap-2'>
        <span className='text-xs text-[#9A6A50] whitespace-nowrap'>Rows per page</span>
        <PageSizeDropdown value={pageSize} onChange={onPageSizeChange} />
      </div>
    </div>
  );
}

// ── Table with built-in pagination & scrollable body ─────────────────────────
interface PagedTableProps<T> {
  cols: Col<T>[];
  rows: T[];
  keyFn: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  maxHeight?: string;
}

export function PagedTable<T>({ cols, rows, keyFn, onRowClick, emptyMessage = 'No data', maxHeight = '650px' }: PagedTableProps<T>) {
  const { page, pageSize, totalPages, pageItems, goTo, changePageSize, totalItems } = usePagination(rows);

  return (
    <div className='flex flex-col'>
      {/* Scrollable table area */}
      <div style={{ maxHeight, overflowY: 'auto', overflowX: 'auto' }}>
        <table className='w-full text-sm border-collapse'>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr style={{ background: 'linear-gradient(135deg, #FFF4EE 0%, #FFE8D6 100%)' }}>
              {cols.map((c) => (
                <th
                  key={c.header}
                  style={{
                    width: c.width,
                    fontFamily: 'Sora, sans-serif',
                    borderBottom: '2px solid #FFD0B0',
                    borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                  }}
                  className='text-left text-xs font-bold text-[#7A3A10] uppercase tracking-widest px-5 py-4'
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className='text-center text-[#7A5C44] py-16 text-sm'>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageItems.map((row, rowIdx) => (
                <tr
                  key={keyFn(row)}
                  onClick={() => onRowClick?.(row)}
                  className={clsx('transition-all duration-150', onRowClick ? 'cursor-pointer' : '')}
                  style={{ borderBottom: rowIdx < pageItems.length - 1 ? '1px solid #FFE8D6' : 'none' }}
                  onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLElement).style.background = 'linear-gradient(90deg, #FFF8F4, #FFFAF7)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
                >
                  {cols.map((c) => (
                    <td key={c.header} className='px-5 py-4 text-[#1A0F00] align-middle'>
                      {c.render ? c.render(row, rowIdx) : c.key ? String(row[c.key] ?? '—') : ''}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination bar */}
      {totalItems > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={goTo}
          onPageSizeChange={changePageSize}
        />
      )}
    </div>
  );
}
