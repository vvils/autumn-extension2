const TOOLTIP_CLASS =
  'pointer-events-none absolute z-50 whitespace-nowrap rounded-lg bg-white px-2.5 py-1 text-[12px] font-normal text-black opacity-0 transition-opacity duration-150 group-hover:opacity-100 shadow-[0_1px_3px_rgba(0,0,0,0.12),inset_0_1px_1px_rgba(255,255,255,1)] select-none';

export function Tooltip({
  label,
  children,
  align = 'center',
  side = 'below',
}: {
  label: string;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'above' | 'below';
}) {
  const alignClass = align === 'start' ? 'left-0' : align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2';
  const sideClass = side === 'above' ? 'bottom-full mb-1.5' : 'top-full mt-1.5';
  return (
    <div className="group relative">
      {children}
      <span className={`${sideClass} ${alignClass} ${TOOLTIP_CLASS}`}>{label}</span>
    </div>
  );
}
