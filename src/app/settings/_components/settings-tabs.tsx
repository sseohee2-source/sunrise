"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const SETTINGS_TABS = [
  ["positions", "직책 마스터"],
  ["rates", "수당 기준"],
  ["committees", "소위원회 종류"],
  ["departments", "부서 목록"],
  ["regions", "개최 지역"],
] as const;

/** 선택한 탭을 주소창(?tab=)에 기억 */
export function SettingsTabs({ panels }: { panels: Record<(typeof SETTINGS_TABS)[number][0], React.ReactNode> }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = sp.get("tab") ?? "positions";
  return (
    <Tabs value={tab} onValueChange={(t) => router.replace(`${pathname}?tab=${t}`, { scroll: false })}>
      <TabsList>
        {SETTINGS_TABS.map(([k, l]) => (
          <TabsTrigger key={k} value={k}>
            {l}
          </TabsTrigger>
        ))}
      </TabsList>
      {SETTINGS_TABS.map(([k]) => (
        <TabsContent key={k} value={k}>
          {panels[k]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
