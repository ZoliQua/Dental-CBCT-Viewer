/** Four highlighted stats below the hero (value + short label). */
export interface Metric {
  value: string;
  label: string;
}

export function MetricsStrip({ items }: { items: Metric[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((m, i) => (
        <div
          key={i}
          className="rounded-2xl border border-gray-200/70 dark:border-gray-700/60 bg-white/60 dark:bg-gray-800/50 backdrop-blur-md p-4 text-center"
        >
          <div className="text-2xl font-bold text-dental-600 dark:text-dental-400">{m.value}</div>
          <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{m.label}</div>
        </div>
      ))}
    </div>
  );
}
