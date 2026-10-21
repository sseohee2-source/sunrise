"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Checkbox } from "@/components/ui/checkbox";

/** 결원 행 포함 여부 (?vacancy=0 이면 제외) */
export function VacancyToggle({ checked }: { checked: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => {
          const q = new URLSearchParams(sp.toString());
          if (v === true) q.delete("vacancy");
          else q.set("vacancy", "0");
          router.push(q.size ? `${pathname}?${q}` : pathname);
        }}
      />
      결원 행 포함
    </label>
  );
}
