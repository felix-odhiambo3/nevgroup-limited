import React, { useState } from 'react';
import {
  CarwashService,
  CleanerStaff,
  CustomerCreditAccount,
  ShiftType,
  VehicleCategory,
  VehicleVisit,
} from '../../types/carwash';
import { posAudio } from '../../utils/audio';
import {
  Car,
  Camera,
  Check,
  Plus,
  Users,
  Percent,
  Sparkles,
  AlertTriangle,
  X,
  CreditCard,
  ShieldCheck,
  ScanLine,
} from 'lucide-react';

interface VehicleEntryModalProps {
  services: CarwashService[];
  staff: CleanerStaff[];
  creditAccounts: CustomerCreditAccount[];
  activeShift: ShiftType;
  onSaveVisit: (visit: VehicleVisit) => void;
  onClose: () => void;
}

export const VehicleEntryModal: React.FC<VehicleEntryModalProps> = ({
  services,
  staff,
  creditAccounts,
  activeShift,
  onSaveVisit,
  onClose,
}) => {
  // Vehicle details
  const [registrationPlate, setRegistrationPlate] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleCategory>('car');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isCreditCustomer, setIsCreditCustomer] = useState(false);
  const [selectedCreditAccountId, setSelectedCreditAccountId] = useState(creditAccounts[0]?.id || '');

  // Inspection check fields (Section 4.1)
  const [noPlasticMat, setNoPlasticMat] = useState(false);
  const [noWoolenMat, setNoWoolenMat] = useState(false);
  const [specialConcerns, setSpecialConcerns] = useState('');

  // Selected Services
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  // Assigned Cleaners (Multi-cleaner supported)
  const [assignedCleanerIds, setAssignedCleanerIds] = useState<string[]>([]);
  const [shiftSelection, setShiftSelection] = useState<ShiftType>(activeShift);

  // Discounts
  const [bargainingDiscount, setBargainingDiscount] = useState<number>(0);
  const [loyaltyBenefit, setLoyaltyBenefit] = useState<number>(0);

  // AI Vehicle Plate Scan Simulation
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [aiScanFeedback, setAiScanFeedback] = useState<string | null>(null);

  // Filter services for the selected vehicle type
  const availableServices = services.filter((s) => s.category === vehicleType || s.category === 'car');

  // Filter available staff clocked in
  const availableCleaners = staff.filter((s) => s.role === 'CLEANER' || s.role === 'DETAILER');

  // Calculate financials
  const selectedServicesList = services.filter((s) => selectedServiceIds.includes(s.id));
  const subtotal = selectedServicesList.reduce((sum, s) => sum + s.basePrice, 0);

  // Commission Engine Rules (Section 5):
  // Day shift: 30%, Night shift: 35%
  const commissionRate = shiftSelection === 'DAY' ? 0.30 : 0.35;
  // Bargaining discount reduces commission base; loyalty benefit does NOT reduce commission base
  const commissionBase = Math.max(0, subtotal - bargainingDiscount);
  const totalCommission = commissionBase * commissionRate;

  // Split equally among assigned cleaners
  const assignedCleanersCount = assignedCleanerIds.length;
  const perCleanerCommission = assignedCleanersCount > 0 ? totalCommission / assignedCleanersCount : 0;

  // VAT (16% standard)
  const vatRate = 0.16;
  const vatTotal = (subtotal - bargainingDiscount - loyaltyBenefit) * vatRate;
  const grandTotal = Math.max(0, subtotal - bargainingDiscount - loyaltyBenefit + vatTotal);

  const handleToggleService = (serviceId: string) => {
    if (selectedServiceIds.includes(serviceId)) {
      setSelectedServiceIds(selectedServiceIds.filter((id) => id !== serviceId));
    } else {
      setSelectedServiceIds([...selectedServiceIds, serviceId]);
      posAudio.playScanBeep();
    }
  };

  const handleToggleCleaner = (cleanerId: string) => {
    if (assignedCleanerIds.includes(cleanerId)) {
      setAssignedCleanerIds(assignedCleanerIds.filter((id) => id !== cleanerId));
    } else {
      setAssignedCleanerIds([...assignedCleanerIds, cleanerId]);
      posAudio.playScanBeep();
    }
  };

  // AI License Plate & Vehicle Scanner Simulation (Section 17 - FastAPI YOLO + EasyOCR)
  const handleSimulateAiScan = () => {
    setIsAiScanning(true);
    setAiScanFeedback(null);
    posAudio.playScanBeep();

    setTimeout(() => {
      // Pick a random realistic Kenyan plate and vehicle type
      const samples = [
        { plate: 'KDG 456X', type: 'suv' as VehicleCategory, conf: '0.94' },
        { plate: 'KDA 123A', type: 'car' as VehicleCategory, conf: '0.91' },
        { plate: 'KCA 789B', type: 'bus' as VehicleCategory, conf: '0.88' },
        { plate: 'KBZ 101Y', type: 'car' as VehicleCategory, conf: '0.96' },
      ];
      const detected = samples[Math.floor(Math.random() * samples.length)];

      setRegistrationPlate(detected.plate);
      setVehicleType(detected.type);
      setIsAiScanning(false);
      setAiScanFeedback(`Detected: ${detected.plate} (${detected.type.toUpperCase()}) · Confidence: ${detected.conf}`);
      posAudio.playSuccess();
    }, 1100);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!registrationPlate.trim() || selectedServiceIds.length === 0 || assignedCleanerIds.length === 0) {
      posAudio.playError();
      return;
    }

    const assignedStaffMembers = staff.filter((s) => assignedCleanerIds.includes(s.id));
    const allocations = assignedStaffMembers.map((cln) => ({
      cleanerId: cln.id,
      cleanerName: cln.name,
      assignedShift: cln.assignedShift,
      allocatedAmount: perCleanerCommission,
    }));

    const creditAccount = isCreditCustomer
      ? creditAccounts.find((c) => c.id === selectedCreditAccountId)
      : undefined;

    const newVisit: VehicleVisit = {
      id: `vis_${Date.now()}`,
      visitNumber: `VIS-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      registrationPlate: registrationPlate.trim().toUpperCase(),
      vehicleType,
      customerName: creditAccount ? creditAccount.customerName : customerName.trim() || 'Walk-in Customer',
      customerPhone: creditAccount ? creditAccount.phone : customerPhone.trim(),
      isCreditCustomer,
      no_plastic_mat: noPlasticMat,
      no_woolen_mat: noWoolenMat,
      special_concerns: specialConcerns.trim() || undefined,
      services: selectedServicesList.map((s) => ({
        serviceId: s.id,
        serviceName: s.name,
        price: s.basePrice,
        vat: s.basePrice * s.vatRate,
      })),
      assignedCleaners: assignedStaffMembers,
      applicableShift: shiftSelection,
      commissionRate,
      subtotal,
      bargainingDiscount,
      loyaltyBenefit,
      commissionBase,
      totalCommission,
      cleanerAllocations: allocations,
      vatRate,
      vatTotal,
      total: Math.round(grandTotal),
      status: 'waiting',
      createdAt: new Date().toISOString(),
      supervisorName: 'Joseph Karanja',
      payments: [],
      amountPaid: 0,
      outstandingBalance: Math.round(grandTotal),
    };

    onSaveVisit(newVisit);
    posAudio.playSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div>
            <div className="flex items-center gap-2">
              <Car className="w-5 h-5 text-cyan-400" />
              <h2 className="text-base font-bold text-slate-100">Vehicle Arrival &amp; Service Bay Entry</h2>
            </div>
            <p className="text-xs text-slate-400">
              NEV CARWASH · Diamond Space Kikuyu Branch · Recording Supervisor:{' '}
              <span className="text-cyan-400 font-medium">Joseph Karanja</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scroll Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs bg-slate-900">
          {/* 1. Vehicle Identification & AI Scanner */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <span>1. Vehicle Registration &amp; Identification</span>
              </span>

              {/* AI Plate Scanner Button (Section 17) */}
              <button
                type="button"
                onClick={handleSimulateAiScan}
                disabled={isAiScanning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 font-semibold transition-all self-start sm:self-auto"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{isAiScanning ? 'Scanning Plate (AI)...' : 'AI Camera Scan'}</span>
              </button>
            </div>

            {aiScanFeedback && (
              <div className="p-2.5 bg-emerald-950/60 border border-emerald-800 rounded-lg text-emerald-300 flex items-center gap-2">
                <ScanLine className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{aiScanFeedback}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Registration Number Plate <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. KDA 123A"
                  value={registrationPlate}
                  onChange={(e) => setRegistrationPlate(e.target.value.toUpperCase())}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-base font-mono font-bold text-white tracking-wider focus:outline-none focus:border-cyan-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Vehicle Category</label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as VehicleCategory)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-cyan-500"
                >
                  <option value="car">Saloon / Sedan Car</option>
                  <option value="suv">SUV / 4x4 / Double-Cab</option>
                  <option value="motorcycle">Motorcycle / Bodaboda</option>
                  <option value="bus">Matatu / Mini-Bus</option>
                  <option value="truck">Commercial Truck / Lorry</option>
                  <option value="other">Other Supported Category</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Customer Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Samuel Gitau"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  disabled={isCreditCustomer}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500 disabled:opacity-40"
                />
              </div>
            </div>

            {/* Optional Carwash Inspection Fields (Section 4.1) */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-4 text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={noPlasticMat}
                  onChange={(e) => setNoPlasticMat(e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-600 bg-slate-900 border-slate-700"
                />
                <span>no_plastic_mat (No plastic floor mats in vehicle)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={noWoolenMat}
                  onChange={(e) => setNoWoolenMat(e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-600 bg-slate-900 border-slate-700"
                />
                <span>no_woolen_mat (No woolen carpets)</span>
              </label>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Special Concerns / Scratch Inspection (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Scratch on passenger door, do not steam fuse box, loose antenna"
                value={specialConcerns}
                onChange={(e) => setSpecialConcerns(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Corporate Credit Customer Toggle */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-amber-400 font-medium">
                <input
                  type="checkbox"
                  checked={isCreditCustomer}
                  onChange={(e) => setIsCreditCustomer(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700"
                />
                <span>Corporate Credit-Account Customer (e.g. Sacco Fleet, County Depot)</span>
              </label>

              {isCreditCustomer && (
                <select
                  value={selectedCreditAccountId}
                  onChange={(e) => setSelectedCreditAccountId(e.target.value)}
                  className="bg-slate-900 border border-amber-800 rounded-lg px-3 py-1 text-xs text-amber-300 font-medium"
                >
                  {creditAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.customerName} (Bal: KSh {acc.outstandingBalance.toLocaleString()})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* 2. Service Packages Selection */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                2. Select Vehicle Cleaning Services
              </span>
              <span className="text-[11px] text-slate-400">
                {selectedServiceIds.length} service(s) selected
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {availableServices.map((srv) => {
                const isSelected = selectedServiceIds.includes(srv.id);
                return (
                  <div
                    key={srv.id}
                    onClick={() => handleToggleService(srv.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-950/40 text-cyan-200 shadow-sm'
                        : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-semibold text-slate-100">{srv.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-cyan-400 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{srv.description}</p>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 capitalize">
                        {srv.serviceAreas.join(' · ')}
                      </span>
                      <span className="font-bold text-cyan-400 tabular-nums">
                        KSh {srv.basePrice.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Cleaner Assignment & Commission Allocation (Section 5) */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span>3. Assign Cleaners &amp; Commission Calculation</span>
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Multiple cleaners divide total commission equally. Rates: Day 30% · Night 35%.
                </p>
              </div>

              {/* Shift Selection */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setShiftSelection('DAY')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    shiftSelection === 'DAY'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Day Shift (30%)
                </button>
                <button
                  type="button"
                  onClick={() => setShiftSelection('NIGHT')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    shiftSelection === 'NIGHT'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Night Shift (35%)
                </button>
              </div>
            </div>

            {/* Cleaners Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 gap-2">
              {availableCleaners.map((cleaner) => {
                const isSelected = assignedCleanerIds.includes(cleaner.id);
                return (
                  <button
                    key={cleaner.id}
                    type="button"
                    onClick={() => handleToggleCleaner(cleaner.id)}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold text-slate-100 text-xs truncate">{cleaner.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{cleaner.staffNumber}</div>
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">{cleaner.assignedShift}</span>
                      {isSelected && <span className="font-bold text-emerald-400">ASSIGNED</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Real-time Commission Math Display (Section 5.3 & 5.4) */}
            <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <span className="text-slate-400 font-medium">Commission Base: </span>
                <span className="font-bold text-slate-100 tabular-nums">KSh {commissionBase}</span>
                <span className="text-slate-400 ml-2">@ {(commissionRate * 100).toFixed(0)}% = </span>
                <strong className="text-emerald-400 tabular-nums">KSh {totalCommission.toFixed(1)} Total</strong>
              </div>
              <div>
                <span className="text-slate-400">Per Cleaner ({assignedCleanersCount}): </span>
                <span className="font-bold text-emerald-400 tabular-nums">
                  KSh {perCleanerCommission.toFixed(1)} each
                </span>
              </div>
            </div>
          </div>

          {/* 4. Discounts & VAT Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Discounts */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                Discounts &amp; Bargaining (Section 5.4)
              </span>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Bargaining Discount (KSh) · <span className="text-rose-400">Reduces Commission Base</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={bargainingDiscount}
                  onChange={(e) => setBargainingDiscount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Loyalty / Free Service (KSh) · <span className="text-emerald-400">Cleaner Keeps Full Base</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={loyaltyBenefit}
                  onChange={(e) => setLoyaltyBenefit(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono"
                />
              </div>
            </div>

            {/* Bill Summary */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between space-y-2">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                Total Bill Breakdown
              </span>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Services Subtotal (Exclusive)</span>
                  <span className="font-medium text-slate-200 tabular-nums">KSh {subtotal}</span>
                </div>
                {bargainingDiscount > 0 && (
                  <div className="flex justify-between text-rose-400">
                    <span>Bargaining Discount</span>
                    <span className="tabular-nums">-KSh {bargainingDiscount}</span>
                  </div>
                )}
                {loyaltyBenefit > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Loyalty Benefit</span>
                    <span className="tabular-nums">-KSh {loyaltyBenefit}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-400">
                  <span>VAT (16% Kenya Registered)</span>
                  <span className="font-medium text-slate-200 tabular-nums">KSh {Math.round(vatTotal)}</span>
                </div>

                <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline">
                  <span className="text-sm font-bold text-slate-100">TOTAL DUE</span>
                  <span className="text-2xl font-extrabold text-cyan-400 tabular-nums">
                    KSh {Math.round(grandTotal).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={!registrationPlate || selectedServiceIds.length === 0 || assignedCleanerIds.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-cyan-950 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            <span>Send to Washing Bay</span>
          </button>
        </div>
      </form>
    </div>
  );
};
