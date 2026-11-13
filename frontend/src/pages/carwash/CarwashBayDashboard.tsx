import React, { useState } from 'react';
import {
  CarwashService,
  CleanerStaff,
  CustomerCreditAccount,
  ShiftType,
  VehicleVisit,
  PaymentTransaction,
} from '../../types/carwash';
import { posAudio } from '../../utils/audio';
import {
  Car,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  CreditCard,
  Users,
  Eye,
  Layers,
  Sparkles,
} from 'lucide-react';
import { VehicleEntryModal } from './VehicleEntryModal';
import { CarwashPaymentModal } from './CarwashPaymentModal';
import { CarwashReceiptModal } from './CarwashReceiptModal';

interface CarwashBayDashboardProps {
  visits: VehicleVisit[];
  services: CarwashService[];
  staff: CleanerStaff[];
  creditAccounts: CustomerCreditAccount[];
  activeShift: ShiftType;
  onSaveVisits: (visits: VehicleVisit[]) => void;
  onUpdateCreditAccounts: (accounts: CustomerCreditAccount[]) => void;
  onUpdateStaff: (staff: CleanerStaff[]) => void;
}

export const CarwashBayDashboard: React.FC<CarwashBayDashboardProps> = ({
  visits,
  services,
  staff,
  creditAccounts,
  activeShift,
  onSaveVisits,
  onUpdateCreditAccounts,
  onUpdateStaff,
}) => {
  const [searchPlate, setSearchPlate] = useState('');
  const [filterLane, setFilterLane] = useState<'all' | 'in_progress' | 'ready_for_payment' | 'completed'>('all');

  // Modals
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [settlingVisit, setSettlingVisit] = useState<VehicleVisit | null>(null);
  const [receiptVisit, setReceiptVisit] = useState<VehicleVisit | null>(null);
  const [lastChange, setLastChange] = useState<number>(0);

  // Filter visits
  const filtered = visits.filter((v) => {
    const matchesPlate =
      !searchPlate ||
      v.registrationPlate.includes(searchPlate.toUpperCase()) ||
      v.customerName.toLowerCase().includes(searchPlate.toLowerCase());
    const matchesLane = filterLane === 'all' || v.status === filterLane;
    return matchesPlate && matchesLane;
  });

  // Calculate high-level carwash stats
  const inBayCount = visits.filter((v) => v.status === 'in_progress' || v.status === 'waiting').length;
  const readyCount = visits.filter((v) => v.status === 'ready_for_payment').length;
  const completedTodayCount = visits.filter((v) => v.status === 'completed').length;
  const totalRevenueToday = visits
    .filter((v) => v.status === 'completed')
    .reduce((sum, v) => sum + v.total, 0);
  const totalCommissionsEarnedToday = visits
    .filter((v) => v.status === 'completed')
    .reduce((sum, v) => sum + v.totalCommission, 0);

  // Status transitions
  const handleUpdateStatus = (visitId: string, newStatus: VehicleVisit['status']) => {
    const updated = visits.map((v) => {
      if (v.id === visitId) {
        return {
          ...v,
          status: newStatus,
          completedAt: newStatus === 'completed' ? new Date().toISOString() : v.completedAt,
        };
      }
      return v;
    });

    onSaveVisits(updated);
    posAudio.playScanBeep();
  };

  // Handle Payment Finish
  const handleCompletePayment = (payments: PaymentTransaction[], changeGiven: number) => {
    if (!settlingVisit) return;

    const receiptNo = `REC-NC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const updatedVisit: VehicleVisit = {
      ...settlingVisit,
      status: 'completed',
      completedAt: new Date().toISOString(),
      payments: [...settlingVisit.payments, ...payments],
      amountPaid: settlingVisit.total,
      outstandingBalance: 0,
      receiptNumber: receiptNo,
    };

    const nextVisits = visits.map((v) => (v.id === settlingVisit.id ? updatedVisit : v));
    onSaveVisits(nextVisits);

    // Update cleaner commissions
    const updatedStaff = staff.map((s) => {
      const allocation = updatedVisit.cleanerAllocations.find((a) => a.cleanerId === s.id);
      if (allocation) {
        return {
          ...s,
          totalCommissionsToday: s.totalCommissionsToday + allocation.allocatedAmount,
          vehiclesCompletedToday: s.vehiclesCompletedToday + 1,
        };
      }
      return s;
    });
    onUpdateStaff(updatedStaff);

    // If payment was charged to credit account, increment customer credit balance
    const creditPayment = payments.find((p) => p.method === 'credit');
    if (creditPayment && updatedVisit.isCreditCustomer) {
      const updatedCreditAccs = creditAccounts.map((acc) => {
        if (acc.customerName === updatedVisit.customerName) {
          return {
            ...acc,
            outstandingBalance: acc.outstandingBalance + creditPayment.amount,
            totalInvoiced: acc.totalInvoiced + creditPayment.amount,
            visitsCount: acc.visitsCount + 1,
          };
        }
        return acc;
      });
      onUpdateCreditAccounts(updatedCreditAccs);
    }

    setLastChange(changeGiven);
    setReceiptVisit(updatedVisit);
    setSettlingVisit(null);
    posAudio.playSuccess();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-900">
      {/* Top Operations Bar */}
      <div className="p-4 border-b border-slate-800 bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-100">Washing Bays &amp; Vehicle Queue</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                Shift: {activeShift} (Commission: {activeShift === 'DAY' ? '30%' : '35%'})
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Diamond Space Kikuyu Branch · Kikuyu Town, Kenya
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setIsEntryOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-cyan-950 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Vehicle Arrival / Bay Entry</span>
          </button>
        </div>
      </div>

      {/* KPI Counters Strip */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/60 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
          <span className="text-[11px] text-slate-400 block font-medium">Vehicles In Bay / Washing</span>
          <span className="text-lg font-bold text-cyan-400 tabular-nums">{inBayCount}</span>
        </div>

        <div className="p-2.5 bg-slate-900/80 rounded-xl border border-amber-900/50">
          <span className="text-[11px] text-amber-400 block font-medium">Ready For Payment</span>
          <span className="text-lg font-bold text-amber-400 tabular-nums">{readyCount}</span>
        </div>

        <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
          <span className="text-[11px] text-slate-400 block font-medium">Completed Today</span>
          <span className="text-lg font-bold text-slate-100 tabular-nums">{completedTodayCount}</span>
        </div>

        <div className="p-2.5 bg-slate-900/80 rounded-xl border border-emerald-900/50">
          <span className="text-[11px] text-emerald-400 block font-medium">Cleaners Commission Tally</span>
          <span className="text-lg font-extrabold text-emerald-400 tabular-nums">
            KSh {totalCommissionsEarnedToday.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Search & Filter Strip */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/40 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search registration plate (e.g. KDA 123A) or customer..."
            value={searchPlate}
            onChange={(e) => setSearchPlate(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-medium uppercase"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setFilterLane('all')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              filterLane === 'all'
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            All Vehicles ({visits.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterLane('in_progress')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              filterLane === 'in_progress'
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            In Progress
          </button>
          <button
            type="button"
            onClick={() => setFilterLane('ready_for_payment')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              filterLane === 'ready_for_payment'
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Ready for Payment
          </button>
          <button
            type="button"
            onClick={() => setFilterLane('completed')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              filterLane === 'completed'
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Completed
          </button>
        </div>
      </div>

      {/* Main Visits Grid */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {filtered.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500">
            <Car className="w-12 h-12 text-slate-800 mb-2" />
            <p className="text-xs font-semibold">No vehicle visits found matching this filter.</p>
            <p className="text-[11px] text-slate-600 mt-1">
              Click &quot;+ Vehicle Arrival / Bay Entry&quot; above to log an arriving car.
            </p>
          </div>
        ) : (
          filtered.map((visit) => {
            const isCompleted = visit.status === 'completed';
            const isReady = visit.status === 'ready_for_payment';
            const isInProgress = visit.status === 'in_progress';

            return (
              <div
                key={visit.id}
                className={`p-4 rounded-xl border transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 ${
                  isReady
                    ? 'border-amber-800/80 bg-amber-950/20'
                    : isCompleted
                    ? 'border-slate-800 bg-slate-950/60'
                    : 'border-cyan-900/60 bg-slate-950'
                }`}
              >
                {/* Left: Vehicle & Customer */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-extrabold text-white bg-slate-900 px-2.5 py-1 rounded-md border border-slate-700 tracking-wider">
                      {visit.registrationPlate}
                    </span>
                    <span className="text-xs font-bold text-slate-300 capitalize">
                      {visit.vehicleType}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isCompleted
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : isReady
                          ? 'bg-amber-950 text-amber-400 border border-amber-800'
                          : 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                      }`}
                    >
                      {visit.status.replace('_', ' ')}
                    </span>
                    {visit.isCreditCustomer && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                        CREDIT ACC
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                    <span>Customer: <strong className="text-slate-200">{visit.customerName}</strong></span>
                    <span>·</span>
                    <span>Visit: <span className="font-mono">{visit.visitNumber}</span></span>
                  </div>

                  {/* Special Concerns & Mat inspection */}
                  {(visit.no_plastic_mat || visit.no_woolen_mat || visit.special_concerns) && (
                    <div className="text-[11px] text-amber-300 bg-amber-950/30 px-2 py-1 rounded border border-amber-900/40 inline-block">
                      {visit.no_plastic_mat && '· No Plastic Mat '}
                      {visit.no_woolen_mat && '· No Woolen Mat '}
                      {visit.special_concerns && `· Inspection Note: "${visit.special_concerns}"`}
                    </div>
                  )}

                  {/* Services & Cleaners */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                    <span className="text-slate-500 font-medium">Services:</span>
                    {visit.services.map((s, idx) => (
                      <span key={idx} className="bg-slate-900 px-2 py-0.5 rounded text-slate-300 border border-slate-800">
                        {s.serviceName}
                      </span>
                    ))}
                  </div>

                  {/* Cleaners & Commission */}
                  <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-slate-500 font-medium">Cleaners:</span>
                    {visit.assignedCleaners.map((cln, i) => (
                      <span key={i} className="text-emerald-300 font-medium">
                        {cln.name} ({cln.assignedShift})
                        {i < visit.assignedCleaners.length - 1 ? ',' : ''}
                      </span>
                    ))}
                    <span className="text-slate-500 ml-1">
                      (Commission: KSh {visit.totalCommission} · KSh {(visit.totalCommission / (visit.assignedCleaners.length || 1)).toFixed(1)} each)
                    </span>
                  </div>
                </div>

                {/* Right: Bill Amount & Action Buttons */}
                <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-end border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-800">
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Total (VAT 16%)</div>
                    <div className="text-lg font-extrabold text-cyan-400 tabular-nums">
                      KSh {visit.total.toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Status actions */}
                    {isInProgress && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(visit.id, 'ready_for_payment')}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Finish Cleaning</span>
                      </button>
                    )}

                    {isReady && (
                      <button
                        type="button"
                        onClick={() => setSettlingVisit(visit)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                      >
                        <CreditCard className="w-4 h-4" />
                        <span>Settle Bill / Pay</span>
                      </button>
                    )}

                    {isCompleted && (
                      <button
                        type="button"
                        onClick={() => setReceiptVisit(visit)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors border border-slate-700"
                      >
                        <Eye className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Receipt</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Vehicle Entry Modal */}
      {isEntryOpen && (
        <VehicleEntryModal
          services={services}
          staff={staff}
          creditAccounts={creditAccounts}
          activeShift={activeShift}
          onSaveVisit={(newVisit) => onSaveVisits([newVisit, ...visits])}
          onClose={() => setIsEntryOpen(false)}
        />
      )}

      {/* Payment Checkout Modal */}
      {settlingVisit && (
        <CarwashPaymentModal
          visit={settlingVisit}
          onCompletePayment={handleCompletePayment}
          onClose={() => setSettlingVisit(null)}
        />
      )}

      {/* Receipt Modal */}
      {receiptVisit && (
        <CarwashReceiptModal
          visit={receiptVisit}
          changeGiven={lastChange}
          onClose={() => setReceiptVisit(null)}
        />
      )}
    </div>
  );
};
