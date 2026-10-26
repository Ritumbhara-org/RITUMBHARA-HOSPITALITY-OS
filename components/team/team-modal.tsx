"use client";

import { useState, useRef, useEffect } from "react";
import { TeamMember, Property } from "@prisma/client";
import { X, Loader2 } from "lucide-react";
import { createTeamMember, updateTeamMember } from "@/app/actions/team";
import { useTr } from "@/components/i18n/language-provider"

interface TeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  member?: TeamMember | null;
  properties: Property[];
}

export function TeamModal({ isOpen, onClose, member, properties }: TeamModalProps) {
  const tr = useTr()
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (isOpen) setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    
    // Convert boolean value
    formData.set("isActive", formData.get("isActive") === "true" ? "true" : "false");

    let res;
    if (member) {
      res = await updateTeamMember(member.id, formData);
    } else {
      res = await createTeamMember(formData);
    }

    setIsLoading(false);

    if (!res.success) {
      setError(res.error || tr("Failed to save team member"));
    } else {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/40 backdrop-blur-sm transition-all duration-300">
      <div 
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh] animate-in fade-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-5 py-4 sm:px-8 sm:py-6 border-b border-gray-100 bg-white/50">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">
            {member ? tr("Edit Team Member") : tr("Add Team Member")}
          </h2>
          <button 
            onClick={onClose}
            className="p-2.5 -mr-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain flex-1 p-5 sm:p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-start gap-3">
              <div className="p-1 bg-red-100 rounded-full">
                <X className="w-3 h-3 text-red-600" />
              </div>
              <p className="pt-0.5 leading-tight">{error}</p>
            </div>
          )}

          <form ref={formRef} id="teamForm" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div className="sm:col-span-2">
                <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
                  {tr("Full Name")}
                </label>
                <input
                  type="text"
                  name="name"
                  id="name"
                  required
                  defaultValue={member?.name}
                  placeholder={tr("e.g. John Doe")}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900 placeholder:text-gray-400 font-medium"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-2">
                  {tr("Phone Number")}
                </label>
                <input
                  type="tel"
                  name="phone"
                  id="phone"
                  required
                  defaultValue={member?.phone}
                  placeholder="+91..."
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900 placeholder:text-gray-400"
                />
              </div>

              <div>
                <label htmlFor="whatsappNumber" className="block text-sm font-semibold text-gray-700 mb-2">
                  {tr("WhatsApp Number")}
                </label>
                <input
                  type="tel"
                  name="whatsappNumber"
                  id="whatsappNumber"
                  required
                  defaultValue={member?.whatsappNumber}
                  placeholder="+91..."
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900 placeholder:text-gray-400 font-mono text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="propertyId" className="block text-sm font-semibold text-gray-700 mb-2">
                  {tr("Assigned Location / Property")}
                </label>
                <select
                  name="propertyId"
                  id="propertyId"
                  required
                  defaultValue={member?.propertyId || ""}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900 appearance-none"
                >
                  <option value="" disabled>{tr("Select a location...")}</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="department" className="block text-sm font-semibold text-gray-700 mb-2">
                  {tr("Department")}
                </label>
                <select
                  name="department"
                  id="department"
                  required
                  defaultValue={member?.department || "HOUSEKEEPING"}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900 appearance-none"
                >
                  <option value="HOUSEKEEPING">{tr("Housekeeping")}</option>
                  <option value="MAINTENANCE">{tr("Maintenance")}</option>
                  <option value="FRONT_DESK">{tr("Front Desk")}</option>
                  <option value="MANAGEMENT">{tr("Management")}</option>
                  <option value="IT">{tr("IT Support")}</option>
                  <option value="INVENTORY">{tr("Inventory")}</option>
                </select>
              </div>

              <div>
                <label htmlFor="role" className="block text-sm font-semibold text-gray-700 mb-2">
                  {tr("Role")}
                </label>
                <select
                  name="role"
                  id="role"
                  required
                  defaultValue={member?.role || "STAFF"}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900 appearance-none"
                >
                  <option value="STAFF">{tr("Staff")}</option>
                  <option value="SUPERVISOR">{tr("Supervisor")}</option>
                  <option value="MANAGER">{tr("Manager")}</option>
                  <option value="ADMIN">{tr("Admin")}</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="isActive" className="block text-sm font-semibold text-gray-700 mb-2">
                  {tr("Status")}
                </label>
                <select
                  name="isActive"
                  id="isActive"
                  required
                  defaultValue={member ? (member.isActive ? "true" : "false") : "true"}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900 appearance-none"
                >
                  <option value="true">{tr("Active (Receives Tickets)")}</option>
                  <option value="false">{tr("Inactive (Off Duty)")}</option>
                </select>
              </div>
            </div>
          </form>
        </div>

        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 border-t border-gray-100 bg-gray-50/80 flex justify-end gap-3 [&>button]:flex-1 sm:[&>button]:flex-none">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors active:scale-95"
            disabled={isLoading}
          >
            {tr("Cancel")}
          </button>
          <button
            type="submit"
            form="teamForm"
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-gray-900 rounded-xl hover:bg-gray-800 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed shadow-sm hover:shadow"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {member ? tr("Save Changes") : tr("Add Member")}
          </button>
        </div>
      </div>
    </div>
  );
}
