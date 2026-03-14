'use client';

export default function StatCard({ label, value, sub, color }) {
  return (
    <div className="relative bg-gradient-to-b from-white/90 to-white/70 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(16,185,129,0.12),0_4px_12px_rgba(0,0,0,0.04)] hover:border-emerald-200/60 transition-all duration-300 overflow-hidden">
      {/* Animated top shimmer border */}
      <div className="absolute top-0 left-0 right-0 h-[3px] stat-border-shimmer" />
      <div className="text-2xl font-extrabold leading-tight">
        {value === null || value === undefined ? (
          <div className="h-7 w-20 rounded-lg skeleton" />
        ) : (
          <span className="gradient-text">{value}</span>
        )}
      </div>
      <div className="text-sm text-gray-500 font-medium mt-2">{label}</div>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
