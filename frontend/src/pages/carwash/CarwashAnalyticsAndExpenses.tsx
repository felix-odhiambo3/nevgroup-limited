import React, { useState } from 'react';
import { CarwashExpense, CleanerStaff, VehicleVisit } from '../../types/carwash';
import { posAudio } from '../../utils/audio';
import { formatDateTime } from '../../utils/formatters';
import {
  BarChart3,
  DollarSign,
  TrendingUp,
  Receipt,
  Plus,
  Car,
  Users,
  Calendar,
  Layers,
  Fuel,
  Zap,
  Droplets,
  Wrench,
  X,
} from 'lucide-react';

interface CarwashAnalyticsAndExpensesProps {
  visits: VehicleVisit[];
  expenses: CarwashExpense[];
  staff: CleanerStaff[];
  onSaveExpenses: (expenses: CarwashExpense[]) => void;
  onClose: () => void;
}

const EXPENSE_CATEGORIES: CarwashExpense['category'][] = [
  'Detergent & Shampoo',
  'Water Tanker Refill',
  'Electricity & Tokens',
  'Machine Maintenance',
  'Towels & Consumables',
  'Staff Allowance',
  'Other',
];

export const CarwashAnalyticsAndExpenses: React.FC<CarwashAnalyticsAndExpensesProps> = ({
  visits,
  expenses,
  staff,
  onSaveExpenses,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'expenses' | 'cleaners'>('overview');
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);

  // New expense form
  const [expenseCategory, setExpenseCategory] = useState<CarwashExpense['category']>('Water Tanker Refill');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseMethod, setExpenseMethod] = useState<'cash' | 'mpesa'>('mpesa');

  // Completed visits only
  const completedVisits = visits.filter((v) => v.status === 'completed');

  // Revenue metrics
  const totalRevenue = completedVisits.reduce((sum, v) => sum + v.total, 0);
  const totalVat = completedVisits.reduce((sum, v) => sum + v.vatTotal, 0);
  const totalCommissions = completedVisits.reduce((sum, v) => sum + v.totalCommission, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netOperatingProfit = totalRevenue - totalCommissions - totalExpenses;

  // Breakdown by payment methods
  const cashTotal = completedVisits.reduce((sum, v) => {
    return (
      sum +
      v.payments
        .filter((p) => p.method === 'cash')
        .reduce((sub, p) => sub + p.amount, 0)
    );
  }, 0);

  const mpesaTotal = completedVisits.reduce((sum, v) => {
    return (
      sum +
      v.payments
        .filter((p) => p.method === 'mpesa')
        .reduce((sub, p) => sub + p.amount, 0)
    );
  }, 0);

  const creditTotal = completedVisits.reduce((sum, v) => {
    return (
      sum +
      v.payments
        .filter((p) => p.method === 'credit')
        .reduce((sub, p) => sub + p.amount, 0)
    );
  }, 0);

  // Vehicle category breakdown
  const categoryCounts = completedVisits.reduce<Record<string, number>>((acc, v) => {
    acc[v.vehicleType] = (acc[v.vehicleType] || 0) + 1;
    return acc;
  }, {});

  // Handle Add Expense
  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseDesc.trim() || !expenseAmount) return;

    const newExp: CarwashExpense = {
      id: `exp_${Date.now()}`,
      category: expenseCategory,
      description: expenseDesc.trim(),
      amount: parseFloat(expenseAmount) || 0,
      paymentMethod: expenseMethod,
      date: new Date().toISOString(),
      recordedBy: 'Joseph Karanja (Supervisor)',
    };

    onSaveExpenses([newExp, ...expenses]);
    setIsAddExpenseOpen(false);
    setExpenseDesc('');
    setExpenseAmount('');
    posAudio.playSuccess();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900 text-slate-100 overflow-hidden">
      {/* Top Header Bar */}
      <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight">Operations &amp; Financial Analytics</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                Kikuyu Branch
              </span>
            </div>
            <p className="text-xs text-slate-400">
              NEV CARWASH · Diamond Space Limited | Real-Time Carwash Performance &amp; Commission Tracking
            </p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                activeTab === 'overview'
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('expenses')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                activeTab === 'expenses'
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Yard Expenses
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cleaners')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                activeTab === 'cleaners'
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Cleaner Commissions
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
          >
            Back to Bays
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KPI Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Gross Carwash Revenue</span>
              <DollarSign className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              KSh {totalRevenue.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>VAT Included (16%):</span>
              <span className="font-mono text-slate-400">KSh {totalVat.toLocaleString()}</span>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Cleaner Commissions (30%/35%)</span>
              <Users className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
              KSh {totalCommissions.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Allocated equally to assigned washers
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Yard Operational Expenses</span>
              <Receipt className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
              KSh {totalExpenses.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Water tankers, soap, tokens &amp; maintenance
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Net Operating Profit</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              KSh {netOperatingProfit.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Revenue minus commissions &amp; yard costs
            </div>
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Payment Method Breakdown */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-white mb-4">Payment Collections</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="text-xs text-slate-300 font-semibold">M-Pesa Daraja</span>
                  </div>
                  <span className="font-mono font-bold text-sm text-emerald-400">
                    KSh {mpesaTotal.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                    <span className="text-xs text-slate-300 font-semibold">Cash in Drawer</span>
                  </div>
                  <span className="font-mono font-bold text-sm text-cyan-400">
                    KSh {cashTotal.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-xs text-slate-300 font-semibold">Corporate Fleet Credit</span>
                  </div>
                  <span className="font-mono font-bold text-sm text-amber-400">
                    KSh {creditTotal.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Vehicle Volume by Category */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-white mb-4">Vehicle Category Volume</h3>
              <div className="space-y-2.5">
                {[
                  { cat: 'car', label: 'Sedan / Small Cars' },
                  { cat: 'suv', label: 'SUV / 4x4 / Pickups' },
                  { cat: 'bus', label: 'Matatus & Mini-Buses' },
                  { cat: 'motorcycle', label: 'Bodaboda / Motorcycles' },
                  { cat: 'truck', label: 'Commercial Trucks' },
                ].map(({ cat, label }) => {
                  const count = categoryCounts[cat] || 0;
                  const pct = completedVisits.length > 0 ? Math.round((count / completedVisits.length) * 100) : 0;
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300">{label}</span>
                        <span className="font-mono font-bold text-cyan-400">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cyan-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Cleaners Leaderboard */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-white mb-4">Top Cleaners Today</h3>
              <div className="space-y-2.5">
                {staff
                  .slice()
                  .sort((a, b) => b.totalCommissionsToday - a.totalCommissionsToday)
                  .slice(0, 5)
                  .map((cln, idx) => (
                    <div
                      key={cln.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-[10px] font-mono font-bold flex items-center justify-center text-slate-400">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-bold text-xs text-white">{cln.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {cln.vehiclesCompletedToday} cars completed
                          </div>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-xs text-cyan-400">
                        KSh {cln.totalCommissionsToday.toLocaleString()}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Carwash Operational Expenses</h3>
                <p className="text-xs text-slate-400">
                  Consumables, water bowser supplies, and yard overheads
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddExpenseOpen(true)}
                className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-cyan-950"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Yard Expense</span>
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-mono">
                  <tr>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Recorded By</th>
                    <th className="py-2.5 px-3">Method</th>
                    <th className="py-2.5 px-4 text-right">Amount (KSh)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-900/50">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">
                        {formatDateTime(exp.date)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-white">{exp.category}</td>
                      <td className="py-2.5 px-3 text-slate-300">{exp.description}</td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">{exp.recordedBy}</td>
                      <td className="py-2.5 px-3 uppercase text-[10px] font-mono">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            exp.paymentMethod === 'mpesa'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-cyan-500/10 text-cyan-400'
                          }`}
                        >
                          {exp.paymentMethod}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-400">
                        KSh {exp.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'cleaners' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white">Cleaner Commissions Breakdown</h3>
              <p className="text-xs text-slate-400">
                Calculated per vehicle based on Day shift (30%) and Night shift (35%) rates, split equally among assigned washers.
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-mono">
                  <tr>
                    <th className="py-2.5 px-4">Staff Number</th>
                    <th className="py-2.5 px-3">Name</th>
                    <th className="py-2.5 px-3">Shift</th>
                    <th className="py-2.5 px-3">Rate</th>
                    <th className="py-2.5 px-3">Vehicles Cleaned</th>
                    <th className="py-2.5 px-4 text-right">Commissions Owed (KSh)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {staff.map((cln) => (
                    <tr key={cln.id} className="hover:bg-slate-900/50">
                      <td className="py-2.5 px-4 font-mono text-slate-400">{cln.staffNumber}</td>
                      <td className="py-2.5 px-3 font-bold text-white">{cln.name}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            cln.assignedShift === 'DAY'
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-indigo-500/10 text-indigo-400'
                          }`}
                        >
                          {cln.assignedShift}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-400">
                        {cln.assignedShift === 'DAY' ? '30%' : '35%'}
                      </td>
                      <td className="py-2.5 px-3 font-mono">{cln.vehiclesCompletedToday} cars</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-cyan-400">
                        KSh {cln.totalCommissionsToday.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Add Expense */}
      {isAddExpenseOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <form
            onSubmit={handleAddExpense}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">Record Yard Operational Expense</h3>
              <button
                type="button"
                onClick={() => setIsAddExpenseOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
              <select
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value as CarwashExpense['category'])}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Description *</label>
              <input
                type="text"
                required
                placeholder="e.g. 10,000L clean borehole water tanker refill"
                value={expenseDesc}
                onChange={(e) => setExpenseDesc(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Amount (KSh) *</label>
                <input
                  type="number"
                  required
                  placeholder="2500"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Payment Method</label>
                <select
                  value={expenseMethod}
                  onChange={(e) => setExpenseMethod(e.target.value as 'cash' | 'mpesa')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="mpesa">M-Pesa</option>
                  <option value="cash">Cash in Drawer</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsAddExpenseOpen(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold"
              >
                Save Expense
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
