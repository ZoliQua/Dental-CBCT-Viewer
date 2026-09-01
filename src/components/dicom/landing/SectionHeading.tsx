/** Centered section heading with an optional kicker; carries the scroll anchor. */
export function SectionHeading({ id, kicker, title }: { id?: string; kicker?: string; title: string }) {
  return (
    <div id={id} className="scroll-mt-24 text-center mb-6">
      {kicker && (
        <p className="text-xs font-semibold uppercase tracking-wider text-dental-500 dark:text-dental-400 mb-1">{kicker}</p>
      )}
      <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h3>
    </div>
  );
}
