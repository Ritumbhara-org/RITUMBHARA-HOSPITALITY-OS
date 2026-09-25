"use client";

import { useState, useRef, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { createLocation, updateLocation } from "@/app/actions/locations";

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  location?: any | null; // using any for simplicity to avoid duplicating Property type here
}

export function LocationModal({ isOpen, onClose, location }: LocationModalProps) {
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

    let res;
    if (location) {
      res = await updateLocation(location.id, formData);
    } else {
      res = await createLocation(formData);
    }

    setIsLoading(false);

    if (!res.success) {
      setError(res.error || "Failed to save location");
    } else {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm transition-all duration-300">
      <div 
        className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-8 py-6 border-b border-gray-100 bg-white/50">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">
            {location ? "Edit Location" : "Add New Location"}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-start gap-3">
              <div className="p-1 bg-red-100 rounded-full">
                <X className="w-3 h-3 text-red-600" />
              </div>
              <p className="pt-0.5 leading-tight">{error}</p>
            </div>
          )}

          <form ref={formRef} id="locationForm" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
                  Property Name *
                </label>
                <input
                  type="text"
                  name="name"
                  id="name"
                  required
                  defaultValue={location?.name}
                  placeholder="e.g. Ritumbhara Jaipur"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900 placeholder:text-gray-400 font-medium"
                />
              </div>

              <div className="col-span-2">
                <label htmlFor="city" className="block text-sm font-semibold text-gray-700 mb-2">
                  City *
                </label>
                <input
                  type="text"
                  name="city"
                  id="city"
                  required
                  defaultValue={location?.city}
                  placeholder="e.g. Jaipur"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900 placeholder:text-gray-400"
                />
              </div>

              <div className="col-span-2">
                <label htmlFor="address" className="block text-sm font-semibold text-gray-700 mb-2">
                  Full Address
                </label>
                <textarea
                  name="address"
                  id="address"
                  rows={2}
                  defaultValue={location?.address}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900 placeholder:text-gray-400 resize-none"
                />
              </div>

              <div>
                <label htmlFor="state" className="block text-sm font-semibold text-gray-700 mb-2">
                  State
                </label>
                <input
                  type="text"
                  name="state"
                  id="state"
                  defaultValue={location?.state}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900"
                />
              </div>

              <div>
                <label htmlFor="country" className="block text-sm font-semibold text-gray-700 mb-2">
                  Country
                </label>
                <input
                  type="text"
                  name="country"
                  id="country"
                  defaultValue={location?.country || "India"}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900"
                />
              </div>
              
              <div>
                <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-2">
                  Contact Phone
                </label>
                <input
                  type="text"
                  name="phone"
                  id="phone"
                  defaultValue={location?.phone}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                  Contact Email
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  defaultValue={location?.email}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900"
                />
              </div>

              <div className="col-span-2">
                <label htmlFor="googleMapsUrl" className="block text-sm font-semibold text-gray-700 mb-2">
                  Google Maps URL
                </label>
                <input
                  type="url"
                  name="googleMapsUrl"
                  id="googleMapsUrl"
                  defaultValue={location?.googleMapsUrl}
                  placeholder="https://maps.app.goo.gl/..."
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900 placeholder:text-gray-400"
                />
              </div>

              <div>
                <label htmlFor="wifiNetwork" className="block text-sm font-semibold text-gray-700 mb-2">
                  WiFi Network Name
                </label>
                <input
                  type="text"
                  name="wifiNetwork"
                  id="wifiNetwork"
                  defaultValue={location?.wifiNetwork}
                  placeholder="e.g. Ritumbhara_Guest"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900 placeholder:text-gray-400"
                />
              </div>

              <div>
                <label htmlFor="wifiPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                  WiFi Password
                </label>
                <input
                  type="text"
                  name="wifiPassword"
                  id="wifiPassword"
                  defaultValue={location?.wifiPassword}
                  placeholder="e.g. Password123"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all outline-none text-gray-900 placeholder:text-gray-400"
                />
              </div>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50/80 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors active:scale-95"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="locationForm"
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-gray-900 rounded-xl hover:bg-gray-800 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed shadow-sm hover:shadow"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {location ? "Save Changes" : "Create Location"}
          </button>
        </div>
      </div>
    </div>
  );
}
