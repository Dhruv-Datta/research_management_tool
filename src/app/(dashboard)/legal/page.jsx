'use client';

import { Scale } from 'lucide-react';

export default function LegalPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 pb-16">
      <div className="py-24 text-center animate-scale-in">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-5">
          <Scale size={28} className="text-blue-500" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Legal</h1>
        <p className="text-gray-500 max-w-xl mx-auto leading-relaxed">
          Compliance documents, regulatory filings, legal templates, and audit trails will live here.
        </p>
        <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-xl text-sm text-gray-500 font-medium">
          Coming soon
        </div>
      </div>
    </div>
  );
}
