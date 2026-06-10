import React, { ReactNode, useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { io } from 'socket.io-client';
import { useAuth } from '../../hooks/useAuth';
import {
  LayoutDashboard,
  Megaphone,
  Users,
  List,
  ShieldOff,
  BarChart2,
  LogOut,
  Briefcase,
  ChevronDown,
  CalendarOff,
  Clock,
  Building2,
  Zap,
  Settings2,
  Cog,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserCog,
  UserCheck,
  Map,
  UsersRound,
  Cloud,
  ClipboardList,
  FileText,
} from 'lucide-react';

type NavItem = {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  roles: string[];
  children?: NavItem[];
};

const navItems: NavItem[] = [
  {
    to: '/organizations',
    icon: Building2,
    label: 'Organizations',
    roles: ['superadmin'],
  },
  {
    to: '/dashboard-group',
    icon: LayoutDashboard,
    label: 'Dashboard',
    roles: ['admin', 'supervisor', 'superadmin'],
    children: [
      {
        to: '/dashboard',
        icon: LayoutDashboard,
        label: 'Overview',
        roles: ['admin', 'supervisor', 'superadmin'],
      },
      {
        to: '/reports/active-campaigns',
        icon: BarChart2,
        label: 'Active Campaigns',
        roles: ['admin', 'supervisor', 'superadmin'],
      },
      {
        to: '/reports/staffed-agents',
        icon: Users,
        label: 'Staffed Agents (Live)',
        roles: ['admin', 'supervisor', 'superadmin'],
      },
    ],
  },
  {
    to: '/campaigns-group',
    icon: Megaphone,
    label: 'Campaign Management',
    roles: ['admin', 'supervisor', 'superadmin'],
    children: [
      { to: '/campaigns', icon: Megaphone, label: 'Campaigns', roles: ['admin', 'supervisor', 'superadmin'] },
      { to: '/schedule-templates', icon: Clock, label: 'Schedule Templates', roles: ['admin', 'supervisor', 'superadmin'] },
      { to: '/holiday-calendars', icon: CalendarOff, label: 'Holidays', roles: ['admin', 'supervisor', 'superadmin'] },
      { to: '/dnc', icon: ShieldOff, label: 'DNC', roles: ['admin', 'supervisor', 'superadmin'] },
      { to: '/dispositions', icon: Settings2, label: 'Dispositions', roles: ['admin', 'supervisor', 'superadmin'] },
    ],
  },
  {
    to: '/jobs',
    icon: Briefcase,
    label: 'Jobs',
    roles: ['admin', 'supervisor', 'superadmin'],
  },
  {
    to: '/contact-lists-group',
    icon: List,
    label: 'Contact Management',
    roles: ['admin', 'supervisor', 'superadmin'],
    children: [
      {
        to: '/contact-lists',
        icon: List,
        label: 'Contact Lists',
        roles: ['admin', 'supervisor', 'superadmin'],
      },
      {
        to: '/task-scheduler',
        icon: Cloud,
        label: 'Task Scheduler',
        roles: ['admin', 'supervisor', 'superadmin'],
      },
    ],
  },
  {
    to: '/users-group',
    icon: Users,
    label: 'User Management',
    roles: ['admin', 'supervisor', 'superadmin'],
    children: [
      { to: '/agents', icon: UserCog, label: 'Admin', roles: ['admin', 'supervisor', 'superadmin'] },
      { to: '/users', icon: UsersRound, label: 'Users', roles: ['admin', 'supervisor', 'superadmin'] },
      { to: '/campaign-mapping', icon: Map, label: 'Campaign Mapping', roles: ['admin', 'supervisor', 'superadmin'] },
      { to: '/supervisor-teams', icon: UserCheck, label: 'Supervisor Teams', roles: ['admin', 'supervisor', 'superadmin'] },
    ],
  },
  {
    to: '/reports-group',
    icon: BarChart2,
    label: 'Reports',
    roles: ['admin', 'supervisor', 'superadmin'],
    children: [
      {
        to: '/reports-dashboard-sub',
        icon: LayoutDashboard,
        label: 'Dashboard',
        roles: ['admin', 'supervisor', 'superadmin'],
        children: [
          {
            to: '/reports',
            icon: LayoutDashboard,
            label: 'Overview',
            roles: ['admin', 'supervisor', 'superadmin'],
          },
          {
            to: '/reports/active-campaigns',
            icon: BarChart2,
            label: 'Active Campaigns',
            roles: ['admin', 'supervisor', 'superadmin'],
          },
          {
            to: '/reports/staffed-agents',
            icon: Users,
            label: 'Staffed Agents (Live)',
            roles: ['admin', 'supervisor', 'superadmin'],
          },
        ],
      },
      {
        to: '/reports/historical-reports',
        icon: FileText,
        label: 'Historical Reports',
        roles: ['admin', 'supervisor', 'superadmin'],
      },
    ],
  },
  { to: '/system-configuration', icon: Cog, label: 'System Configuration', roles: ['admin', 'supervisor', 'superadmin'] },
];

// Sentinels that are group-only (no real page — clicking just toggles accordion)
const GROUP_ONLY = new Set([
  '/users-group',
  '/campaigns-group',
  '/reports-group',
  '/dashboard-group',
  '/contact-lists-group',
  '/reports-dashboard-sub', // ✅ FIX: also a sentinel
]);

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isSuperadmin, orgContext } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [openSubGroups, setOpenSubGroups] = useState<Record<string, boolean>>({});

  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [agentLogoutToast, setAgentLogoutToast] = useState<{
    name: string;
    time: string;
  } | null>(null);

  useEffect(() => {
    const socket = io('http://localhost:3001');
    socket.on('agent_logged_out_alert', (data) => {
      setAgentLogoutToast({
        name: data.agent_name || data.agent_id,
        time: new Date().toLocaleTimeString(),
      });
      setTimeout(() => setAgentLogoutToast(null), 7000);
    });
    return () => { socket.disconnect(); };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // ✅ FIX: exact match OR starts-with, but NOT sentinel routes
  const isPathActive = (to: string) => {
    if (GROUP_ONLY.has(to)) return false;
    return location.pathname === to || location.pathname.startsWith(to + '/');
  };

  // ✅ FIX: recursively check if any descendant route is active
  const isAnyChildActive = (items: NavItem[]): boolean => {
    return items.some((item) => {
      if (!GROUP_ONLY.has(item.to) && isPathActive(item.to)) return true;
      if (item.children) return isAnyChildActive(item.children);
      return false;
    });
  };

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
          const visibleChildren = (n.children || []).filter((c) =>
            c.roles.includes(user?.role || ''),
          );
          const hasChildren = visibleChildren.length > 0;

          // ✅ FIX: use recursive child-active check
          const childActive = hasChildren ? isAnyChildActive(visibleChildren) : false;
          const isGroupOnly = GROUP_ONLY.has(n.to);
          const groupOpen = openGroups[n.to] ?? childActive;

          const labelEl = isGroupOnly ? (
            <button
              type='button'
              onClick={() =>
                setOpenGroups((g) => ({ ...g, [n.to]: !groupOpen }))
              }
              title={!isExpanded ? n.label : undefined}
              className={clsx(
                'flex items-center rounded-xl transition-all duration-150',
                isExpanded
                  ? 'gap-1.5 px-3 py-2.5 w-full'
                  : 'justify-center w-10 h-10',
                // ✅ FIX: highlight parent when any child is active
                childActive
                  ? 'bg-gradient-to-r from-[#F4521E] to-[#F5A623] text-white shadow-[0_4px_16px_rgba(244,82,30,0.4)]'
                  : 'text-[#C4956A] hover:bg-white/10 hover:text-white',
              )}
            >
              <n.icon className="w-5 h-5 flex-shrink-0" />
              {isExpanded && (
                <div className="flex items-center justify-between flex-1 min-w-0">
                  <span
                    className="text-[14px] font-medium truncate"
                    style={{ fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.01em' }}
                  >
                    {n.label}
                  </span>
                  <ChevronDown
                    className={clsx(
                      'w-4 h-4 transition-transform duration-200 flex-shrink-0 ml-2',
                      groupOpen ? 'rotate-0' : '-rotate-90'
                    )}
                  />
                </div>
              )}
            </button>
          ) : (
            <NavLink
              to={n.to}
              end={hasChildren}
              onClick={() => setMobileOpen(false)}
              title={!isExpanded ? n.label : undefined}
              className={({ isActive: active }) =>
                clsx(
                  'flex items-center rounded-xl transition-all duration-150',
                  isExpanded
                    ? 'gap-1.5 px-3 py-2.5 w-full'
                    : 'justify-center w-10 h-10',
                  active || childActive
                    ? 'bg-gradient-to-r from-[#F4521E] to-[#F5A623] text-white shadow-[0_4px_16px_rgba(244,82,30,0.4)]'
                    : 'text-[#C4956A] hover:bg-white/10 hover:text-white',
                )
              }
            >
              <n.icon className='w-5 h-5 flex-shrink-0' />
              {isExpanded && (
                <span
                  className='text-[14px] font-medium truncate'
                  style={{ fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.01em' }}
                >
                  {n.label}
                </span>
              )}
            </NavLink>
          );

          return (
            <div key={n.to}>
              <div
                className={clsx(
                  'flex items-center',
                  isExpanded ? 'gap-1' : 'justify-center',
                )}
              >
                {labelEl}
                {/* Chevron toggle only for non-group-only parents */}
                {hasChildren && isExpanded && !isGroupOnly && (
                  <button
                    type='button'
                    onClick={() =>
                      setOpenGroups((g) => ({ ...g, [n.to]: !groupOpen }))
                    }
                    className='p-1.5 rounded-lg text-[#8A6A50] hover:text-white hover:bg-white/10 transition-colors flex-shrink-0'
                  >
                    <ChevronDown
                      className={clsx(
                        'w-4 h-4 transition-transform duration-200',
                        groupOpen ? 'rotate-0' : '-rotate-90',
                      )}
                    />
                  </button>
                )}
              </div>

              {hasChildren && isExpanded && groupOpen && (
                <div className='mt-0.5 space-y-0.5'>
                  {visibleChildren.map((c) => {
                    const subChildren = (c.children || []).filter(sc =>
                      sc.roles.includes(user?.role || '')
                    );
                    const hasSubChildren = subChildren.length > 0;
                    // ✅ FIX: recursive check for sub-children too
                    const subChildActive = hasSubChildren ? isAnyChildActive(subChildren) : false;
                    const isSubGroupOnly = GROUP_ONLY.has(c.to);
                    const subGroupOpen = openSubGroups[c.to] ?? subChildActive;

                    if (hasSubChildren) {
                      return (
                        <div key={c.to}>
                          <button
                            type='button'
                            onClick={() =>
                              setOpenSubGroups((g) => ({ ...g, [c.to]: !subGroupOpen }))
                            }
                            className={clsx(
                              'flex items-center gap-2.5 pl-11 pr-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 w-full',
                              // ✅ FIX: highlight sub-group header when any of its children are active
                              subChildActive
                                ? 'text-[#F5A623] bg-[#F5A623]/10 font-semibold'
                                : 'text-[#906040] hover:text-[#F5C89A] hover:bg-white/6',
                            )}
                          >
                            <c.icon className='w-3.5 h-3.5 flex-shrink-0' />
                            <span className='flex-1 text-left'>{c.label}</span>
                            <ChevronDown
                              className={clsx(
                                'w-3 h-3 transition-transform duration-200 flex-shrink-0',
                                subGroupOpen ? 'rotate-0' : '-rotate-90'
                              )}
                            />
                          </button>

                          {subGroupOpen && (
                            <div className='mt-0.5 space-y-0.5'>
                              {subChildren.map((sc) => (
                                <NavLink
                                  key={sc.to}
                                  to={sc.to}
                                  end
                                  onClick={() => setMobileOpen(false)}
                                  className={({ isActive }) =>
                                    clsx(
                                      'flex items-center gap-2.5 pl-16 pr-3 py-2 rounded-lg text-[12px] font-medium transition-all duration-150',
                                      isActive
                                        ? 'text-[#F5A623] bg-[#F5A623]/10 font-semibold'
                                        : 'text-[#906040] hover:text-[#F5C89A] hover:bg-white/6',
                                    )
                                  }
                                >
                                  <sc.icon className='w-3 h-3 flex-shrink-0' />
                                  {sc.label}
                                </NavLink>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Regular child (no sub-children)
                    return (
                      <React.Fragment key={c.to}>
                        <NavLink
                          to={c.to}
                          end
                          onClick={() => setMobileOpen(false)}
                          className={({ isActive }) =>
                            clsx(
                              'flex items-center gap-2.5 pl-11 pr-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                              isActive
                                ? 'text-[#F5A623] bg-[#F5A623]/10 font-semibold'
                                : 'text-[#906040] hover:text-[#F5C89A] hover:bg-white/6',
                            )
                          }
                        >
                          <c.icon className='w-3.5 h-3.5 flex-shrink-0' />
                          {c.label}
                        </NavLink>
                      </React.Fragment>
                    );
                  })}
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
        <div
          className={clsx(
            'flex items-center gap-2 border-b border-white/8 flex-shrink-0 px-3 py-4',
            isExpanded ? 'justify-between' : 'justify-center flex-col',
          )}
        >
          <div className='flex items-center gap-3 min-w-0'>
            <div className='w-9 h-9 bg-gradient-to-br from-[#F4521E] to-[#F5A623] rounded-xl flex items-center justify-center shadow-[0_4px_14px_rgba(244,82,30,0.55)] flex-shrink-0'>
              <Zap className='w-[18px] h-[18px] text-white' fill='white' />
            </div>
            {isExpanded && (
              <div className='overflow-hidden'>
                <div
                  className='text-[15px] font-bold text-white tracking-wide leading-tight'
                  style={{ fontFamily: 'Sora, sans-serif' }}
                >
                  PreviewCamp
                </div>
                <div className='text-[11px] text-[#7A5C44] leading-none mt-0.5'>
                  {isSuperadmin
                    ? orgContext
                      ? orgContext.name
                      : 'Platform'
                    : user?.orgName}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setExpanded((v) => !v)}
            title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className='flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-[#6A4A30] hover:text-white hover:bg-white/10 transition-colors'
          >
            {isExpanded ? (
              <PanelLeftClose className='w-[17px] h-[17px]' />
            ) : (
              <PanelLeftOpen className='w-[17px] h-[17px]' />
            )}
          </button>
        </div>

        {isExpanded && (
          <div className='px-4 pt-4 pb-1 flex-shrink-0'>
            <span className='text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5A3A22]'>
              Navigation
            </span>
          </div>
        )}

        <nav
          className={clsx(
            'flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-0.5',
            isExpanded ? 'px-2' : 'px-2 flex flex-col items-center',
          )}
        >
          <NavItems isExpanded={isExpanded} />
        </nav>

        {/* User footer */}
        <div
          className={clsx(
            'flex-shrink-0 p-3 border-t border-white/8',
            !isExpanded && 'flex justify-center',
          )}
        >
          {isExpanded ? (
            <div className='flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/8 transition-colors group cursor-default'>
              <div className='w-8 h-8 bg-gradient-to-br from-[#F4521E] to-[#F5A623] rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0'>
                {initials}
              </div>
              <div className='flex-1 min-w-0'>
                <div className='text-[13px] font-semibold text-[#EED5BC] truncate'>
                  {user?.firstName} {user?.lastName}
                </div>
                <div className='text-[11px] text-[#6A4A30] capitalize mt-0.5'>
                  {user?.role}
                </div>
              </div>
              <button
                onClick={handleLogout}
                title='Sign out'
                className='p-1.5 rounded-lg text-[#7A5C44] hover:text-[#F4521E] hover:bg-[#F4521E]/12 transition-colors opacity-0 group-hover:opacity-100'
              >
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
    <div
      className='flex h-screen overflow-hidden'
      style={{ background: '#FFF8F2' }}
    >
      {/* Desktop sidebar */}
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
          <div
            className='absolute inset-0 bg-black/60 backdrop-blur-sm'
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className='absolute left-0 top-0 h-full flex flex-col'
            style={{ width: '260px', background: '#180E00' }}
          >
            <SidebarContent isExpanded={true} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className='flex-1 flex flex-col overflow-hidden min-w-0'>
        {/* Mobile top bar */}
        <div className='md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-[#FFE0C8]'>
          <button
            onClick={() => setMobileOpen(true)}
            className='p-2 rounded-xl hover:bg-orange-50'
          >
            <Menu className='w-5 h-5 text-[#5C4030]' />
          </button>
          <span
            className='font-bold text-[#1A0F00] text-sm'
            style={{ fontFamily: 'Sora, sans-serif' }}
          >
            PreviewCamp
          </span>
          <div className='w-9 h-9 bg-gradient-to-br from-[#F4521E] to-[#F5A623] rounded-full flex items-center justify-center text-xs font-bold text-white'>
            {initials}
          </div>
        </div>

        <main className='flex-1 overflow-y-auto'>{children}</main>
      </div>

      {/* Global Agent Logout Toast */}
      {agentLogoutToast && (
        <div className='fixed bottom-6 right-6 bg-white border border-[#FFE0C8] shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-2xl p-4 flex items-center gap-4 z-[9999] transition-all transform duration-300 translate-y-0 opacity-100'>
          <div className='w-10 h-10 bg-orange-50 rounded-full flex items-center justify-center text-[#F4521E] flex-shrink-0'>
            <LogOut className='w-5 h-5' />
          </div>
          <div>
            <div
              className='font-bold text-[#1A0F00]'
              style={{ fontFamily: 'Sora, sans-serif' }}
            >
              Agent Logged Out
            </div>
            <div className='text-sm text-[#7A5C44] mt-0.5'>
              <span className='font-semibold text-[#F4521E]'>
                {agentLogoutToast.name}
              </span>{' '}
              signed out at {agentLogoutToast.time}
            </div>
          </div>
          <button
            onClick={() => setAgentLogoutToast(null)}
            className='ml-4 p-1.5 rounded-lg text-[#C4956A] hover:bg-[#FFF4EE] hover:text-[#F4521E] transition-colors'
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}