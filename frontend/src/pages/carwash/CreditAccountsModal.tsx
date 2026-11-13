import React, { useState } from 'react';
import { CustomerCreditAccount, VehicleVisit } from '../../types/carwash';
import { posAudio } from '../../utils/audio';
import { formatDateTime } from '../../utils/formatters';
import {
  Building2,
  DollarSign,
  Plus,
  Search,
  CheckCircle2,
  X,
  CreditCard,
  FileText,
  Phone,
  Car,
} from 'lucide-react';

interface CreditAccountsModalProps {
  creditAccounts: CustomerCreditAccount[];
  visits: VehicleVisit[];
  onSaveCreditAccounts: (accounts: CustomerCreditAccount[]) => void;
  onClose: () => void;
}

export const CreditAccountsModal: React.FC<CreditAccountsModalProps> = ({
  creditAccounts,
  visits,
  onSaveCreditAccounts,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>(creditAccounts[0]?.id || '');
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  // New Account Form State
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newLimit, setNewLimit] = useState('20000');
  const [newNotes, setNewNotes] = useState('');

  // Payment Settlement Form State
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa'>('mpesa');

  const selectedAccount = creditAccounts.find((a) => a.id === selectedAccountId);

  // Associated vehicle visits
  const accountVisits = visits.filter(
    (v) =>
      selectedAccount &&
      (v.customerName.toLowerCase() === selectedAccount.customerName.toLowerCase() ||
        (selectedAccount.companyName &&
          v.customerName.toLowerCase().includes(selectedAccount.companyName.toLowerCase())))
  );

  const filteredAccounts = creditAccounts.filter(
    (a) =>
      a.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.companyName && a.companyName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      a.phone.includes(searchTerm)
  );

  const totalOutstanding = creditAccounts.reduce((sum, a) => sum + a.outstandingBalance, 0);

  // Handle Create Account
  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim() || !newPhone.trim()) return;

    const newAcc: CustomerCreditAccount = {
      id: `cred_${Date.now()}`,
      customerName: newCustomerName.trim(),
      companyName: newCompany.trim() || undefined,
      phone: newPhone.trim(),
      creditLimit: parseFloat(newLimit) || 0,
      outstandingBalance: 0,
      totalInvoiced: 0,
      totalPaid: 0,
      visitsCount: 0,
      notes: newNotes.trim() || undefined,
    };

    const updated = [newAcc, ...creditAccounts];
    onSaveCreditAccounts(updated);
    setSelectedAccountId(newAcc.id);
    setIsNewAccountOpen(false);
    setNewCustomerName('');
    setNewPhone('');
    setNewCompany('');
    setNewNotes('');
    posAudio.playSuccess();
  };

  // Handle Record Payment / Settlement
  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    const amount = parseFloat(paymentAmount) || 0;
    if (amount <= 0) return;

    const updatedAccounts = creditAccounts.map((a) => {
      if (a.id === selectedAccount.id) {
        return {
          ...a,
          outstandingBalance: Math.max(0, a.outstandingBalance - amount),
          totalPaid: a.totalPaid + amount,
        };
      }
      return a;
    });

    onSaveCreditAccounts(updatedAccounts);
    setIsPaymentOpen(false);
    setPaymentAmount('');
    setPaymentRef('');
    posAudio.playDrawerBell();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-6xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Corporate &amp; Fleet Credit Accounts</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  Total Outstanding: KSh {totalOutstanding.toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                NEV CARWASH · Diamond Space Limited | Saccos, County Fleets &amp; Retainer Clients
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Layout: Left sidebar accounts, Right details */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Account List */}
          <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-950/60">
            <div className="p-3 border-b border-slate-800 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search fleets..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <button
                type="button"
                onClick={() => setIsNewAccountOpen(true)}
                className="p-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
                title="New Fleet Account"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
              {filteredAccounts.map((acc) => {
                const isSelected = acc.id === selectedAccountId;
                return (
                  <div
                    key={acc.id}
                    onClick={() => setSelectedAccountId(acc.id)}
                    className={`p-3.5 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-cyan-500/10 border-l-4 border-l-cyan-400 text-white'
                        : 'hover:bg-slate-900/60 text-slate-300'
                    }`}
                  >
                    <div className="font-bold text-xs truncate">{acc.customerName}</div>
                    {acc.companyName && (
                      <div className="text-[10px] text-cyan-400 font-medium truncate mt-0.5">
                        {acc.companyName}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Balance:</span>
                      <span
                        className={`font-mono font-bold ${
                          acc.outstandingBalance > 0 ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        KSh {acc.outstandingBalance.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Account Details, Invoices & Settlement */}
          <div className="flex-1 flex flex-col overflow-y-auto bg-slate-900/40 p-6">
            {selectedAccount ? (
              <div className="space-y-6">
                {/* Account Summary Banner */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-white">{selectedAccount.customerName}</h3>
                        {selectedAccount.companyName && (
                          <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                            {selectedAccount.companyName}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3 text-cyan-400" />
                          {selectedAccount.phone}
                        </span>
                        {selectedAccount.notes && (
                          <>
                            <span>•</span>
                            <span className="italic">{selectedAccount.notes}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsPaymentOpen(true)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-950"
                      >
                        <CreditCard className="w-4 h-4" />
                        <span>Record Settle Payment</span>
                      </button>
                    </div>
                  </div>

                  {/* Financial Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-800">
                    <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">Outstanding Balance</div>
                      <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">
                        KSh {selectedAccount.outstandingBalance.toLocaleString()}
                      </div>
                    </div>

                    <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">Credit Limit</div>
                      <div className="text-lg font-bold font-mono text-slate-200 mt-0.5">
                        KSh {selectedAccount.creditLimit.toLocaleString()}
                      </div>
                    </div>

                    <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">Total Invoiced (All-Time)</div>
                      <div className="text-lg font-bold font-mono text-cyan-400 mt-0.5">
                        KSh {selectedAccount.totalInvoiced.toLocaleString()}
                      </div>
                    </div>

                    <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">Fleet Wash Count</div>
                      <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                        {selectedAccount.visitsCount} visits
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fleet Visits History */}
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Car className="w-4 h-4 text-cyan-400" />
                    <span>Recent Vehicle Wash Invoices ({accountVisits.length})</span>
                  </h4>

                  {accountVisits.length === 0 ? (
                    <div className="p-8 text-center bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-500">
                      No active visits recorded under this corporate account yet.
                    </div>
                  ) : (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-mono">
                          <tr>
                            <th className="py-2.5 px-4">Plate / Visit</th>
                            <th className="py-2.5 px-3">Vehicle Type</th>
                            <th className="py-2.5 px-3">Services</th>
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-4 text-right">Invoice Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-300">
                          {accountVisits.map((v) => (
                            <tr key={v.id} className="hover:bg-slate-900/50">
                              <td className="py-2.5 px-4">
                                <div className="font-mono font-bold text-white text-sm">{v.registrationPlate}</div>
                                <div className="text-[10px] text-slate-500 font-mono">{v.visitNumber}</div>
                              </td>
                              <td className="py-2.5 px-3 uppercase text-[11px] font-semibold text-slate-400">
                                {v.vehicleType}
                              </td>
                              <td className="py-2.5 px-3 max-w-[200px] truncate text-[11px]">
                                {v.services.map((s) => s.serviceName).join(', ')}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px]">
                                {formatDateTime(v.createdAt)}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    v.status === 'completed'
                                      ? 'bg-emerald-500/10 text-emerald-400'
                                      : 'bg-amber-500/10 text-amber-400'
                                  }`}
                                >
                                  {v.status.replace('_', ' ').toUpperCase()}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-cyan-400">
                                KSh {v.total.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                Select a fleet account to view balance and invoices.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: New Fleet Account */}
      {isNewAccountOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateAccount}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">New Fleet Credit Account</h3>
              <button
                type="button"
                onClick={() => setIsNewAccountOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Account / Sacco / Client Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Kikuyu Express Matatu Sacco"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Registered Company / Fleet Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Kikuyu Express Sacco Ltd"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number *</label>
                <input
                  type="text"
                  required
                  placeholder="+254 720 000 000"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Credit Limit (KSh)</label>
                <input
                  type="number"
                  placeholder="50000"
                  value={newLimit}
                  onChange={(e) => setNewLimit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Account Notes / Terms</label>
              <textarea
                rows={2}
                placeholder="e.g. 14 Matatus in fleet. Monthly billing cycle."
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsNewAccountOpen(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold"
              >
                Create Account
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Settle Payment */}
      {isPaymentOpen && selectedAccount && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <form
            onSubmit={handleRecordPayment}
            className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-white text-sm">Record Debt Payment</h3>
                <p className="text-[11px] text-slate-400">{selectedAccount.customerName}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs flex justify-between">
              <span className="text-slate-400">Current Balance:</span>
              <span className="font-mono font-bold text-amber-400">
                KSh {selectedAccount.outstandingBalance.toLocaleString()}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Settlement Method</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('mpesa')}
                  className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                    paymentMethod === 'mpesa'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  M-Pesa Settle
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                    paymentMethod === 'cash'
                      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Cash Settle
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Amount Paid (KSh) *</label>
              <input
                type="number"
                required
                max={selectedAccount.outstandingBalance}
                placeholder="e.g. 5000"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white font-mono font-bold focus:outline-none focus:border-cyan-500"
              />
            </div>

            {paymentMethod === 'mpesa' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  M-Pesa Reference / Confirmation Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. QW928174GH"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsPaymentOpen(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold"
              >
                Confirm Settlement
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
