import React, { ReactNode, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import {
  Phone, LayoutDashboard, Megaphone, Users, List, ShieldOff, BarChart2,
  LogOut, Menu, X, Briefcase, ChevronDown, CalendarOff, Clock, Building2, Zap,
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
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'supervisor', 'agent', 'superadmin'] },
  {
    to: '/campaigns', icon: Megaphone, label: 'Campaigns', roles: ['admin', 'supervisor', 'superadmin'],
    children: [
      { to: '/schedule-templates', icon: Clock, label: 'Schedule Templates', roles: ['admin', 'supervisor', 'superadmin'] },
      { to: '/holiday-calendars', icon: CalendarOff, label: 'Holidays', roles: ['admin', 'supervisor', 'superadmin'] },
      { to: '/dnc', icon: ShieldOff, label: 'DNC', roles: ['admin', 'supervisor', 'superadmin'] },
    ],
  },
  { to: '/jobs', icon: Briefcase, label: 'Jobs', roles: ['admin', 'supervisor', 'superadmin'] },
  { to: '/contact-lists', icon: List, label: 'Contact Lists', roles: ['admin', 'supervisor', 'superadmin'] },
  { to: '/agents', icon: Users, label: 'Users', roles: ['admin', 'supervisor', 'superadmin'] },
  { to: '/reports', icon: BarChart2, label: 'Reports', roles: ['admin', 'supervisor', 'superadmin'] },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isSuperadmin, orgContext } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const visibleNav = navItems.filter((n) => {
    if (!n.roles.includes(user?.role || '')) return false;
    if (isSuperadmin && !orgContext && n.to !== '/organizations') return false;
    return true;
  });

  const handleLogout = () => { logout(); navigate('/login'); };
  const isPathActive = (to: string) => location.pathname === to || location.pathname.startsWith(to + '/');

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`;

  const NavItems = () => (
    <>
      {visibleNav.map((n) => {
        const visibleChildren = (n.children || []).filter((c) => c.roles.includes(user?.role || ''));
        const hasChildren = visibleChildren.length > 0;
        const childActive = visibleChildren.some((c) => isPathActive(c.to));
        const expanded = openGroups[n.to] ?? (isPathActive(n.to) || childActive);

        return (
          <div key={n.to}>
            <div className='flex items-center group'>
              <NavLink
                to={n.to}
                onClick={() => setMobileOpen(false)}
                end={hasChildren}
                className={({ isActive }) =>
                  clsx(
                    'flex-1 flex items-center gap-3.5 px-4 py-3 rounded-xl text-[15px] font-medium transition-all duration-150',
                    isActive || childActive
                      ? 'bg-gradient-to-r from-[#F4521E] to-[#F5A623] text-white font-semibold shadow-[0_4px_16px_rgba(244,82,30,0.45)]'
                      : 'text-[#D4A888] hover:bg-white/10 hover:text-white',
                  )
                }
              >
                <n.icon className='w-5 h-5 flex-shrink-0' />
                <span style={{ fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.01em' }}>{n.label}</span>
              </NavLink>
              {hasChildren && (
                <button
                  type='button'
                  onClick={() => setOpenGroups((g) => ({ ...g, [n.to]: !expanded }))}
                  className='ml-1 p-2 rounded-lg text-[#8A6A50] hover:text-white hover:bg-white/10 transition-colors'
                >
                  <ChevronDown className={clsx('w-4 h-4 transition-transform duration-200', expanded ? 'rotate-0' : '-rotate-90')} />
                </button>
              )}
            </div>

            {hasChildren && expanded && (
              <div className='ml-5 mt-1 pl-4 border-l-2 border-[#F4521E]/30 space-y-0.5'>
                {visibleChildren.map((c) => (
                  <NavLink
                    key={c.to}
                    to={c.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150',
                        isActive
                          ? 'text-[#F5A623] bg-[#F5A623]/10 font-semibold'
                          : 'text-[#A07860] hover:text-[#F5C89A] hover:bg-white/8',
                      )
                    }
                  >
                    <c.icon className='w-4 h-4 flex-shrink-0' />
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

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className='flex items-center gap-3.5 px-5 py-5 border-b border-white/8'>
        <div className='w-10 h-10 bg-gradient-to-br from-[#F4521E] to-[#F5A623] rounded-xl flex items-center justify-center shadow-[0_4px_14px_rgba(244,82,30,0.55)] flex-shrink-0'>
          <Zap className='w-5 h-5 text-white' fill='white' />
        </div>
        <div>
          <div className='text-[15px] font-bold text-white tracking-wide' style={{ fontFamily: 'Sora, sans-serif' }}>
            PreviewCamp
          </div>
          <div className='text-[12px] text-[#8A6A50] leading-none mt-0.5'>
            {isSuperadmin ? (orgContext ? orgContext.name : 'Platform') : user?.orgName}
          </div>
        </div>
      </div>

      {/* Nav label */}
      <div className='px-5 pt-5 pb-1'>
        <span className='text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6A4A32]'>Navigation</span>
      </div>

      {/* Nav */}
      <nav className='flex-1 px-3 py-2 space-y-0.5 overflow-y-auto'>
        <NavItems />
      </nav>

      {/* User footer */}
      <div className='p-4 border-t border-white/8'>
        <div className='flex items-center gap-3 px-3 py-3 rounded-xl bg-white/5 hover:bg-white/8 transition-colors group cursor-default'>
          <div className='w-9 h-9 bg-gradient-to-br from-[#F4521E] to-[#F5A623] rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 shadow-[0_2px_8px_rgba(244,82,30,0.4)]'>
            {initials}
          </div>
          <div className='flex-1 min-w-0'>
            <div className='text-[13px] font-semibold text-[#EED5BC] truncate'>
              {user?.firstName} {user?.lastName}
            </div>
            <div className='text-[11px] text-[#7A5C44] capitalize mt-0.5'>{user?.role}</div>
          </div>
          <button
            onClick={handleLogout}
            title='Sign out'
            className='p-1.5 rounded-lg text-[#7A5C44] hover:text-[#F4521E] hover:bg-[#F4521E]/12 transition-colors opacity-0 group-hover:opacity-100'
          >
            <LogOut className='w-4 h-4' />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className='flex h-screen overflow-hidden' style={{ background: '#FFF8F2' }}>
      {/* Sidebar — desktop: increased from 260px → 300px */}
      <aside
        className='hidden md:flex flex-col flex-shrink-0'
        style={{ width: '300px', background: '#180E00' }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className='fixed inset-0 z-50 md:hidden'>
          <div className='absolute inset-0 bg-black/60 backdrop-blur-sm' onClick={() => setMobileOpen(false)} />
          <aside
            className='absolute left-0 top-0 h-full flex flex-col'
            style={{ width: '300px', background: '#180E00' }}
          >
            <SidebarContent />
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