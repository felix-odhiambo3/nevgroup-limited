import React, { useState } from 'react';
import { PaymentTransaction, VehicleVisit } from '../../types/carwash';
import { posAudio } from '../../utils/audio';
import {
  Banknote,
  Smartphone,
  CreditCard,
  Plus,
  Trash2,
  Check,
  X,
  PhoneCall,
  ShieldCheck,
} from 'lucide-react';

interface CarwashPaymentModalProps {
  visit: VehicleVisit;
  onCompletePayment: (payments: PaymentTransaction[], changeGiven: number) => void;
  onClose: () => void;
}

export const CarwashPaymentModal: React.FC<CarwashPaymentModalProps> = ({
  visit,
  onCompletePayment,
  onClose,
}) => {
  const totalDue = visit.total;
  const [selectedMethod, setSelectedMethod] = useState<'cash' | 'mpesa' | 'credit'>('cash');
  const [tenderAmount, setTenderAmount] = useState<string>(totalDue.toString());
  const [paymentSplits, setPaymentSplits] = useState<PaymentTransaction[]>([]);
  
  // M-Pesa details
  const [mpesaPhone, setMpesaPhone] = useState(visit.customerPhone || '2547');
  const [mpesaRef, setMpesaRef] = useState('');
  const [isStkSending, setIsStkSending] = useState(false);
  const [stkSuccessNotice, setStkSuccessNotice] = useState<string | null>(null);

  const alreadyPaid = paymentSplits.reduce((acc, p) => acc + p.amount, 0);
  const remainingDue = Math.max(0, totalDue - alreadyPaid);

  const handleSimulateDarajaStkPush = () => {
    setIsStkSending(true);
    setStkSuccessNotice(null);
    posAudio.playScanBeep();

    setTimeout(() => {
      const generatedCode = `QA${Math.floor(10000000 + Math.random() * 90000000).toString().substring(0, 8)}`;
      setMpesaRef(generatedCode);
      setIsStkSending(false);
      setStkSuccessNotice(`Safaricom M-Pesa STK Verified: ${generatedCode}`);
      posAudio.playSuccess();
    }, 1200);
  };

  const handleAddSplit = () => {
    const val = parseFloat(tenderAmount);
    if (isNaN(val) || val <= 0) return;

    const newSplit: PaymentTransaction = {
      id: `pay_${Date.now()}`,
      method: selectedMethod,
      amount: val,
      reference: selectedMethod === 'mpesa' ? mpesaRef || `MPESA-${Date.now().toString().slice(-6)}` : undefined,
      mpesaPhone: selectedMethod === 'mpesa' ? mpesaPhone : undefined,
      timestamp: new Date().toISOString(),
      recordedBy: 'Joseph Karanja',
    };

    const nextSplits = [...paymentSplits, newSplit];
    setPaymentSplits(nextSplits);
    posAudio.playScanBeep();

    const nextPaid = nextSplits.reduce((acc, s) => acc + s.amount, 0);
    const nextRemaining = Math.max(0, totalDue - nextPaid);
    setTenderAmount(nextRemaining.toString());
    setMpesaRef('');
  };

  const handleRemoveSplit = (idx: number) => {
    const nextSplits = paymentSplits.filter((_, i) => i !== idx);
    setPaymentSplits(nextSplits);
    const nextPaid = nextSplits.reduce((acc, s) => acc + s.amount, 0);
    const nextRemaining = Math.max(0, totalDue - nextPaid);
    setTenderAmount(nextRemaining.toString());
  };

  const handleFinalize = () => {
    let finalSplits = [...paymentSplits];
    let change = 0;

    if (finalSplits.length === 0) {
      const val = parseFloat(tenderAmount);
      if (isNaN(val) || val < totalDue) return;

      finalSplits.push({
        id: `pay_${Date.now()}`,
        method: selectedMethod,
        amount: val,
        reference: selectedMethod === 'mpesa' ? mpesaRef || `MPESA-${Date.now().toString().slice(-6)}` : undefined,
        mpesaPhone: selectedMethod === 'mpesa' ? mpesaPhone : undefined,
        timestamp: new Date().toISOString(),
        recordedBy: 'Joseph Karanja',
      });
      change = Math.max(0, val - totalDue);
    } else {
      const totalTendered = finalSplits.reduce((acc, s) => acc + s.amount, 0);
      change = Math.max(0, totalTendered - totalDue);
    }

    posAudio.playDrawerKick();
    onCompletePayment(finalSplits, change);
  };

  const currentTenderVal = parseFloat(tenderAmount) || 0;
  const currentTotalProvided = alreadyPaid + currentTenderVal;
  const totalChangeDue = Math.max(0, currentTotalProvided - totalDue);
  const canComplete = paymentSplits.length > 0 ? alreadyPaid >= totalDue : currentTenderVal >= totalDue;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div>
            <h2 className="text-base font-bold text-slate-100">Vehicle Settlement &amp; Payment</h2>
            <p className="text-xs text-slate-400">
              Vehicle: <span className="font-mono font-bold text-cyan-400">{visit.registrationPlate}</span> · {visit.customerName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 text-xs bg-slate-900">
          {/* Left Column: Methods & Input (7 cols) */}
          <div className="md:col-span-7 space-y-4">
            {/* Total Box */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">TOTAL BILL (INCL. 16% VAT)</span>
                <span className="text-2xl font-extrabold text-cyan-400 tabular-nums">
                  KSh {totalDue.toLocaleString()}
                </span>
              </div>
              {alreadyPaid > 0 && (
                <div className="text-right">
                  <span className="text-[11px] text-emerald-400 block font-medium">REMAINING DUE</span>
                  <span className="text-lg font-bold text-emerald-400 tabular-nums">
                    KSh {remainingDue.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Method Tabs */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold block">Select Tender Type</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMethod('cash')}
                  className={`p-3 rounded-xl border font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                    selectedMethod === 'cash'
                      ? 'border-cyan-500 bg-cyan-950/40 text-cyan-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Banknote className="w-5 h-5" />
                  <span>Cash</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedMethod('mpesa')}
                  className={`p-3 rounded-xl border font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                    selectedMethod === 'mpesa'
                      ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                  <span>M-Pesa (Daraja)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedMethod('credit')}
                  disabled={!visit.isCreditCustomer}
                  className={`p-3 rounded-xl border font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                    selectedMethod === 'credit'
                      ? 'border-amber-500 bg-amber-950/40 text-amber-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed'
                  }`}
                >
                  <CreditCard className="w-5 h-5" />
                  <span>Credit Tab</span>
                </button>
              </div>
            </div>

            {/* M-Pesa STK Push Section */}
            {selectedMethod === 'mpesa' && (
              <div className="p-3 bg-emerald-950/30 border border-emerald-900/60 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-emerald-300">Safaricom Daraja Paybill Integration</span>
                  <button
                    type="button"
                    onClick={handleSimulateDarajaStkPush}
                    disabled={isStkSending}
                    className="text-[11px] text-emerald-400 underline font-bold"
                  >
                    {isStkSending ? 'Sending Prompt...' : 'Send STK Prompt'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Customer Mobile</label>
                    <input
                      type="text"
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value)}
                      placeholder="2547..."
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">M-Pesa Code</label>
                    <input
                      type="text"
                      value={mpesaRef}
                      onChange={(e) => setMpesaRef(e.target.value)}
                      placeholder="e.g. QW928174GH"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-white font-mono uppercase"
                    />
                  </div>
                </div>
                {stkSuccessNotice && (
                  <div className="text-[10px] text-emerald-300 font-semibold">{stkSuccessNotice}</div>
                )}
              </div>
            )}

            {/* Amount Tendered */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-slate-300 font-semibold">Tender Amount (KSh)</label>
                <button
                  type="button"
                  onClick={() => setTenderAmount(remainingDue.toString())}
                  className="text-cyan-400 hover:underline"
                >
                  Exact ({remainingDue} KSh)
                </button>
              </div>
              <input
                type="number"
                value={tenderAmount}
                onChange={(e) => setTenderAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-lg font-bold text-white tabular-nums focus:outline-none focus:border-cyan-500"
              />

              {/* Quick Cash Buttons */}
              {selectedMethod === 'cash' && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[200, 500, 1000, 2000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setTenderAmount(amt.toString())}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-semibold text-[11px]"
                    >
                      KSh {amt}
                    </button>
                  ))}
                </div>
              )}

              {/* Add Split Button */}
              <button
                type="button"
                onClick={handleAddSplit}
                disabled={!tenderAmount || parseFloat(tenderAmount) <= 0}
                className="w-full flex items-center justify-center gap-1.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold transition-colors border border-slate-700 mt-2"
              >
                <Plus className="w-3.5 h-3.5 text-cyan-400" />
                <span>Add as Split Payment</span>
              </button>
            </div>
          </div>

          {/* Right Column: Splits Breakdown & Complete (5 cols) */}
          <div className="md:col-span-5 bg-slate-950/80 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <h3 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                Payment Summary
              </h3>

              {paymentSplits.length === 0 ? (
                <div className="p-3 text-slate-500 text-center border border-dashed border-slate-800 rounded-lg text-[11px]">
                  Single tender mode. Or click &quot;Add as Split&quot; to combine Cash &amp; M-Pesa.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {paymentSplits.map((split, i) => (
                    <div
                      key={i}
                      className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex justify-between items-center text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-200 uppercase">{split.method}</span>
                        {split.reference && (
                          <span className="text-[10px] text-slate-400 block font-mono">{split.reference}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-100 tabular-nums">KSh {split.amount}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSplit(i)}
                          className="text-rose-400 hover:text-rose-300 p-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Balance & Change */}
              <div className="pt-2 border-t border-slate-800 space-y-1 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Total Due</span>
                  <span className="font-semibold tabular-nums">KSh {totalDue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Tendered</span>
                  <span className="font-semibold text-slate-200 tabular-nums">
                    KSh {paymentSplits.length > 0 ? alreadyPaid : currentTenderVal}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold text-sm pt-1 border-t border-slate-800">
                  <span>Change Given</span>
                  <span className="tabular-nums">KSh {totalChangeDue.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleFinalize}
              disabled={!canComplete}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition-all shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Check className="w-4 h-4" />
              <span>Complete Payment &amp; Issue Receipt</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
