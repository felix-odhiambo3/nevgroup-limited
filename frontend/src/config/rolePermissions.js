
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
    defaultRoute: '/dashboard',
  },
  [ROLES.DETAILER]: {
    label: 'Detailer',
    defaultRoute: '/dashboard',
  },
})

/*
 * Routes that currently exist in the frontend.
 * Do not add unfinished modules as accessible pages.
 */
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
  ],

  '/attendance': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
  ],

  '/check-in': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.DETAILER,
  ],
})

/*
 * Backend-aligned operational permissions.
 * These permissions control frontend visibility only.
 * The backend remains responsible for enforcing security.
 */
export const ACTION_PERMISSIONS = Object.freeze({
  // Staff management
  'staff.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
  ],
  'staff.register': [
    ROLES.OWNER,
    ROLES.ADMIN,
  ],
  'staff.update': [
    ROLES.OWNER,
    ROLES.ADMIN,
  ],

  // Branches
  'branches.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
  ],

  // Attendance
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

  // Vehicles
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
  'vehicles.update': [
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
  ],

  // Vehicle categories
  'vehicleCategories.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ACCOUNTS,
    ROLES.CLEANER,
    ROLES.DETAILER,
  ],
  'vehicleCategories.create': [
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
  ],

  // Customers
  'customers.view': [
    ROLES.ADMIN,
    ROLES.OWNER,
    ROLES.SUPERVISOR,
    ROLES.ACCOUNTS,
  ],
  'customers.manage': [
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
  ],

  // Visits
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

  // Visit services
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

  // Employee assignments
  'assignments.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ACCOUNTS,
    ROLES.CLEANER,
    ROLES.DETAILER,
  ],
  'assignments.create': [
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
  ],
  'assignments.remove': [
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
  ],

  // Services and pricing
  'services.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ACCOUNTS,
    ROLES.CLEANER,
    ROLES.DETAILER,
  ],
  'services.manage': [
    ROLES.OWNER,
    ROLES.ADMIN,
  ],

  // Customer credit accounts
  'creditAccounts.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.ACCOUNTS,
  ],
  'creditAccounts.manage': [
    ROLES.ADMIN,
  ],

  // Credit ledger
  'creditLedger.view': [
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.ACCOUNTS,
  ],
  'creditLedger.recordPayment': [
    ROLES.ADMIN,
    ROLES.ACCOUNTS,
  ],
})

/*
 * Convert a user's role into a consistent uppercase value.
 * Superusers are treated as OWNER for the frontend workspace.
 */
export function getUserRole(user) {
  if (!user) return null

  if (user.is_superuser === true || user.isSuperuser === true) {
    return ROLES.OWNER
  }

  const role = user.role

  if (typeof role !== 'string') {
    return null
  }

  const normalizedRole = role.trim().toUpperCase()

  return Object.values(ROLES).includes(normalizedRole)
    ? normalizedRole
    : null
}

/*
 * Check whether the authenticated user has a recognized role.
 */
export function hasValidRole(user) {
  return getUserRole(user) !== null
}

/*
 * Check whether a user can access a frontend route.
 */
export function canAccessRoute(user, path) {
  const role = getUserRole(user)

  if (!role) return false

  const allowedRoles = ROUTE_PERMISSIONS[path]

  if (!allowedRoles) return false

  return allowedRoles.includes(role)
}

/*
 * Check whether a user can perform a particular action.
 */
export function canPerform(user, action) {
  const role = getUserRole(user)

  if (!role) return false

  const allowedRoles = ACTION_PERMISSIONS[action]

  if (!allowedRoles) return false

  return allowedRoles.includes(role)
}

/*
 * Return the default landing page for the user's role.
 */
export function getDefaultRoute(user) {
  const role = getUserRole(user)

  if (!role) return '/login'

  return ROLE_DETAILS[role]?.defaultRoute || '/dashboard'
}

/*
 * Return the display name for a user's role.
 */
export function getRoleLabel(user) {
  const role = getUserRole(user)

  if (!role) return 'Unassigned Role'

  return ROLE_DETAILS[role]?.label || 'Staff'
}
