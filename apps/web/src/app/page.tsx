import { HealthLine } from "@/components/health-line";

export default function HomePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <h1 className="font-sans text-2xl font-semibold tracking-tight">Lumen</h1>
      <HealthLine />
    </main>
  );
}
