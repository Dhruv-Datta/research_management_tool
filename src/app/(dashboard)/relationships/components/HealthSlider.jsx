'use client';

const healthColor = (v) => v >= 70 ? '#22c55e' : v >= 40 ? '#eab308' : '#ef4444';

export default function HealthSlider({ value, onChange }) {
  const color = healthColor(value);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">Relationship Health</span>
        <span className="text-xs font-bold" style={{ color }}>{value}</span>
      </div>
      <input
        type="range" min={0} max={100} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ background: `linear-gradient(to right, ${color} ${value}%, #e5e7eb ${value}%)` }}
      />
      <div className="flex justify-between text-[9px] text-gray-300">
        <span>Cold</span><span>Warm</span><span>Strong</span>
      </div>
    </div>
  );
}
