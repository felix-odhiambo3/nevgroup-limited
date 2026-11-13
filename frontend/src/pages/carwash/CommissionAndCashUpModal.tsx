import React, { useState } from 'react';
import { CashUpReconciliation, CleanerStaff, ShiftType, VehicleVisit } from '../../types/carwash';
import { posAudio } from '../../utils/audio';
import { formatDateTime } from '../../utils/formatters';
import {
  DollarSign,
  Users,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Lock,
  FileText,
  X,
  ArrowRight,
} from 'lucide-react';

interface CommissionAndCashUpModalProps {
  cashUp: CashUpReconciliation;
  staff: CleanerStaff[];
  visits: VehicleVisit[];
  activeShift: ShiftType;
  onSaveCashUp: (cashUp: CashUpReconciliation) => void;
  onClose: () => void;
}

export const CommissionAndCashUpModal: React.FC<CommissionAndCashUpModalProps> = ({
  cashUp,
  staff,
  visits,
  activeShift,
  onSaveCashUp,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'cashup' | 'commissions' | 'zreport'>('cashup');
  const [countedCash, setCountedCash] = useState<string>(cashUp.actualCashCounted.toString());
  const [cashupNotes, setCashupNotes] = useState(cashUp.notes || '');

  // Calculate actual financial totals from completed visits
  const completedVisits = visits.filter((v) => v.status === 'completed');

  const totalCashCollected = completedVisits.reduce((acc, v) => {
    return (
      acc +
      v.payments
        .filter((p) => p.method === 'cash')
        .reduce((sum, p) => sum + p.amount, 0)
    );
  }, 0);

  const totalMpesaCollected = completedVisits.reduce((acc, v) => {
    return (
      acc +
      v.payments
        .filter((p) => p.method === 'mpesa')
        .reduce((sum, p) => sum + p.amount, 0)
    );
  }, 0);

  const totalCreditIssued = completedVisits.reduce((acc, v) => {
    return (
      acc +
      v.payments
        .filter((p) => p.method === 'credit')
        .reduce((sum, p) => sum + p.amount, 0)
    );
  }, 0);

  const totalCommissionsOwed = completedVisits.reduce((sum, v) => sum + v.totalCommission, 0);

  const expectedCashInDrawer = cashUp.openingFloat + totalCashCollected - cashUp.expensesPaid;
  const countedNum = parseFloat(countedCash) || 0;
  const variance = countedNum - expectedCashInDrawer;

  const handleFinalizeCashUp = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: CashUpReconciliation = {
      ...cashUp,
      cashSales: totalCashCollected,
      mpesaSales: totalMpesaCollected,
      creditSales: totalCreditIssued,
      totalSales: totalCashCollected + totalMpesaCollected + totalCreditIssued,
      cleanerCommissionsPaid: totalCommissionsOwed,
      expectedCashInDrawer,
      actualCashCounted: countedNum,
      variance,
      status: 'closed',
      notes: cashupNotes,
      closedAt: new Date().toISOString(),
    };

    onSaveCashUp(updated);
    posAudio.playSuccess();
    setActiveTab('zreport');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div>
            <h2 className="text-base font-bold text-slate-100">
              Shift Cash-Up &amp; Cleaner Commission Reconciliation
            </h2>
            <p className="text-xs text-slate-400">
              NEV CARWASH · Shift: <span className="text-amber-400 font-bold">{activeShift}</span> · Kikuyu Town
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Strip */}
        <div className="px-6 py-2 border-b border-slate-800 bg-slate-950/40 flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('cashup')}
            className={`px-3 py-1.5 font-semibold rounded-lg transition-colors ${
              activeTab === 'cashup'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Daily Cash-Up &amp; Drawer Arqueo
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('commissions')}
            className={`px-3 py-1.5 font-semibold rounded-lg transition-colors ${
              activeTab === 'commissions'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Cleaners Commission Tally ({activeShift === 'DAY' ? '30%' : '35%'})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('zreport')}
            className={`px-3 py-1.5 font-semibold rounded-lg transition-colors ${
              activeTab === 'zreport'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Fiscal Z-Report
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1 text-xs space-y-5 bg-slate-900">
          {activeTab === 'cashup' && (
            <form onSubmit={handleFinalizeCashUp} className="space-y-4">
              {/* Financial Breakdown Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-medium">Opening Cash Float</span>
                  <span className="text-lg font-bold text-slate-100 tabular-nums">
                    KSh {cashUp.openingFloat.toLocaleString()}
                  </span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-medium">Cash Collected</span>
                  <span className="text-lg font-bold text-cyan-400 tabular-nums">
                    KSh {totalCashCollected.toLocaleString()}
                  </span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-emerald-900/60">
                  <span className="text-[11px] text-emerald-400 block font-medium">M-Pesa (Daraja) Total</span>
                  <span className="text-lg font-bold text-emerald-400 tabular-nums">
                    KSh {totalMpesaCollected.toLocaleString()}
                  </span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-amber-900/60">
                  <span className="text-[11px] text-amber-400 block font-medium">Corporate Credit Sales</span>
                  <span className="text-lg font-bold text-amber-400 tabular-nums">
                    KSh {totalCreditIssued.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Drawer Cash Arqueo */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                    Expected Physical Cash in Drawer
                  </span>
                  <span className="text-xl font-extrabold text-cyan-400 tabular-nums">
                    KSh {expectedCashInDrawer.toLocaleString()}
                  </span>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Actual Physical Cash Counted (KSh)
                  </label>
                  <input
                    type="number"
                    required
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-lg font-bold text-white tabular-nums focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Variance Display */}
                <div
                  className={`p-3 rounded-lg border font-semibold flex justify-between items-center ${
                    variance === 0
                      ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                      : variance > 0
                      ? 'border-cyan-800 bg-cyan-950/40 text-cyan-300'
                      : 'border-rose-800 bg-rose-950/40 text-rose-300'
                  }`}
                >
                  <span>
                    {variance === 0
                      ? 'Drawer is Balanced (Exact match)'
                      : variance > 0
                      ? 'Cash Overage in Drawer'
                      : 'Cash Shortage in Drawer'}
                  </span>
                  <span className="font-mono text-sm">
                    {variance >= 0 ? '+' : ''}KSh {variance.toLocaleString()}
                  </span>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Shift Handover / Cash-Up Notes</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Verified float, cash deposited in safe, handover to night supervisor."
                    value={cashupNotes}
                    onChange={(e) => setCashupNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs transition-colors shadow-md"
                >
                  Close Shift &amp; Generate Z-Report
                </button>
              </div>
            </form>
          )}

          {activeTab === 'commissions' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                  Cleaners Individual Commission Ledger (Section 5)
                </span>
                <span className="text-slate-400">
                  Total Commissions: <strong className="text-emerald-400">KSh {totalCommissionsOwed.toLocaleString()}</strong>
                </span>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-3">Staff No</th>
                      <th className="p-3">Cleaner Name</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Assigned Shift</th>
                      <th className="p-3 text-center">Vehicles Done</th>
                      <th className="p-3 text-right">Commission Rate</th>
                      <th className="p-3 text-right">Earned Today</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {staff.map((cln) => (
                      <tr key={cln.id} className="hover:bg-slate-900/40">
                        <td className="p-3 font-mono text-slate-400">{cln.staffNumber}</td>
                        <td className="p-3 font-semibold text-slate-100">{cln.name}</td>
                        <td className="p-3 text-slate-400">{cln.role}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              cln.assignedShift === 'DAY'
                                ? 'bg-amber-950 text-amber-400'
                                : 'bg-blue-950 text-blue-400'
                            }`}
                          >
                            {cln.assignedShift}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-slate-200">{cln.vehiclesCompletedToday}</td>
                        <td className="p-3 text-right font-mono text-slate-400">
                          {cln.assignedShift === 'DAY' ? '30%' : '35%'}
                        </td>
                        <td className="p-3 text-right font-extrabold text-emerald-400 tabular-nums">
                          KSh {cln.totalCommissionsToday.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'zreport' && (
            <div className="space-y-4 max-w-md mx-auto">
              <div className="bg-white text-slate-900 p-5 rounded font-mono text-xs space-y-2 shadow-lg border border-slate-300">
                <div className="text-center font-bold pb-2 border-b border-dashed border-slate-300">
                  <div className="text-sm">NEV CARWASH</div>
                  <div className="text-[10px] font-normal text-slate-600">
                    DAILY SHIFT RECONCILIATION Z-REPORT
                  </div>
                  <div className="text-[10px] text-slate-500">Diamond Space Kikuyu Branch</div>
                </div>

                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span>Shift:</span>
                    <span>{cashUp.shiftType} SHIFT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Date:</span>
                    <span>{cashUp.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Supervisor:</span>
                    <span>{cashUp.supervisorName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Vehicles Completed:</span>
                    <span>{completedVisits.length}</span>
                  </div>
                </div>

                <div className="py-2 border-t border-b border-dashed border-slate-300 space-y-1 text-[11px]">
                  <div className="flex justify-between font-bold">
                    <span>TOTAL SALES</span>
                    <span>KSh {(totalCashCollected + totalMpesaCollected + totalCreditIssued).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-2">
                    <span>Cash Sales</span>
                    <span>KSh {totalCashCollected.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-2">
                    <span>M-Pesa (Daraja)</span>
                    <span>KSh {totalMpesaCollected.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-2">
                    <span>Corporate Credit</span>
                    <span>KSh {totalCreditIssued.toLocaleString()}</span>
                  </div>
                </div>

                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span>Opening Float:</span>
                    <span>KSh {cashUp.openingFloat.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Expected Drawer Cash:</span>
                    <span>KSh {expectedCashInDrawer.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Counted Cash:</span>
                    <span>KSh {countedNum.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-bold pt-1 border-t border-slate-300">
                    <span>Variance:</span>
                    <span>{variance >= 0 ? '+' : ''}KSh {variance.toLocaleString()}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-dashed border-slate-300 text-center text-[10px] text-slate-500">
                  Powered by Diamond Space Limited
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Z-Report</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
