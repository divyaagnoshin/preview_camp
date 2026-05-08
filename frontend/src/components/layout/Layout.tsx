import React, { ReactNode, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import {
  Phone,
  LayoutDashboard,
  Megaphone,
  Users,
  List,
  ShieldOff,
  Settings,
  BarChart2,
  LogOut,
  Menu,
  X,
  Briefcase,
  ChevronDown,
  CalendarOff,
  Clock,
} from 'lucide-react';

// A nav entry may declare `children`. When present, the entry renders as a
// collapsible group: clicking the row still navigates to `to`, but a chevron
// reveals nested sub-routes (rendered with the same NavLink active styling).
type NavItem = {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  roles: string[];
  children?: NavItem[];
};

const navItems: NavItem[] = [
  {
    to: '/dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
    roles: ['admin', 'supervisor', 'agent'],
  },
  {
    to: '/workspace',
    icon: Phone,
    label: 'Workspace',
    roles: ['agent', 'admin', 'supervisor'],
  },
  {
    to: '/campaigns',
    icon: Megaphone,
    label: 'Campaigns',
    roles: ['admin', 'supervisor'],
    children: [
      {
        to: '/schedule-templates',
        icon: Clock,
        label: 'Schedule Templates',
        roles: ['admin', 'supervisor'],
      },
      {
        to: '/holiday-calendars',
        icon: CalendarOff,
        label: 'Holidays',
        roles: ['admin', 'supervisor'],
      },
      {
        to: '/dnc',
        icon: ShieldOff,
        label: 'DNC',
        roles: ['admin', 'supervisor'],
      },
    ],
  },
  {
    to: '/jobs',
    icon: Briefcase,
    label: 'Jobs',
    roles: ['admin', 'supervisor'],
  },
  {
    to: '/contact-lists',
    icon: List,
    label: 'Contact Lists',
    roles: ['admin', 'supervisor'],
  },
  {
    to: '/agents',
    icon: Users,
    label: 'Agents',
    roles: ['admin', 'supervisor'],
  },
  {
    to: '/reports',
    icon: BarChart2,
    label: 'Reports',
    roles: ['admin', 'supervisor'],
  },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isAdmin, isSupervisor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Tracks which parent groups the user has manually toggled open. Groups
  // whose own route or any child route is active are auto-expanded regardless.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const visibleNav = navItems.filter((n) => n.roles.includes(user?.role || ''));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isPathActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(to + '/');

  const NavItems = () => (
    <>
      {visibleNav.map((n) => {
        const visibleChildren = (n.children || []).filter((c) =>
          c.roles.includes(user?.role || ''),
        );
        const hasChildren = visibleChildren.length > 0;
        const childActive = visibleChildren.some((c) => isPathActive(c.to));
        const expanded =
          openGroups[n.to] ?? (isPathActive(n.to) || childActive);

        return (
          <div key={n.to}>
            <div className='flex items-center'>
              <NavLink
                to={n.to}
                onClick={() => setMobileOpen(false)}
                end={hasChildren}
                className={({ isActive }) =>
                  clsx(
                    'flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition',
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )
                }
              >
                <n.icon className='w-4 h-4 flex-shrink-0' />
                {n.label}
              </NavLink>
              {hasChildren && (
                <button
                  type='button'
                  aria-label={expanded ? 'Collapse' : 'Expand'}
                  onClick={() =>
                    setOpenGroups((g) => ({ ...g, [n.to]: !expanded }))
                  }
                  className='ml-1 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600'
                >
                  <ChevronDown
                    className={clsx(
                      'w-3.5 h-3.5 transition-transform',
                      expanded ? 'rotate-0' : '-rotate-90',
                    )}
                  />
                </button>
              )}
            </div>
            {hasChildren && expanded && (
              <div className='ml-4 mt-0.5 pl-3 border-l border-gray-100 space-y-0.5'>
                {visibleChildren.map((c) => (
                  <NavLink
                    key={c.to}
                    to={c.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition',
                        isActive
                          ? 'bg-indigo-50 text-indigo-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
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

  return (
    <div className='flex h-screen bg-gray-50 overflow-hidden'>
      {/* Sidebar — desktop */}
      <aside className='hidden md:flex flex-col w-56 bg-white border-r border-gray-200 flex-shrink-0'>
        <div className='flex items-center gap-2.5 px-4 py-4 border-b border-gray-100'>
          <div className='w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center'>
            <Phone className='w-4 h-4 text-white' />
          </div>
          <div>
            <div className='text-sm font-bold text-gray-900 leading-none'>
              PreviewCamp
            </div>
            <div className='text-xs text-gray-400 leading-none mt-0.5'>
              {user?.orgName}
            </div>
          </div>
        </div>
        <nav className='flex-1 p-3 space-y-0.5 overflow-y-auto'>
          <NavItems />
        </nav>
        <div className='p-3 border-t border-gray-100'>
          <div className='flex items-center gap-2 px-2 py-2 rounded-lg'>
            <div className='w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-700'>
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </div>
            <div className='flex-1 min-w-0'>
              <div className='text-xs font-medium text-gray-900 truncate'>
                {user?.firstName} {user?.lastName}
              </div>
              <div className='text-xs text-gray-400 capitalize'>
                {user?.role}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title='Sign out'
              className='p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600'
            >
              <LogOut className='w-3.5 h-3.5' />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className='fixed inset-0 z-50 md:hidden'>
          <div
            className='absolute inset-0 bg-black/40'
            onClick={() => setMobileOpen(false)}
          />
          <aside className='absolute left-0 top-0 h-full w-56 bg-white flex flex-col'>
            <div className='flex items-center justify-between px-4 py-4 border-b border-gray-100'>
              <span className='font-bold text-gray-900 text-sm'>
                PreviewCamp
              </span>
              <button onClick={() => setMobileOpen(false)}>
                <X className='w-5 h-5 text-gray-400' />
              </button>
            </div>
            <nav className='flex-1 p-3 space-y-0.5 overflow-y-auto'>
              <NavItems />
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className='flex-1 flex flex-col overflow-hidden'>
        {/* Mobile top bar */}
        <div className='md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200'>
          <button onClick={() => setMobileOpen(true)}>
            <Menu className='w-5 h-5 text-gray-600' />
          </button>
          <span className='font-bold text-gray-900 text-sm'>PreviewCamp</span>
          <div className='w-5' />
        </div>
        <main className='flex-1 overflow-y-auto'>{children}</main>
      </div>
    </div>
  );
}
