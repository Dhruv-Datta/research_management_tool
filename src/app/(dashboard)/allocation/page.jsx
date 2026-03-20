'use client';

import { PieChart } from 'lucide-react';

export default function AllocationPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 pb-16">
      <div className="py-24 text-center animate-scale-in">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-5">
          <PieChart size={28} className="text-emerald-500" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Allocation</h1>
        <p className="text-gray-500 max-w-xl mx-auto leading-relaxed">
          Portfolio allocation targets, rebalancing tools, and sector/strategy breakdowns will live here.
        </p>
        <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-xl text-sm text-gray-500 font-medium">
          Coming soon
        </div>
      </div>
    </div>
  );
}
