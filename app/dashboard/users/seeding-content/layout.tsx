import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SeedingContentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4">
      <Card className="border-zinc-800 bg-zinc-950">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-semibold text-zinc-50">Seeding content</CardTitle>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Browse seeded hubs and groups, join existing or new prop accounts in bulk, then publish posts and photos.
              </p>
            </div>
            <Badge variant="outline" className="border-blue-500/40 text-blue-300">
              Testing
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}
