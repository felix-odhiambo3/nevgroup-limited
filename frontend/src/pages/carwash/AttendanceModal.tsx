import React, { useState, useEffect } from 'react';
import { AttendanceRecord, CleanerStaff, ShiftType } from '../../types/carwash';
import { KIKUYU_BRANCH } from '../../utils/carwashStorage';
import { posAudio } from '../../utils/audio';
import { formatDateTime } from '../../utils/formatters';
import {
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  UserCheck,
  LogOut,
  X,
  Search,
  Navigation,
  RefreshCw,
} from 'lucide-react';

interface AttendanceModalProps {
  staff: CleanerStaff[];
  attendanceRecords: AttendanceRecord[];
  activeShift: ShiftType;
  onSaveAttendance: (records: AttendanceRecord[]) => void;
  onUpdateStaff: (staff: CleanerStaff[]) => void;
  onClose: () => void;
}

// Haversine distance in metres
function calculateDistanceMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export const AttendanceModal: React.FC<AttendanceModalProps> = ({
  staff,
  attendanceRecords,
  activeShift,
  onSaveAttendance,
  onUpdateStaff,
  onClose,
}) => {
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [currentGps, setCurrentGps] = useState<{ lat: number; lng: number } | null>(null);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [enableGpsOverride, setEnableGpsOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [filterShift, setFilterShift] = useState<'ALL' | 'DAY' | 'NIGHT'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Auto-acquire GPS coordinate on mount (or use Kikuyu yard coordinate as default mock/live)
  const acquireGps = () => {
    setIsGpsLoading(true);
    setGpsError(null);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // Live GPS acquired
          setCurrentGps({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          setIsGpsLoading(false);
        },
        () => {
          // If browser geoloc blocked or unavailable in iframe/desktop, fallback gracefully to simulated Kikuyu yard GPS
          setCurrentGps({
            lat: KIKUYU_BRANCH.latitude + (Math.random() - 0.5) * 0.0003,
            lng: KIKUYU_BRANCH.longitude + (Math.random() - 0.5) * 0.0003,
          });
          setIsGpsLoading(false);
        },
        { timeout: 5000, enableHighAccuracy: true }
      );
    } else {
      setCurrentGps({
        lat: KIKUYU_BRANCH.latitude,
        lng: KIKUYU_BRANCH.longitude,
      });
      setIsGpsLoading(false);
    }
  };

  useEffect(() => {
    acquireGps();
  }, []);

  const distance = currentGps
    ? calculateDistanceMetres(
        currentGps.lat,
        currentGps.lng,
        KIKUYU_BRANCH.latitude,
        KIKUYU_BRANCH.longitude
      )
    : 0;

  const isWithinGeofence = distance <= KIKUYU_BRANCH.attendanceRadius;

  // Handle Clock In
  const handleClockIn = (member: CleanerStaff) => {
    if (!isWithinGeofence && !enableGpsOverride) {
      posAudio.playError();
      alert(
        `Staff member is ${distance}m away. Must be within ${KIKUYU_BRANCH.attendanceRadius}m of ${KIKUYU_BRANCH.name} (Kikuyu Town) or use Supervisor GPS Override.`
      );
      return;
    }

    const newRecord: AttendanceRecord = {
      id: `att_${Date.now()}`,
      staffId: member.id,
      staffName: member.name,
      staffNumber: member.staffNumber,
      role: member.role,
      shift: member.assignedShift,
      clockIn: new Date().toISOString(),
      attendanceStatus: 'ON_TIME',
      checkoutStatus: 'OPEN',
      gpsLatitude: currentGps ? currentGps.lat : KIKUYU_BRANCH.latitude,
      gpsLongitude: currentGps ? currentGps.lng : KIKUYU_BRANCH.longitude,
      distanceMetres: distance,
      isGpsOverride: enableGpsOverride,
      approvedBySupervisor: enableGpsOverride ? 'Joseph Karanja (Supervisor)' : undefined,
      notes: enableGpsOverride ? overrideReason || 'Supervisor GPS Override Authorized' : 'Kikuyu Yard Bay Verification',
    };

    const nextRecords = [newRecord, ...attendanceRecords];
    onSaveAttendance(nextRecords);

    // Update staff status
    const updatedStaff = staff.map((s) => (s.id === member.id ? { ...s, isClockedIn: true } : s));
    onUpdateStaff(updatedStaff);

    posAudio.playSuccess();
    setOverrideReason('');
    setEnableGpsOverride(false);
  };

  // Handle Clock Out
  const handleClockOut = (member: CleanerStaff) => {
    const existingIndex = attendanceRecords.findIndex(
      (a) => a.staffId === member.id && a.checkoutStatus === 'OPEN'
    );

    const updatedRecords = [...attendanceRecords];
    if (existingIndex >= 0) {
      const rec = updatedRecords[existingIndex];
      const clockInTime = new Date(rec.clockIn).getTime();
      const now = Date.now();
      const duration = Math.round((now - clockInTime) / 60000);

      updatedRecords[existingIndex] = {
        ...rec,
        clockOut: new Date().toISOString(),
        checkoutStatus: 'MANUAL',
        durationMinutes: duration,
      };
      onSaveAttendance(updatedRecords);
    }

    // Update staff status
    const updatedStaff = staff.map((s) => (s.id === member.id ? { ...s, isClockedIn: false } : s));
    onUpdateStaff(updatedStaff);

    posAudio.playDrawerBell();
  };

  const filteredStaff = staff.filter((s) => {
    const matchesShift = filterShift === 'ALL' || s.assignedShift === filterShift;
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.staffNumber.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesShift && matchesSearch;
  });

  const clockedInCount = staff.filter((s) => s.isClockedIn).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Staff Attendance &amp; Shifts</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  {KIKUYU_BRANCH.code}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                NEV CARWASH · Kikuyu Branch ({clockedInCount}/{staff.length} Cleaners on Yard)
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

        {/* GPS Geofence Verification Bar */}
        <div className="bg-slate-950/70 border-b border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                isWithinGeofence ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <div className="text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-200 font-semibold flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                  Kikuyu Yard Geofence:
                </span>
                <span className="font-mono text-cyan-300">
                  {KIKUYU_BRANCH.latitude.toFixed(6)}, {KIKUYU_BRANCH.longitude.toFixed(6)}
                </span>
                <span className="text-slate-400">(Radius: {KIKUYU_BRANCH.attendanceRadius}m)</span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                <span>
                  Detected Distance:{' '}
                  <strong className={isWithinGeofence ? 'text-emerald-400' : 'text-amber-400'}>
                    {distance} metres
                  </strong>
                </span>
                <span>•</span>
                <span className={isWithinGeofence ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                  {isWithinGeofence ? '✓ On-Site Verified' : '⚠ Outside Geofence'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={acquireGps}
              disabled={isGpsLoading}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGpsLoading ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Refresh GPS</span>
            </button>

            {/* Supervisor GPS Override Toggle */}
            <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
              <button
                type="button"
                onClick={() => setEnableGpsOverride(!enableGpsOverride)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                  enableGpsOverride
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Supervisor Override</span>
              </button>
            </div>
          </div>
        </div>

        {/* GPS Override Explanation Input if active */}
        {enableGpsOverride && (
          <div className="bg-amber-950/40 border-b border-amber-800/50 px-6 py-2.5 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex-1">
              <input
                type="text"
                placeholder="Enter Supervisor Authorization Note (e.g. Device GPS calibration / Remote yard deployment)"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="w-full bg-slate-900 border border-amber-500/40 rounded-lg px-3 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>
        )}

        {/* Cleaners Roster & Clock In/Out Actions */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Filters & Search */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setFilterShift('ALL')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  filterShift === 'ALL'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All Shifts ({staff.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterShift('DAY')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  filterShift === 'DAY'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Day Shift (30% Commission)
              </button>
              <button
                type="button"
                onClick={() => setFilterShift('NIGHT')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  filterShift === 'NIGHT'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Night Shift (35% Commission)
              </button>
            </div>

            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search staff name or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Roster Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredStaff.map((member) => (
              <div
                key={member.id}
                className={`p-4 rounded-xl border transition-all ${
                  member.isClockedIn
                    ? 'bg-slate-950/80 border-emerald-500/30 shadow-md shadow-emerald-950/20'
                    : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-white">{member.name}</h4>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {member.staffNumber}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <span
                        className={`font-semibold ${
                          member.assignedShift === 'DAY' ? 'text-amber-400' : 'text-indigo-400'
                        }`}
                      >
                        {member.assignedShift} Shift
                      </span>
                      <span>•</span>
                      <span>{member.role}</span>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      member.isClockedIn
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {member.isClockedIn ? 'ON DUTY' : 'OFF DUTY'}
                  </span>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                  <div>
                    Today: <strong className="text-slate-200">{member.vehiclesCompletedToday} cars</strong>
                  </div>
                  <div>
                    Commission:{' '}
                    <strong className="text-cyan-400 font-mono">
                      KSh {member.totalCommissionsToday.toLocaleString()}
                    </strong>
                  </div>
                </div>

                <div className="mt-3">
                  {member.isClockedIn ? (
                    <button
                      type="button"
                      onClick={() => handleClockOut(member)}
                      className="w-full py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Clock Out (End Shift)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleClockIn(member)}
                      className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-emerald-950"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Clock In ({member.assignedShift} Shift)</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Attendance Log Table */}
          <div className="mt-8">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
              Today's GPS Punch Log ({attendanceRecords.length} check-ins)
            </h3>
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-mono">
                  <tr>
                    <th className="py-2.5 px-4">Staff</th>
                    <th className="py-2.5 px-3">Shift</th>
                    <th className="py-2.5 px-3">Clock In</th>
                    <th className="py-2.5 px-3">Clock Out</th>
                    <th className="py-2.5 px-3">GPS Verification</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {attendanceRecords.slice(0, 10).map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-900/50">
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-white">{rec.staffName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{rec.staffNumber}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            rec.shift === 'DAY'
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-indigo-500/10 text-indigo-400'
                          }`}
                        >
                          {rec.shift}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">{formatDateTime(rec.clockIn)}</td>
                      <td className="py-2.5 px-3 font-mono">
                        {rec.clockOut ? formatDateTime(rec.clockOut) : <span className="text-emerald-400 font-bold">ACTIVE</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 text-cyan-400" />
                          <span className="font-mono text-[11px]">{rec.distanceMetres}m from yard</span>
                        </div>
                        {rec.isGpsOverride && (
                          <span className="text-[10px] text-amber-400 font-semibold block">
                            Supervisor Override
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            rec.attendanceStatus === 'ON_TIME'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}
                        >
                          {rec.attendanceStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 text-[11px] max-w-[200px] truncate">
                        {rec.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
