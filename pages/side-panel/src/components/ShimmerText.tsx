interface ShimmerTextProps {
  text: string;
  className?: string;
}

export function ShimmerText({ text, className = '' }: ShimmerTextProps) {
  return (
    <span
      className={`animate-shimmer ${className}`}
      style={{
        background:
          'linear-gradient(90deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.22) 50%, rgba(0,0,0,0.22) 54%, rgba(0,0,0,0.30) 57%, rgba(0,0,0,0.34) 61%, rgba(0,0,0,0.42) 66%, rgba(0,0,0,0.42) 74%, rgba(0,0,0,0.34) 79%, rgba(0,0,0,0.30) 83%, rgba(0,0,0,0.22) 88%, rgba(0,0,0,0.22) 92%, rgba(0,0,0,0.22) 100%)',
        backgroundSize: '200% 100%',
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        willChange: 'background-position, opacity',
        color: 'rgba(0,0,0,0.27)',
      }}>
      {text}
    </span>
  );
}
