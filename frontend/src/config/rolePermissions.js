
export const ROLES = Object.freeze({
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  SUPERVISOR: 'SUPERVISOR',
  ACCOUNTS: 'ACCOUNTS',
  CLEANER: 'CLEANER',
  DETAILER: 'DETAILER',
})

export const ROLE_DETAILS = Object.freeze({
  [ROLES.OWNER]: {
    label: 'Owner',
    defaultRoute: '/dashboard',
  },
  [ROLES.ADMIN]: {
    label: 'Administrator',
    defaultRoute: '/dashboard',
  },
  [ROLES.SUPERVISOR]: {
    label: 'Supervisor',
    defaultRoute: '/dashboard',
  },
  [ROLES.ACCOUNTS]: {
    label: 'Accounts',
    defaultRoute: '/dashboard',
  },
  [ROLES.CLEANER]: {
    label: 'Cleaner',
    defaultRoute: '/my-day',
  },
  [ROLES.DETAILER]: {
    label: 'Detailer',
    defaultRoute: '/dashboard',
  },
})

export const ROUTE_PERMISSIONS = Object.freeze({
  '/dashboard': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ACCOUNTS,
    ROLES.CLEANER,
    ROLES.DETAILER,
  ],

  '/staff': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
  ],

  '/services': [
    ROLES.OWNER,
    ROLES.ADMIN,
  ],

  '/attendance': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
  ],

  '/my-attendance': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ACCOUNTS,
    ROLES.CLEANER,
    ROLES.DETAILER,
  ],

  '/my-day': [
    ROLES.CLEANER,
  ],

  '/check-in': [
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.DETAILER,
  ],

  '/monitor-assignments': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
  ],
})

export const ACTION_PERMISSIONS = Object.freeze({
  'staff.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
  ],
  'staff.register': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
  ],
  'staff.update': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
  ],

  'branches.view': [ROLES.OWNER, ROLES.ADMIN],

  'attendance.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
  ],
  'attendance.manage': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
  ],
  'attendance.self': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ACCOUNTS,
    ROLES.CLEANER,
    ROLES.DETAILER,
  ],

  'myDay.view': [ROLES.CLEANER],
  'myDay.completeAssignment': [ROLES.CLEANER],

  'vehicles.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ACCOUNTS,
    ROLES.CLEANER,
    ROLES.DETAILER,
  ],
  'vehicles.register': [
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.DETAILER,
  ],
  'vehicles.update': [ROLES.ADMIN, ROLES.SUPERVISOR],

  'vehicleCategories.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ACCOUNTS,
    ROLES.CLEANER,
    ROLES.DETAILER,
  ],
  'vehicleCategories.create': [ROLES.ADMIN, ROLES.SUPERVISOR],

  'customers.view': [
    ROLES.ADMIN,
    ROLES.OWNER,
    ROLES.SUPERVISOR,
    ROLES.ACCOUNTS,
  ],
  'customers.manage': [ROLES.ADMIN, ROLES.SUPERVISOR],

  'visits.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ACCOUNTS,
    ROLES.CLEANER,
    ROLES.DETAILER,
  ],
  'visits.create': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.DETAILER,
  ],

  'visitServices.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ACCOUNTS,
    ROLES.CLEANER,
    ROLES.DETAILER,
  ],
  'visitServices.add': [
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.DETAILER,
  ],

  'assignments.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ACCOUNTS,
    ROLES.CLEANER,
    ROLES.DETAILER,
  ],
  'assignments.create': [ROLES.ADMIN, ROLES.SUPERVISOR],
  'assignments.remove': [ROLES.ADMIN, ROLES.SUPERVISOR],
  'assignments.monitor': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
  ],
  'assignments.reassign': [ROLES.SUPERVISOR],
  'assignments.completeBySupervisor': [ROLES.SUPERVISOR],
  'assignments.correctCompleted': [ROLES.OWNER, ROLES.ADMIN],
  'assignments.viewCorrectionHistory': [ROLES.OWNER, ROLES.ADMIN],

  'services.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ACCOUNTS,
    ROLES.CLEANER,
    ROLES.DETAILER,
  ],
  'services.manage': [ROLES.OWNER, ROLES.ADMIN],

  'creditAccounts.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.ACCOUNTS,
  ],
  'creditAccounts.manage': [ROLES.ADMIN],

  'creditLedger.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.ACCOUNTS,
  ],
  'creditLedger.recordPayment': [ROLES.ADMIN, ROLES.ACCOUNTS],
})

export function getUserRole(user) {
  if (!user) return null

  if (
    user.is_superuser === true ||
    user.isSuperuser === true
  ) {
    return ROLES.OWNER
  }

  const role = user.role

  if (typeof role !== 'string') return null

  const normalizedRole = role.trim().toUpperCase()

  return Object.values(ROLES).includes(normalizedRole)
    ? normalizedRole
    : null
}

export function hasValidRole(user) {
  return getUserRole(user) !== null
}

export function canAccessRoute(user, path) {
  const role = getUserRole(user)

  if (!role) return false

  const allowedRoles = ROUTE_PERMISSIONS[path]

  if (!allowedRoles) return false

  return allowedRoles.includes(role)
}

export function canPerform(user, action) {
  const role = getUserRole(user)

  if (!role) return false

  const allowedRoles = ACTION_PERMISSIONS[action]

  if (!allowedRoles) return false

  return allowedRoles.includes(role)
}

export function getDefaultRoute(user) {
  const role = getUserRole(user)

  if (!role) return '/login'

  return ROLE_DETAILS[role]?.defaultRoute || '/dashboard'
}

export function getRoleLabel(user) {
  const role = getUserRole(user)

  if (!role) return 'Unassigned Role'

  return ROLE_DETAILS[role]?.label || 'Staff'
}
