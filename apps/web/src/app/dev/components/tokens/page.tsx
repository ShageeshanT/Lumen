import { Text } from "@lumen/ui";

import { TokenTables } from "./token-tables";

export default function TokensPage() {
  return (
    <div className="flex max-w-[1100px] flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Text variant="page-title">Tokens</Text>
        <Text variant="body" className="text-text-secondary">
          Every value below is read live from the CSS variables on this page, so the table always
          reflects what is rendered. Contrast cells turn red when a pair falls under its threshold.
        </Text>
      </div>
      <TokenTables />
    </div>
  );
}
