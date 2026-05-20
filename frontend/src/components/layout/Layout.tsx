import React, { ReactNode, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import {
  LayoutDashboard, Megaphone, Users, List, ShieldOff, BarChart2,
  LogOut, Briefcase, ChevronDown, CalendarOff, Clock, Building2, Zap,
  Settings2, Cog, Menu, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';

type NavItem = {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  roles: string[];
  children?: NavItem[];
};

const navItems: NavItem[] = [
  { to: '/organizations', icon: Building2, label: 'Organizations', roles: ['superadmin'] },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'supervisor', 'superadmin'] },
  {
    to: '/campaigns', icon: Megaphone, label: 'Campaigns', roles: ['admin', 'supervisor', 'superadmin'],
    children: [
      { to: '/schedule-templates', icon: Clock, label: 'Schedule Templates', roles: ['admin', 'supervisor', 'superadmin'] },
      { to: '/holiday-calendars', icon: CalendarOff, label: 'Holidays', roles: ['admin', 'supervisor', 'superadmin'] },
      { to: '/dnc', icon: ShieldOff, label: 'DNC', roles: ['admin', 'supervisor', 'superadmin'] },
      { to: '/dispositions', icon: Settings2, label: 'Dispositions', roles: ['admin', 'supervisor', 'superadmin'] },
    ],
  },
  { to: '/jobs', icon: Briefcase, label: 'Jobs', roles: ['admin', 'supervisor', 'superadmin'] },
  { to: '/contact-lists', icon: List, label: 'Contact Lists', roles: ['admin', 'supervisor', 'superadmin'] },
  { to: '/agents', icon: Users, label: 'Users', roles: ['admin', 'supervisor', 'superadmin'] },
  { to: '/reports', icon: BarChart2, label: 'Reports', roles: ['admin', 'supervisor', 'superadmin'] },
  { to: '/system-configuration', icon: Cog, label: 'System Configuration', roles: ['admin', 'supervisor', 'superadmin'] },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isSuperadmin, orgContext } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const handleLogout = () => { logout(); navigate('/login'); };
  const isPathActive = (to: string) => location.pathname === to || location.pathname.startsWith(to + '/');
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`;

  const visibleNav = navItems.filter((n) => {
    if (!n.roles.includes(user?.role || '')) return false;
    if (isSuperadmin && !orgContext && n.to !== '/organizations') return false;
    return true;
  });

  function NavItems({ isExpanded }: { isExpanded: boolean }) {
    return (
      <>
        {visibleNav.map((n) => {
          const visibleChildren = (n.children || []).filter((c) => c.roles.includes(user?.role || ''));
          const hasChildren = visibleChildren.length > 0;
          const childActive = visibleChildren.some((c) => isPathActive(c.to));
          const groupOpen = openGroups[n.to] ?? (isPathActive(n.to) || childActive);

          const linkEl = (
            <NavLink
              to={n.to}
              end={hasChildren}
              onClick={() => setMobileOpen(false)}
              title={!isExpanded ? n.label : undefined}
              className={({ isActive: active }) =>
                clsx(
                  'flex items-center rounded-xl transition-all duration-150',
                  isExpanded ? 'gap-3 px-3 py-2.5 w-full' : 'justify-center w-10 h-10',
                  active || childActive
                    ? 'bg-gradient-to-r from-[#F4521E] to-[#F5A623] text-white shadow-[0_4px_16px_rgba(244,82,30,0.4)]'
                    : 'text-[#C4956A] hover:bg-white/10 hover:text-white',
                )
              }
            >
              <n.icon className='w-5 h-5 flex-shrink-0' />
              {isExpanded && (
                <span className='text-[14px] font-medium truncate flex-1' style={{ fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.01em' }}>
                  {n.label}
                </span>
              )}
            </NavLink>
          );

          return (
            <div key={n.to}>
              <div className={clsx('flex items-center', isExpanded ? 'gap-1' : 'justify-center')}>
                {linkEl}
                {hasChildren && isExpanded && (
                  <button
                    type='button'
                    onClick={() => setOpenGroups((g) => ({ ...g, [n.to]: !groupOpen }))}
                    className='p-1.5 rounded-lg text-[#8A6A50] hover:text-white hover:bg-white/10 transition-colors flex-shrink-0'
                  >
                    <ChevronDown className={clsx('w-4 h-4 transition-transform duration-200', groupOpen ? 'rotate-0' : '-rotate-90')} />
                  </button>
                )}
              </div>

              {hasChildren && isExpanded && groupOpen && (
                <div className='ml-4 mt-0.5 pl-3.5 border-l-2 border-[#F4521E]/25 space-y-0.5'>
                  {visibleChildren.map((c) => (
                    <NavLink
                      key={c.to}
                      to={c.to}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        clsx(
                          'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                          isActive
                            ? 'text-[#F5A623] bg-[#F5A623]/10 font-semibold'
                            : 'text-[#906040] hover:text-[#F5C89A] hover:bg-white/6',
                        )
                      }
                    >
                      <c.icon className='w-3.5 h-3.5 flex-shrink-0' />
                      {c.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  }

  function SidebarContent({ isExpanded }: { isExpanded: boolean }) {
    return (
      <div className='flex flex-col h-full'>

        {/* Header row: Logo + toggle button */}
        <div className={clsx(
          'flex items-center gap-2 border-b border-white/8 flex-shrink-0 px-3 py-4',
          isExpanded ? 'justify-between' : 'justify-center flex-col',
        )}>
          {/* Logo */}
          <div className='flex items-center gap-3 min-w-0'>
            <div className='w-9 h-9 bg-gradient-to-br from-[#F4521E] to-[#F5A623] rounded-xl flex items-center justify-center shadow-[0_4px_14px_rgba(244,82,30,0.55)] flex-shrink-0'>
              <Zap className='w-[18px] h-[18px] text-white' fill='white' />
            </div>
            {isExpanded && (
              <div className='overflow-hidden'>
                <div className='text-[15px] font-bold text-white tracking-wide leading-tight' style={{ fontFamily: 'Sora, sans-serif' }}>
                  PreviewCamp
                </div>
                <div className='text-[11px] text-[#7A5C44] leading-none mt-0.5'>
                  {isSuperadmin ? (orgContext ? orgContext.name : 'Platform') : user?.orgName}
                </div>
              </div>
            )}
          </div>

          {/* Toggle arrow */}
          <button
            onClick={() => setExpanded((v) => !v)}
            title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className='flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-[#6A4A30] hover:text-white hover:bg-white/10 transition-colors'
          >
            {isExpanded
              ? <PanelLeftClose className='w-[17px] h-[17px]' />
              : <PanelLeftOpen className='w-[17px] h-[17px]' />
            }
          </button>
        </div>

        {/* Nav label */}
        {isExpanded && (
          <div className='px-4 pt-4 pb-1 flex-shrink-0'>
            <span className='text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5A3A22]'>Navigation</span>
          </div>
        )}

        {/* Nav */}
        <nav className={clsx(
          'flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-0.5',
          isExpanded ? 'px-2' : 'px-2 flex flex-col items-center',
        )}>
          <NavItems isExpanded={isExpanded} />
        </nav>

        {/* User footer */}
        <div className={clsx('flex-shrink-0 p-3 border-t border-white/8', !isExpanded && 'flex justify-center')}>
          {isExpanded ? (
            <div className='flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/8 transition-colors group cursor-default'>
              <div className='w-8 h-8 bg-gradient-to-br from-[#F4521E] to-[#F5A623] rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0'>
                {initials}
              </div>
              <div className='flex-1 min-w-0'>
                <div className='text-[13px] font-semibold text-[#EED5BC] truncate'>{user?.firstName} {user?.lastName}</div>
                <div className='text-[11px] text-[#6A4A30] capitalize mt-0.5'>{user?.role}</div>
              </div>
              <button onClick={handleLogout} title='Sign out'
                className='p-1.5 rounded-lg text-[#7A5C44] hover:text-[#F4521E] hover:bg-[#F4521E]/12 transition-colors opacity-0 group-hover:opacity-100'>
                <LogOut className='w-4 h-4' />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              title={`Sign out — ${user?.firstName} ${user?.lastName}`}
              className='w-9 h-9 bg-gradient-to-br from-[#F4521E] to-[#F5A623] rounded-full flex items-center justify-center text-xs font-bold text-white hover:brightness-110 transition'
            >
              {initials}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className='flex h-screen overflow-hidden' style={{ background: '#FFF8F2' }}>

      {/* Desktop sidebar — part of normal flow, pushes content right */}
      <aside
        className='hidden md:flex flex-col flex-shrink-0 overflow-hidden'
        style={{
          width: expanded ? '260px' : '64px',
          minWidth: expanded ? '260px' : '64px',
          background: '#180E00',
          transition: 'width 0.25s ease, min-width 0.25s ease',
        }}
      >
        <SidebarContent isExpanded={expanded} />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className='fixed inset-0 z-50 md:hidden'>
          <div className='absolute inset-0 bg-black/60 backdrop-blur-sm' onClick={() => setMobileOpen(false)} />
          <aside className='absolute left-0 top-0 h-full flex flex-col' style={{ width: '260px', background: '#180E00' }}>
            <SidebarContent isExpanded={true} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className='flex-1 flex flex-col overflow-hidden min-w-0'>

        {/* Mobile top bar */}
        <div className='md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-[#FFE0C8]'>
          <button onClick={() => setMobileOpen(true)} className='p-2 rounded-xl hover:bg-orange-50'>
            <Menu className='w-5 h-5 text-[#5C4030]' />
          </button>
          <span className='font-bold text-[#1A0F00] text-sm' style={{ fontFamily: 'Sora, sans-serif' }}>PreviewCamp</span>
          <div className='w-9 h-9 bg-gradient-to-br from-[#F4521E] to-[#F5A623] rounded-full flex items-center justify-center text-xs font-bold text-white'>
            {initials}
          </div>
        </div>

        <main className='flex-1 overflow-y-auto'>{children}</main>
      </div>
    </div>
  );
}