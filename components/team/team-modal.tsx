"use client";

import { useState } from "react";
import { TeamMember } from "@prisma/client";
import { createTeamMember, updateTeamMember } from "@/app/actions/team";
import { X } from "lucide-react";

interface TeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  member?: TeamMember | null;
}

export function TeamModal({ isOpen, onClose, member }: TeamModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      phone: formData.get("phone") as string,
      whatsappNumber: formData.get("whatsappNumber") as string,
      role: formData.get("role") as string,
      department: formData.get("department") as string,
      isActive: formData.get("isActive") === "on",
    };

    let result;
    if (member) {
      result = await updateTeamMember(member.id, data);
    } else {
      result = await createTeamMember(data);
    }

    setIsSubmitting(false);

    if (result.success) {
      onClose();
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">
            {member ? "Edit Team Member" : "Add Team Member"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              name="name"
              required
              defaultValue={member?.name}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors"
              placeholder="e.g. Rahul Sharma"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                name="phone"
                required
                defaultValue={member?.phone}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors"
                placeholder="+91..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                WhatsApp Number
              </label>
              <input
                type="text"
                name="whatsappNumber"
                required
                defaultValue={member?.whatsappNumber}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors"
                placeholder="+91..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                name="role"
                required
                defaultValue={member?.role || "STAFF"}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors bg-white"
              >
                <option value="STAFF">Staff</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department
              </label>
              <select
                name="department"
                required
                defaultValue={member?.department || "HOUSEKEEPING"}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors bg-white"
              >
                <option value="HOUSEKEEPING">Housekeeping</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="FRONT_DESK">Front Desk</option>
                <option value="MANAGEMENT">Management</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActive"
              name="isActive"
              defaultChecked={member ? member.isActive : true}
              className="w-4 h-4 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700">
              Active Member
            </label>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 text-white bg-brand-600 hover:bg-brand-700 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : member ? "Update Member" : "Add Member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
