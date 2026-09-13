"use client";

import { useState } from "react";
import { TeamMember } from "@prisma/client";
import { Users, Plus, Edit2, Trash2 } from "lucide-react";
import { TeamModal } from "./team-modal";
import { deleteTeamMember } from "@/app/actions/team";

interface TeamClientProps {
  initialMembers: TeamMember[];
}

export function TeamClient({ initialMembers }: TeamClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  const handleEdit = (member: TeamMember) => {
    setSelectedMember(member);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setSelectedMember(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to remove this team member?")) {
      await deleteTeamMember(id);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-brand-600" />
            Team Management
          </h1>
          <p className="text-gray-500 mt-1">Manage staff, roles, and WhatsApp automation numbers.</p>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Add Team Member
        </button>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Department & Role</th>
                <th className="px-6 py-4">WhatsApp Number</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {initialMembers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No team members found. Click "Add Team Member" to create one.
                  </td>
                </tr>
              ) : (
                initialMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {member.name}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900 capitalize">
                          {member.department.replace("_", " ")}
                        </span>
                        <span className="text-xs text-gray-500 capitalize">
                          {member.role.toLowerCase()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-600">
                      {member.whatsappNumber}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          member.isActive
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-gray-100 text-gray-600 border border-gray-200"
                        }`}
                      >
                        {member.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEdit(member)}
                          className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(member.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <TeamModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        member={selectedMember}
      />
    </div>
  );
}
