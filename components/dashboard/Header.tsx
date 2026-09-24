import { logout } from "@/lib/auth/actions";
import type { CurrentAdmin } from "@/app/dashboard/lib/dal";

export function Header({
  admin,
  navOpen = false,
  onToggleNav,
}: {
  admin: CurrentAdmin;
  navOpen?: boolean;
  onToggleNav?: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-b px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">Sterling ops</p>
        <h1 className="truncate text-lg font-semibold tracking-tight text-zinc-50">Admin workspace</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden text-right leading-tight md:block">
          <p className="max-w-52 truncate font-mono text-[11px] text-zinc-300">{admin.email ?? admin.fullName ?? "Admin"}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-400/80">{admin.role}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-cyan-400/25 bg-cyan-400/5 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:border-cyan-300/50 hover:bg-cyan-400/10"
          >
            Sign out
          </button>
        </form>
        <button
          type="button"
          onClick={onToggleNav}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
            navOpen
              ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-100"
              : "border-cyan-400/25 bg-cyan-400/5 text-cyan-200 hover:border-cyan-300/50 hover:bg-cyan-400/10"
          }`}
          title={navOpen ? "Hide menu" : "Show menu"}
          aria-label={navOpen ? "Hide menu" : "Show menu"}
          aria-expanded={navOpen}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </header>
  );
}
