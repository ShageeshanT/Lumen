import { Text } from "@lumen/ui";

import { HealthLine } from "@/components/health-line";

export default function HomePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <Text variant="page-title">Lumen</Text>
      <HealthLine />
    </main>
  );
}
