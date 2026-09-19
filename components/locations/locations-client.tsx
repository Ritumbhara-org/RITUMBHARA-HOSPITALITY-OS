"use client";

import { useState } from "react";
import { MapPin, Plus, Edit2, Trash2 } from "lucide-react";
import { LocationModal } from "./location-modal";
import { deleteLocation } from "@/app/actions/locations";

interface PropertyWithCounts {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    units: number;
    teamMembers: number;
  };
}

interface LocationsClientProps {
  initialLocations: PropertyWithCounts[];
}

export function LocationsClient({ initialLocations }: LocationsClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<PropertyWithCounts | null>(null);

  const handleEdit = (location: PropertyWithCounts) => {
    setSelectedLocation(location);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setSelectedLocation(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to remove this location? This may affect assigned units and team members.")) {
      await deleteLocation(id);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
            <MapPin className="w-8 h-8 text-rose-600" />
            Locations (Properties)
          </h1>
          <p className="text-gray-500 mt-1">Manage all physical properties and branches in your portfolio.</p>
        </div>
        <button
          onClick={handleAddNew}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.98]"
        >
          <Plus className="w-5 h-5" />
          Add Location
        </button>
      </div>

      {/* Data Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {initialLocations.map((location) => (
          <div key={location.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative group flex flex-col">
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 bg-white/90 backdrop-blur-sm p-1 rounded-lg">
              <button
                onClick={() => handleEdit(location)}
                className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(location.id)}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            
            <h3 className="text-xl font-semibold text-gray-900 mb-1">{location.name}</h3>
            <p className="text-sm text-gray-500 mb-4 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {location.city}{location.state ? `, ${location.state}` : ''}
            </p>
            
            <div className="mt-auto pt-4 border-t border-gray-50 flex justify-between items-center text-sm">
              <div className="text-center">
                <span className="block font-bold text-gray-900">{location._count.units}</span>
                <span className="text-gray-500 text-xs">Units</span>
              </div>
              <div className="h-8 w-px bg-gray-100"></div>
              <div className="text-center">
                <span className="block font-bold text-gray-900">{location._count.teamMembers}</span>
                <span className="text-gray-500 text-xs">Staff</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {initialLocations.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 border-dashed">
          <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">No locations found</h3>
          <p className="text-gray-500 mt-1 mb-4">Get started by creating your first property branch.</p>
          <button
            onClick={handleAddNew}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" />
            Add Location
          </button>
        </div>
      )}

      {/* Modal */}
      <LocationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        location={selectedLocation}
      />
    </div>
  );
}
