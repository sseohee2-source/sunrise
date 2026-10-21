"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { today } from "@/lib/date";

/** 기준일 선택 (주소창 ?date= 로 반영, 엑셀 다운로드에도 그대로 전달됨) */
export function DatePickerForm({ value, label = "기준일" }: { value: string; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function go(date: string) {
    const q = new URLSearchParams(sp.toString());
    if (date && date !== today()) q.set("date", date);
    else q.delete("date");
    router.push(q.size ? `${pathname}?${q}` : pathname);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">{label}</span>
      <Input type="date" value={value} onChange={(e) => e.target.value && go(e.target.value)} className="w-40" />
      {value !== today() && (
        <Button variant="ghost" size="sm" onClick={() => go("")}>
          오늘로
        </Button>
      )}
    </div>
  );
}
