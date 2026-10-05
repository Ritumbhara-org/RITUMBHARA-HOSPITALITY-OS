import React from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 shadow-xl rounded-2xl p-8 border border-gray-100 dark:border-zinc-800">
        <div className="flex justify-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Ritumbhara OS</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
