
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

const PAYMENT_VIEW_ROLES = [
  ROLES.OWNER,
  ROLES.ADMIN,
  ROLES.ACCOUNTS,
  ROLES.SUPERVISOR,
]

const COMMISSION_READ_ROLES = [
  ROLES.OWNER,
  ROLES.ADMIN,
  ROLES.ACCOUNTS,
  ROLES.SUPERVISOR,
  ROLES.CLEANER,
]

const GLOBAL_PAYMENT_ROLES = [
  ROLES.OWNER,
  ROLES.ADMIN,
  ROLES.ACCOUNTS,
]

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
  '/branch-gps-settings': [
  ROLES.OWNER,
  ROLES.ADMIN,
 ],

  '/services': [
    ROLES.OWNER,
    ROLES.ADMIN,
  ],
  
    '/branch-gps-settings': [
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

  '/my-day': [ROLES.CLEANER],

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

  // Financial management
  '/invoices': PAYMENT_VIEW_ROLES,
  '/collections': PAYMENT_VIEW_ROLES,
  '/reversals': GLOBAL_PAYMENT_ROLES,

  // Revenue is restricted to supervisors and superusers.
  '/revenue': [ROLES.SUPERVISOR],

  // Commission records
  '/commissions': COMMISSION_READ_ROLES,
  '/commission-payouts': COMMISSION_READ_ROLES,
  '/commission-adjustments': COMMISSION_READ_ROLES,
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

  // Invoices and collections
  'payments.invoices.view': PAYMENT_VIEW_ROLES,
  'payments.collections.view': PAYMENT_VIEW_ROLES,
  'payments.collections.record': PAYMENT_VIEW_ROLES,

  // Reversals
  'payments.reversals.view': GLOBAL_PAYMENT_ROLES,
  'payments.reversals.create': GLOBAL_PAYMENT_ROLES,

  // Revenue
  'payments.revenue.view': [ROLES.SUPERVISOR],

  // Commission records
  'commissions.view': COMMISSION_READ_ROLES,
  'commissions.summary.view': COMMISSION_READ_ROLES,
  'commissions.payouts.view': COMMISSION_READ_ROLES,
  'commissions.adjustments.view': COMMISSION_READ_ROLES,

  // Commission write permissions
  'commissions.payouts.create': GLOBAL_PAYMENT_ROLES,
  'commissions.adjustments.create': [
    ROLES.OWNER,
    ROLES.ADMIN,
  ],
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

  // Revenue endpoint permits supervisors and backend superusers.
  if (path === '/revenue') {
    return (
      role === ROLES.SUPERVISOR ||
      user.is_superuser === true ||
      user.isSuperuser === true
    )
  }

  const allowedRoles = ROUTE_PERMISSIONS[path]

  if (!allowedRoles) return false

  return allowedRoles.includes(role)
}

export function canPerform(user, action) {
  const role = getUserRole(user)

  if (!role) return false

  // Match backend revenue authorization.
  if (action === 'payments.revenue.view') {
    return (
      role === ROLES.SUPERVISOR ||
      user.is_superuser === true ||
      user.isSuperuser === true
    )
  }

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
