
import api from './client'

// --------------------------------------------------
// INVOICES
// --------------------------------------------------

export const getInvoices = async (params = {}) => {
  const response = await api.get('payments/invoices/', { params })
  return response.data
}

export const getInvoice = async (invoiceId) => {
  const response = await api.get(
    `payments/invoices/${invoiceId}/`
  )
  return response.data
}

// --------------------------------------------------
// PAYMENT COLLECTIONS AND RECEIPTS
// --------------------------------------------------

export const collectInvoicePayment = async (
  invoiceId,
  payload
) => {
  const response = await api.post(
    `payments/invoices/${invoiceId}/collections/`,
    payload
  )
  return response.data
}

export const getPaymentCollections = async (params = {}) => {
  const response = await api.get(
    'payments/collections/',
    { params }
  )
  return response.data
}

export const getPaymentCollection = async (collectionId) => {
  const response = await api.get(
    `payments/collections/${collectionId}/`
  )
  return response.data
}

// --------------------------------------------------
// PAYMENT REVERSALS
// --------------------------------------------------

export const getPaymentReversals = async (params = {}) => {
  const response = await api.get(
    'payments/reversals/',
    { params }
  )
  return response.data
}

export const reversePayment = async (
  paymentEntryId,
  payload
) => {
  const response = await api.post(
    `payments/entries/${paymentEntryId}/reversals/`,
    payload
  )
  return response.data
}

// --------------------------------------------------
// REVENUE REPORTING
// --------------------------------------------------

export const getRevenueSummary = async (params = {}) => {
  const response = await api.get(
    'payments/revenue-summary/',
    { params }
  )
  return response.data
}

// --------------------------------------------------
// CLEANER COMMISSIONS
// --------------------------------------------------

export const getCommissions = async (params = {}) => {
  const response = await api.get(
    'payments/commissions/',
    { params }
  )
  return response.data
}

export const getCommission = async (commissionId) => {
  const response = await api.get(
    `payments/commissions/${commissionId}/`
  )
  return response.data
}

export const getCommissionSummary = async (params = {}) => {
  const response = await api.get(
    'payments/commissions/summary/',
    { params }
  )
  return response.data
}

// --------------------------------------------------
// COMMISSION PAYOUTS
// --------------------------------------------------

export const getCommissionPayouts = async (params = {}) => {
  const response = await api.get(
    'payments/commission-payouts/',
    { params }
  )
  return response.data
}

export const createCommissionPayout = async (payload) => {
  const response = await api.post(
    'payments/commission-payouts/',
    payload
  )
  return response.data
}

// --------------------------------------------------
// COMMISSION ADJUSTMENTS
// --------------------------------------------------

export const getCommissionAdjustments = async (
  params = {}
) => {
  const response = await api.get(
    'payments/commission-adjustments/',
    { params }
  )
  return response.data
}

export const createCommissionAdjustment = async (
  payload
) => {
  const response = await api.post(
    'payments/commission-adjustments/',
    payload
  )
  return response.data
}

// --------------------------------------------------
// VAT CONFIGURATION
// --------------------------------------------------

export const getTaxConfigurations = async (params = {}) => {
  const response = await api.get(
    'payments/tax-configurations/',
    { params }
  )
  return response.data
}

export const createTaxConfiguration = async (payload) => {
  const response = await api.post(
    'payments/tax-configurations/',
    payload
  )
  return response.data
}