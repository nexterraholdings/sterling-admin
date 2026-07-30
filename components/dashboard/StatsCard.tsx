import Link from "next/link";

type StatsCardProps = {
  title: string;
  value: string;
  change: string;
  tone?: "emerald" | "amber" | "rose" | "slate" | "blue" | "violet";
  icon?: React.ReactNode;
  subtitle?: string;
  href?: string;
  variant?: "default" | "featured" | "compact";
};

const toneClasses = {
  emerald: "bg-emerald-500/15 text-emerald-300",
  amber: "bg-amber-500/15 text-amber-300",
  rose: "bg-rose-500/15 text-rose-300",
  slate: "bg-zinc-800 text-zinc-300",
  blue: "bg-blue-500/15 text-blue-300",
  violet: "bg-violet-500/15 text-violet-300",
};

const accentClasses = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-zinc-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
};

const glowClasses = {
  emerald: "from-emerald-500/8",
  amber: "from-amber-500/8",
  rose: "from-rose-500/8",
  slate: "from-zinc-500/5",
  blue: "from-blue-500/8",
  violet: "from-violet-500/8",
};

export function StatsCard({
  title,
  value,
  change,
  tone = "slate",
  icon,
  subtitle,
  href,
  variant = "default",
}: StatsCardProps) {
  const hasChange = change && change.length > 0;

  const padding = variant === "compact" ? "p-4" : variant === "featured" ? "p-6" : "p-5";
  const valueSize =
    variant === "compact" ? "text-2xl" : variant === "featured" ? "text-4xl" : "text-3xl";
  const radius = variant === "compact" ? "rounded-xl" : "rounded-2xl";

  const content = (
    <>
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accentClasses[tone]} opacity-60`} />
      {variant === "featured" && (
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${glowClasses[tone]} to-transparent`} />
      )}

      <div className="relative flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {icon && (
              <span
                className={`flex shrink-0 items-center justify-center rounded-lg ${
                  variant === "compact" ? "h-7 w-7 bg-zinc-800" : "h-8 w-8 bg-zinc-800/80"
                } text-zinc-400`}
              >
                {icon}
              </span>
            )}
            <p className={`truncate font-medium text-zinc-400 ${variant === "compact" ? "text-xs" : "text-sm"}`}>
              {title}
            </p>
          </div>
          <p className={`mt-2 font-semibold tracking-tight text-zinc-50 ${valueSize}`}>{value}</p>
          {subtitle && (
            <p className={`mt-1 text-zinc-500 ${variant === "compact" ? "text-[11px]" : "text-xs"}`}>
              {subtitle}
            </p>
          )}
        </div>
        {hasChange && (
          <span className={`ml-3 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}>
            {change}
          </span>
        )}
      </div>

      {href && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="absolute bottom-4 right-4 h-3.5 w-3.5 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <path
            fillRule="evenodd"
            d="M3 10a.75.75 0 01.75-.75h10.638L11.29 6.155a.75.75 0 111.06-1.06l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 11-1.06-1.06l3.098-3.095H3.75A.75.75 0 013 10z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </>
  );

  const className = `group relative overflow-hidden border border-zinc-800 bg-zinc-900 shadow-sm transition-all hover:border-zinc-700 hover:shadow-md ${padding} ${radius}`;

  if (href) {
    return (
      <Link href={href} className={`block h-full ${className}`}>
        {content}
      </Link>
    );
  }

  return <div className={`h-full ${className}`}>{content}</div>;
}
