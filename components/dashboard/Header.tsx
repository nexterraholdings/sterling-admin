import { logout } from "@/lib/auth/actions";
import type { CurrentAdmin } from "@/app/dashboard/lib/dal";

export function Header({
  admin,
  onOpenMobileNav,
}: {
  admin: CurrentAdmin;
  onOpenMobileNav?: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 py-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileNav}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-50 lg:hidden"
          title="Open menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="min-w-0">
          <p className="text-sm text-zinc-400">Operations dashboard</p>
          <h1 className="truncate text-xl font-semibold text-zinc-50">Admin workspace</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right text-xs leading-tight md:block">
          <p className="font-medium text-zinc-300">{admin.email ?? admin.fullName ?? "Admin"}</p>
          <p className="uppercase tracking-wider text-zinc-500">{admin.role}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
