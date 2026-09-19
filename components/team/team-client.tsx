"use client";

import { useState, useMemo } from "react";
import { TeamMember, Property } from "@prisma/client";
import { Users, Plus, Edit2, Trash2, MapPin } from "lucide-react";
import { TeamModal } from "./team-modal";
import { deleteTeamMember } from "@/app/actions/team";

type TeamMemberWithProperty = TeamMember & { property?: Property };

interface TeamClientProps {
  initialMembers: TeamMemberWithProperty[];
  properties: Property[];
}

export function TeamClient({ initialMembers, properties }: TeamClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [locationFilter, setLocationFilter] = useState<string>("ALL");

  const filteredMembers = useMemo(() => {
    if (locationFilter === "ALL") return initialMembers;
    return initialMembers.filter(m => m.propertyId === locationFilter);
  }, [initialMembers, locationFilter]);

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
            <Users className="w-8 h-8 text-rose-600" />
            Team Management
          </h1>
          <p className="text-gray-500 mt-1">Manage staff, roles, and WhatsApp automation numbers.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="pl-9 pr-8 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none appearance-none"
            >
              <option value="ALL">All Locations</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAddNew}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" />
            Add Team Member
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Department & Role</th>
                <th className="px-6 py-4">WhatsApp Number</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No team members found for this location.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {member.name}
                    </td>
                    <td className="px-6 py-4 text-gray-600 font-medium">
                      {member.property?.name || "Unassigned"}
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
                          className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
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
        properties={properties}
      />
    </div>
  );
}
