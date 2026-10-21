import { AlertTriangle } from "lucide-react";
import { Suspense } from "react";

import { DatePickerForm } from "@/components/common/date-picker-form";
import { ExcelDownloadButton } from "@/components/common/excel-download-button";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { POSITION_CATEGORY } from "@/lib/codes";
import { daysBetweenInclusive, fmtDate, today } from "@/lib/date";
import { getRoster, type RosterEntry } from "@/lib/queries/officers";
import { cn } from "@/lib/utils";
import { isDate } from "@/lib/action-result";
import { ApptStatusBadge } from "./_components/status-badge";

function remaining(end: string, on: string): string {
  const d = daysBetweenInclusive(on, end) - 1;
  if (d < 0) return `${-d}일 경과`;
  const m = Math.floor(d / 30.4);
  return m >= 1 ? `약 ${m}개월` : `${d}일`;
}

function RosterTable({ entries, on }: { entries: RosterEntry[]; on: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-36">직책</TableHead>
          <TableHead className="w-20 text-center">정원/현원</TableHead>
          <TableHead className="w-24">성명</TableHead>
          <TableHead className="w-52">임기</TableHead>
          <TableHead className="w-24">잔여</TableHead>
          <TableHead>상태</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e) => {
          const lines = [...e.serving.map((a) => ({ a })), ...Array.from({ length: e.vacancies }, () => ({ a: null }))];
          if (lines.length === 0) lines.push({ a: null });
          return lines.map(({ a }, i) => (
            <TableRow
              key={`${e.position.id}-${a?.id ?? `v${i}`}`}
              className={cn(a?.expiringSoon || a?.status === "EXPIRED_SERVING" ? "bg-warning/40 hover:bg-warning/50" : "", !a && "bg-red-50/60")}
            >
              {i === 0 && (
                <>
                  <TableCell rowSpan={lines.length} className="border-r align-top font-medium">
                    {e.position.name}
                    {!e.position.countsAsMember && <div className="text-muted-foreground text-xs">재적이사 제외</div>}
                  </TableCell>
                  <TableCell rowSpan={lines.length} className="border-r text-center align-top tabular-nums">
                    {e.position.quota}/{e.serving.length}
                    {e.overQuota && <Badge variant="destructive" className="mt-1">정원 초과</Badge>}
                  </TableCell>
                </>
              )}
              {a ? (
                <>
                  <TableCell className="font-medium">{a.person.name}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {fmtDate(a.startDate)} ~ {fmtDate(a.endDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{remaining(a.endDate, on)}</TableCell>
                  <TableCell>
                    <ApptStatusBadge status={a.status} expiringSoon={a.expiringSoon} />
                    {a.isReappointment && <Badge variant="outline" className="ml-1">연임</Badge>}
                  </TableCell>
                </>
              ) : (
                <TableCell colSpan={4} className="font-semibold text-red-600">
                  결원
                </TableCell>
              )}
            </TableRow>
          ));
        })}
      </TableBody>
    </Table>
  );
}

export default async function OfficersPage({ searchParams }: PageProps<"/officers">) {
  const sp = await searchParams;
  const on = isDate(sp.date) ? sp.date : today();
  const roster = await getRoster(on);

  const sum = (f: (e: RosterEntry) => number) => roster.reduce((s, e) => s + f(e), 0);
  const quota = sum((e) => e.position.quota);
  const current = sum((e) => e.serving.length);
  const vacancies = sum((e) => e.vacancies);
  const members = sum((e) => (e.position.countsAsMember ? e.serving.length : 0));
  const expiring = roster.flatMap((e) => e.serving.filter((a) => a.expiringSoon || a.status === "EXPIRED_SERVING"));

  const cards = [
    ["정원", quota],
    ["현원", current],
    ["결원", vacancies],
    ["재적이사", members],
    ["임기만료 임박·경과", expiring.length],
  ] as const;

  return (
    <>
      <PageHeader
        title="임원 현황"
        description={`${fmtDate(on)} 기준 재임 중인 임원입니다. 임기 만료 3개월 이내 또는 임기만료 후 직무수행 중인 임원은 노란색으로 표시됩니다.`}
        actions={
          <>
            <Suspense>
              <DatePickerForm value={on} />
            </Suspense>
            <ExcelDownloadButton endpoint="/api/export/officers/roster" />
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map(([label, n]) => (
          <Card key={label} className="gap-1 py-3">
            <CardContent className="px-4">
              <div className="text-muted-foreground text-xs">{label}</div>
              <div className={cn("text-2xl font-bold tabular-nums", label === "결원" && n > 0 && "text-red-600")}>{n}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {expiring.length > 0 && (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle />
          <AlertDescription>
            {expiring
              .map((a) => `${a.person.name}(${fmtDate(a.endDate)} ${a.status === "EXPIRED_SERVING" ? "임기만료·직무수행 중" : "만료 예정"})`)
              .join(", ")}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 min-[1700px]:grid-cols-2">
        {(["STANDING", "NON_STANDING"] as const).map((cat) => {
          const entries = roster.filter((e) => e.position.category === cat);
          return (
            <Card key={cat} className="gap-2 pb-0">
              <CardHeader>
                <CardTitle>
                  {POSITION_CATEGORY[cat]}이사{" "}
                  <span className="text-muted-foreground text-sm font-normal">
                    (정원 {entries.reduce((s, e) => s + e.position.quota, 0)}명 / 현원{" "}
                    {entries.reduce((s, e) => s + e.serving.length, 0)}명)
                  </span>
                </CardTitle>
              </CardHeader>
              <RosterTable entries={entries} on={on} />
            </Card>
          );
        })}
      </div>
    </>
  );
}
