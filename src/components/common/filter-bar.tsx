import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { Period } from "@/lib/period";

/**
 * 조회 조건 상자 (주소창에 조건이 남으므로 새로고침·엑셀 다운로드에도 그대로 적용됨)
 * - showPeriod: 연도 선택 + 기간 지정
 */
export function FilterBar({
  action,
  period,
  years,
  children,
  hasFilter,
}: {
  action: string;
  period?: Period;
  years?: number[];
  children?: React.ReactNode;
  hasFilter?: boolean;
}) {
  const rangeMode = period && period.year === null;
  return (
    <Card className="mb-4 py-4">
      <CardContent>
        <form className="flex flex-wrap items-end gap-3" method="get" action={action}>
          {period && years && (
            <>
              <label className="grid gap-1 text-sm">
                연도
                <NativeSelect name="year" defaultValue={rangeMode ? "" : String(period.year)} className="w-28">
                  {rangeMode && <option value="">기간 지정</option>}
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}년
                    </option>
                  ))}
                  <option value="all">전체</option>
                </NativeSelect>
              </label>
              <label className="grid gap-1 text-sm">
                <span>
                  기간 지정 <span className="text-muted-foreground text-xs">(입력하면 연도보다 우선)</span>
                </span>
                <span className="flex items-center gap-1">
                  <Input type="date" name="from" defaultValue={rangeMode ? period.from : ""} className="w-40" />~
                  <Input type="date" name="to" defaultValue={rangeMode ? period.to : ""} className="w-40" />
                </span>
              </label>
            </>
          )}
          {children}
          <Button type="submit">조회</Button>
          {hasFilter && (
            <Button variant="ghost" asChild>
              <Link href={action}>조건 초기화</Link>
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

/** 조건 상자 안의 라벨 + 입력칸 */
export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      {children}
    </label>
  );
}
