'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { NavItem, Role } from '@batters-up/shared';
import { ROLE_NAV_ITEMS, ROLE_LABELS } from '@batters-up/shared';
import {
  LayoutDashboard,
  Trophy,
  Users,
  MapPin,
  Key,
  UserCheck,
  Calendar,
  BarChart,
  MessageSquare,
  ClipboardList,
  Edit,
  TrendingUp,
  User,
  Award,
  Building,
  CalendarPlus,
  ClipboardCheck,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'layout-dashboard': LayoutDashboard,
  trophy: Trophy,
  users: Users,
  'map-pin': MapPin,
  key: Key,
  'user-check': UserCheck,
  calendar: Calendar,
  'bar-chart': BarChart,
  'message-square': MessageSquare,
  'clipboard-list': ClipboardList,
  edit: Edit,
  'trending-up': TrendingUp,
  user: User,
  award: Award,
  building: Building,
  'calendar-plus': CalendarPlus,
  'clipboard-check': ClipboardCheck,
};

interface SidebarProps {
  roles: Role[];
  userName: string;
}

export function Sidebar({ roles, userName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeRole, setActiveRole] = useState<Role>(roles[0] ?? 'fan');
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);

  const navItems: NavItem[] = ROLE_NAV_ITEMS[activeRole] ?? [];

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-gray-200 px-6">
        <Link href="/dashboard" className="text-xl font-bold text-gray-900">
          BattersUp
        </Link>
      </div>

      {/* Role Switcher */}
      {roles.length > 1 && (
        <div className="border-b border-gray-200 px-4 py-3">
          <div className="relative">
            <button
              onClick={() => setRoleMenuOpen(!roleMenuOpen)}
              className="flex w-full items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <span>{ROLE_LABELS[activeRole]}</span>
              <ChevronDown className="h-4 w-4" />
            </button>
            {roleMenuOpen && (
              <div className="absolute left-0 right-0 z-10 mt-1 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                {roles.map((role) => (
                  <button
                    key={role}
                    onClick={() => {
                      setActiveRole(role);
                      setRoleMenuOpen(false);
                    }}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                      activeRole === role
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-700'
                    }`}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = iconMap[item.icon] ?? LayoutDashboard;
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User section */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">
              {userName}
            </p>
            <p className="text-xs text-gray-500">
              {roles.map((r) => ROLE_LABELS[r]).join(', ')}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
