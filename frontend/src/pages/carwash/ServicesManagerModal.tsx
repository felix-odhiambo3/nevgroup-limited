import React, { useState } from 'react';
import { CarwashService, ServiceArea, VehicleCategory } from '../../types/carwash';
import { posAudio } from '../../utils/audio';
import {
  Layers,
  Plus,
  Search,
  CheckCircle2,
  X,
  Edit2,
  Trash2,
  Car,
  Clock,
  Sparkles,
} from 'lucide-react';

interface ServicesManagerModalProps {
  services: CarwashService[];
  onSaveServices: (services: CarwashService[]) => void;
  onClose: () => void;
}

const ALL_AREAS: { key: ServiceArea; label: string }[] = [
  { key: 'top', label: 'Top / Roof' },
  { key: 'body', label: 'Body Foam & Rinse' },
  { key: 'under', label: 'Underwash / Ramp' },
  { key: 'engine', label: 'Engine Bay' },
  { key: 'vacuum', label: 'Interior Vacuum' },
  { key: 'wax', label: 'Hand Wax' },
  { key: 'buffing', label: 'Machine Buff' },
  { key: 'carpet', label: 'Shampoo Carpet' },
];

export const ServicesManagerModal: React.FC<ServicesManagerModalProps> = ({
  services,
  onSaveServices,
  onClose,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<VehicleCategory | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingService, setEditingService] = useState<CarwashService | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form State
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<VehicleCategory>('car');
  const [formPrice, setFormPrice] = useState('');
  const [formDuration, setFormDuration] = useState('25');
  const [formDescription, setFormDescription] = useState('');
  const [formAreas, setFormAreas] = useState<ServiceArea[]>(['body']);

  const filteredServices = services.filter((s) => {
    const matchesCat = selectedCategory === 'all' || s.category === selectedCategory;
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const toggleArea = (area: ServiceArea) => {
    if (formAreas.includes(area)) {
      setFormAreas(formAreas.filter((a) => a !== area));
    } else {
      setFormAreas([...formAreas, area]);
    }
  };

  const handleOpenAdd = () => {
    setEditingService(null);
    setFormName('');
    setFormCategory('car');
    setFormPrice('300');
    setFormDuration('25');
    setFormDescription('');
    setFormAreas(['body']);
    setIsAddOpen(true);
  };

  const handleOpenEdit = (srv: CarwashService) => {
    setEditingService(srv);
    setFormName(srv.name);
    setFormCategory(srv.category);
    setFormPrice(srv.basePrice.toString());
    setFormDuration(srv.estimatedMinutes.toString());
    setFormDescription(srv.description);
    setFormAreas([...srv.serviceAreas]);
    setIsAddOpen(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPrice) return;

    const basePrice = parseFloat(formPrice) || 0;

    if (editingService) {
      const updated = services.map((s) =>
        s.id === editingService.id
          ? {
              ...s,
              name: formName.trim(),
              category: formCategory,
              basePrice,
              estimatedMinutes: parseInt(formDuration) || 20,
              description: formDescription.trim(),
              serviceAreas: formAreas,
            }
          : s
      );
      onSaveServices(updated);
    } else {
      const newSrv: CarwashService = {
        id: `srv_${Date.now()}`,
        name: formName.trim(),
        category: formCategory,
        basePrice,
        vatRate: 0.16,
        estimatedMinutes: parseInt(formDuration) || 20,
        description: formDescription.trim(),
        serviceAreas: formAreas,
      };
      onSaveServices([...services, newSrv]);
    }

    setIsAddOpen(false);
    posAudio.playSuccess();
  };

  const handleDeleteService = (id: string) => {
    if (confirm('Are you sure you want to delete this carwash service package?')) {
      const updated = services.filter((s) => s.id !== id);
      onSaveServices(updated);
      posAudio.playScanBeep();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Carwash Services &amp; Tariff Rates</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  {services.length} Packages Configured
                </span>
              </div>
              <p className="text-xs text-slate-400">
                NEV CARWASH · Standard Tariff (All prices exclusive of 16% Kenya VAT)
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

        {/* Action Controls & Category Tabs */}
        <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs overflow-x-auto max-w-full">
            {(['all', 'car', 'suv', 'motorcycle', 'bus', 'truck'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg font-semibold capitalize whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {cat === 'all' ? 'All Vehicles' : cat === 'bus' ? 'Matatu / Bus' : cat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search package name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-cyan-950"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Service Tariff</span>
            </button>
          </div>
        </div>

        {/* Services Table */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-mono">
                <tr>
                  <th className="py-3 px-4">Service Name</th>
                  <th className="py-3 px-3">Vehicle Type</th>
                  <th className="py-3 px-3">Service Areas</th>
                  <th className="py-3 px-3">Est. Time</th>
                  <th className="py-3 px-3 text-right">Base Tariff (excl. VAT)</th>
                  <th className="py-3 px-3 text-right">16% VAT</th>
                  <th className="py-3 px-3 text-right">Total (incl. VAT)</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {filteredServices.map((srv) => {
                  const vat = Math.round(srv.basePrice * srv.vatRate);
                  const total = srv.basePrice + vat;
                  return (
                    <tr key={srv.id} className="hover:bg-slate-900/50">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-sm">{srv.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{srv.description}</div>
                      </td>
                      <td className="py-3 px-3 uppercase text-[11px] font-semibold text-cyan-400">
                        {srv.category}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {srv.serviceAreas.map((a) => (
                            <span
                              key={a}
                              className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] capitalize font-mono"
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                        {srv.estimatedMinutes} mins
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-200">
                        KSh {srv.basePrice.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-400">
                        KSh {vat.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                        KSh {total.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(srv)}
                            className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
                            title="Edit Tariff"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteService(srv.id)}
                            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                            title="Delete Tariff"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit Service Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveForm}
            className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">
                {editingService ? 'Edit Carwash Service' : 'Add New Service Tariff'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Service Package Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Engine Bay Steam Clean & Dress"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Vehicle Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as VehicleCategory)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="car">Sedan / Small Car</option>
                  <option value="suv">SUV / 4x4 / Pickup</option>
                  <option value="motorcycle">Bodaboda / Motorcycle</option>
                  <option value="bus">Matatu / Mini-Bus</option>
                  <option value="truck">Commercial Truck</option>
                  <option value="other">Special Vehicle</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Base Price (KSh excl. VAT) *
                </label>
                <input
                  type="number"
                  required
                  placeholder="300"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Estimated Wash Time (Mins)</label>
                <input
                  type="number"
                  placeholder="25"
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex flex-col justify-center">
                <div className="text-[10px] text-slate-400">Total with 16% VAT:</div>
                <div className="text-sm font-mono font-bold text-emerald-400">
                  KSh {Math.round((parseFloat(formPrice) || 0) * 1.16).toLocaleString()}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Service Areas Included</label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_AREAS.map((a) => {
                  const isChecked = formAreas.includes(a.key);
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => toggleArea(a.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border text-left flex items-center justify-between transition-colors ${
                        isChecked
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span>{a.label}</span>
                      {isChecked && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Package Description</label>
              <textarea
                rows={2}
                placeholder="Brief description of operations..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold"
              >
                Save Tariff
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
