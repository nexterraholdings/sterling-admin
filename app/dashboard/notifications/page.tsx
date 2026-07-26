import { NotificationsView } from "./NotificationsView";

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">Command</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-50 sm:text-3xl">Notifications</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Broadcast a push notification or in-app message to all users.
        </p>
      </div>

      <NotificationsView />
    </div>
  );
}
