import React from 'react';
import { VehicleVisit } from '../../types/carwash';
import { formatDateTime } from '../../utils/formatters';
import { Printer, CheckCircle2, Copy, X } from 'lucide-react';

interface CarwashReceiptModalProps {
  visit: VehicleVisit;
  changeGiven: number;
  onClose: () => void;
}

export const CarwashReceiptModal: React.FC<CarwashReceiptModalProps> = ({
  visit,
  changeGiven,
  onClose,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handlePrint = () => {
    window.print();
  };

  const receiptNo = visit.receiptNumber || `REC-NC-2026-${Math.floor(1000 + Math.random() * 9000)}`;

  const handleCopyText = () => {
    const lines = [
      '================================',
      '         NEV CARWASH',
      '  A Diamond Space Limited Branch',
      '      Kikuyu Town, Kenya',
      '   TEL: +254 700 800 900',
      '    VAT PIN: P051982344X',
      '================================',
      `RECEIPT: ${receiptNo}`,
      `DATE: ${formatDateTime(visit.createdAt)}`,
      `VEHICLE: ${visit.registrationPlate} (${visit.vehicleType.toUpperCase()})`,
      `CUSTOMER: ${visit.customerName}`,
      `SUPERVISOR: ${visit.supervisorName}`,
      `CLEANERS: ${visit.assignedCleaners.map((c) => c.name).join(', ')}`,
      '--------------------------------',
      'SERVICES:',
      ...visit.services.map((s) => ` ${s.serviceName.slice(0, 24).padEnd(24)} KSh ${s.price}`),
      '--------------------------------',
      `SUBTOTAL: KSh ${visit.subtotal}`,
      visit.bargainingDiscount > 0 ? `DISCOUNT: -KSh ${visit.bargainingDiscount}` : '',
      `VAT (16%): KSh ${Math.round(visit.vatTotal)}`,
      `TOTAL BILL: KSh ${visit.total}`,
      'PAYMENT DETAILS:',
      ...visit.payments.map((p) => ` ${p.method.toUpperCase()}: KSh ${p.amount} ${p.reference ? '(' + p.reference + ')' : ''}`),
      `CHANGE GIVEN: KSh ${changeGiven}`,
      '================================',
      'Thank you for washing with NEV CARWASH!',
      'Powered by Diamond Space Limited',
      '================================',
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Modal Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-semibold text-slate-100">Vehicle Service Bill Settled</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Thermal Paper Simulation */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-950/60 flex justify-center">
          <div
            id="printable-receipt"
            className="w-full max-w-[340px] bg-white text-slate-900 p-5 font-mono text-xs rounded shadow-lg border border-slate-300"
          >
            {/* Header Lockup */}
            <div className="text-center pb-3 border-b border-dashed border-slate-300 space-y-1">
              <div className="text-base font-extrabold tracking-tight text-slate-950">NEV CARWASH</div>
              <div className="text-[11px] font-bold text-slate-700">A Diamond Space Limited Branch</div>
              <div className="text-[10px] text-slate-500">Kikuyu Town, Kiambu County, Kenya</div>
              <div className="text-[10px] text-slate-500">Customer Helpline: +254 700 800 900</div>
              <div className="text-[10px] font-semibold text-slate-800 pt-0.5">
                KRA PIN / VAT REG: P051982344X
              </div>
            </div>

            {/* Receipt Details */}
            <div className="py-2 border-b border-dashed border-slate-300 text-[11px] space-y-0.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Receipt No:</span>
                <span className="font-bold text-slate-900">{receiptNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date &amp; Time:</span>
                <span>{formatDateTime(visit.createdAt)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-950">
                <span className="text-slate-600">Vehicle Plate:</span>
                <span className="text-sm bg-slate-100 px-1 rounded">{visit.registrationPlate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Vehicle Type:</span>
                <span className="capitalize">{visit.vehicleType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span>{visit.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cleaners:</span>
                <span className="truncate max-w-[180px]">
                  {visit.assignedCleaners.map((c) => c.name).join(', ')}
                </span>
              </div>
            </div>

            {/* Services List */}
            <div className="py-2 border-b border-dashed border-slate-300">
              <div className="flex justify-between text-[10px] font-bold text-slate-500 pb-1 border-b border-slate-200">
                <span>SERVICE AREA</span>
                <span>AMOUNT</span>
              </div>
              <div className="space-y-1.5 pt-1.5">
                {visit.services.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-[11px]">
                    <div className="max-w-[70%] font-medium text-slate-900 truncate">
                      {item.serviceName}
                    </div>
                    <div className="font-semibold text-slate-900 tabular-nums">
                      KSh {item.price.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financials & VAT */}
            <div className="py-2 border-b border-dashed border-slate-300 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">Subtotal (Exclusive)</span>
                <span className="tabular-nums font-medium">KSh {visit.subtotal.toLocaleString()}</span>
              </div>
              {visit.bargainingDiscount > 0 && (
                <div className="flex justify-between text-rose-700">
                  <span>Bargaining Discount</span>
                  <span className="tabular-nums">-KSh {visit.bargainingDiscount}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>VAT (16% Standard Rate)</span>
                <span className="tabular-nums font-medium">KSh {Math.round(visit.vatTotal)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-slate-300 text-slate-950">
                <span>TOTAL PAID</span>
                <span className="tabular-nums">KSh {visit.total.toLocaleString()}</span>
              </div>
            </div>

            {/* Payment Details */}
            <div className="py-2 border-b border-dashed border-slate-300 text-[11px] space-y-1">
              {visit.payments.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-slate-600 capitalize">
                    {p.method === 'mpesa' ? 'M-Pesa Paybill' : p.method}
                    {p.reference ? ` (${p.reference})` : ''}
                  </span>
                  <span className="font-semibold tabular-nums">KSh {p.amount.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-slate-900 pt-1">
                <span>Change Given</span>
                <span className="tabular-nums text-emerald-700">KSh {changeGiven}</span>
              </div>
            </div>

            {/* Footer Attribution */}
            <div className="pt-3 pb-1 text-center space-y-1.5">
              <div className="text-[10px] font-bold text-slate-800">
                Thank you for washing with NEV CARWASH!
              </div>
              <div className="text-[9px] text-slate-500 font-medium">
                Powered by Diamond Space Limited
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyText}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied ? 'Copied!' : 'Copy Text'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Print 80mm Receipt</span>
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
