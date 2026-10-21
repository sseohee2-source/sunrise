"use client";

import { Input } from "@/components/ui/input";

/** 금액 입력 (천 단위 콤마 자동 표시, 값은 정수 원) */
export function MoneyInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  return (
    <div className="relative">
      <Input
        inputMode="numeric"
        value={value ? value.toLocaleString("ko-KR") : value === 0 ? "0" : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "");
          onChange(digits ? Number(digits) : 0);
        }}
        className={`pr-8 text-right tabular-nums ${className ?? ""}`}
      />
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">원</span>
    </div>
  );
}
