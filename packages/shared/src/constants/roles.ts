export const ROLES = {
  COMMISSIONER: 'commissioner',
  MANAGER: 'manager',
  COACH: 'coach',
  PLAYER: 'player',
  PARENT: 'parent',
  FAN: 'fan',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  commissioner: 'Commissioner',
  manager: 'Manager',
  coach: 'Coach',
  player: 'Player',
  parent: 'Parent',
  fan: 'Fan',
};

export const ROLE_NAV_ITEMS: Record<Role, NavItem[]> = {
  commissioner: [
    { label: 'Dashboard', href: '/dashboard', icon: 'layout-dashboard' },
    { label: 'Leagues', href: '/commissioner/leagues', icon: 'trophy' },
    { label: 'Teams', href: '/commissioner/teams', icon: 'users' },
    { label: 'Fields', href: '/commissioner/fields', icon: 'map-pin' },
    { label: 'Signup Codes', href: '/commissioner/codes', icon: 'key' },
    { label: 'Members', href: '/commissioner/members', icon: 'user-check' },
    { label: 'Schedule Builder', href: '/commissioner/schedule', icon: 'calendar-plus' },
    { label: 'Schedule', href: '/schedule', icon: 'calendar' },
    { label: 'Standings', href: '/standings', icon: 'bar-chart' },
  ],
  manager: [
    { label: 'Dashboard', href: '/dashboard', icon: 'layout-dashboard' },
    { label: 'Team', href: '/team/roster', icon: 'users' },
    { label: 'Depth Chart', href: '/team/depth-chart', icon: 'clipboard-check' },
    { label: 'Lineup', href: '/team/lineup', icon: 'clipboard-list' },
    { label: 'Directory', href: '/team/directory', icon: 'building' },
    { label: 'Schedule', href: '/schedule', icon: 'calendar' },
    { label: 'Standings', href: '/standings', icon: 'bar-chart' },
    { label: 'Messages', href: '/messages', icon: 'message-square' },
  ],
  coach: [
    { label: 'Dashboard', href: '/dashboard', icon: 'layout-dashboard' },
    { label: 'Team', href: '/team/roster', icon: 'users' },
    { label: 'Depth Chart', href: '/team/depth-chart', icon: 'clipboard-check' },
    { label: 'Lineup', href: '/team/lineup', icon: 'clipboard-list' },
    { label: 'Directory', href: '/team/directory', icon: 'building' },
    { label: 'Schedule', href: '/schedule', icon: 'calendar' },
    { label: 'Score Game', href: '/games/score', icon: 'edit' },
    { label: 'Stats', href: '/stats', icon: 'bar-chart' },
    { label: 'Messages', href: '/messages', icon: 'message-square' },
  ],
  player: [
    { label: 'Dashboard', href: '/dashboard', icon: 'layout-dashboard' },
    { label: 'My Stats', href: '/stats/me', icon: 'bar-chart' },
    { label: 'Team', href: '/team/roster', icon: 'users' },
    { label: 'Directory', href: '/team/directory', icon: 'building' },
    { label: 'Schedule', href: '/schedule', icon: 'calendar' },
    { label: 'Standings', href: '/standings', icon: 'bar-chart' },
    { label: 'Messages', href: '/messages', icon: 'message-square' },
    { label: 'Awards', href: '/awards', icon: 'award' },
  ],
  parent: [
    { label: 'Dashboard', href: '/dashboard', icon: 'layout-dashboard' },
    { label: 'My Player', href: '/player', icon: 'user' },
    { label: 'Schedule', href: '/schedule', icon: 'calendar' },
    { label: 'Standings', href: '/standings', icon: 'bar-chart' },
    { label: 'Messages', href: '/messages', icon: 'message-square' },
  ],
  fan: [
    { label: 'Dashboard', href: '/dashboard', icon: 'layout-dashboard' },
    { label: 'Schedule', href: '/schedule', icon: 'calendar' },
    { label: 'Standings', href: '/standings', icon: 'bar-chart' },
    { label: 'Stats', href: '/stats', icon: 'trending-up' },
  ],
};
