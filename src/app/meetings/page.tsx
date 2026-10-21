import { Plus } from "lucide-react";
import Link from "next/link";

import { ExcelDownloadButton } from "@/components/common/excel-download-button";
import { FilterBar, FilterField } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sp } from "@/lib/action-result";
import { CONVOCATION, MEETING_METHOD, MEETING_STATUS, label } from "@/lib/codes";
import { fmtDate, fmtPercent } from "@/lib/date";
import { parsePeriod } from "@/lib/period";
import { listMeetings, meetingYears, placeText } from "@/lib/queries/meetings";
import { MeetingStatusBadge, MethodText } from "./_components/meeting-badges";

export default async function MeetingsPage({ searchParams }: PageProps<"/meetings">) {
  const params = await searchParams;
  const period = parsePeriod(params);
  const method = sp(params, "method");
  const status = sp(params, "status");
  const [rows, years] = await Promise.all([listMeetings({ period, method, status }), meetingYears()]);

  const done = rows.filter((r) => r.status === "DONE");
  const totalMembers = done.reduce((s, r) => s + r.memberCount, 0);
  const totalPresent = done.reduce((s, r) => s + r.presentCount, 0);

  return (
    <>
      <PageHeader
        title="이사회 개최 현황"
        description={`${period.label} · 회차를 누르면 기본정보·안건·출석·발언·수당을 관리할 수 있습니다.`}
        actions={
          <>
            <ExcelDownloadButton endpoint="/api/export/meetings" />
            <Button asChild>
              <Link href="/meetings/new">
                <Plus />
                회차 등록
              </Link>
            </Button>
          </>
        }
      />
      <FilterBar action="/meetings" period={period} years={years} hasFilter={Object.keys(params).length > 0}>
        <FilterField label="개최 방법">
          <NativeSelect name="method" defaultValue={method ?? ""} className="w-28">
            <option value="">전체</option>
            {Object.entries(MEETING_METHOD).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </FilterField>
        <FilterField label="진행 상태">
          <NativeSelect name="status" defaultValue={status ?? ""} className="w-28">
            <option value="">전체</option>
            {Object.entries(MEETING_STATUS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </FilterField>
      </FilterBar>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>회차</TableHead>
              <TableHead>개최일</TableHead>
              <TableHead>개최 방법</TableHead>
              <TableHead>장소</TableHead>
              <TableHead className="text-center">진주 본사</TableHead>
              <TableHead>소집 근거</TableHead>
              <TableHead className="text-center">심의</TableHead>
              <TableHead className="text-center">보고</TableHead>
              <TableHead className="text-center">출석/재적</TableHead>
              <TableHead className="text-right">출석률</TableHead>
              <TableHead className="text-center">상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-muted-foreground py-10 text-center">
                  조건에 맞는 이사회가 없습니다.
                </TableCell>
              </TableRow>
            )}
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">
                  <Link href={`/meetings/${m.id}`} className="text-primary hover:underline">
                    {m.year}년 제{m.sessionNo}회
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums">{fmtDate(m.date)}</TableCell>
                <TableCell>
                  <MethodText method={m.method} other={m.methodOther} />
                </TableCell>
                <TableCell className="text-sm">{placeText(m)}</TableCell>
                <TableCell className="text-center">{m.isHeadOffice ? "O" : ""}</TableCell>
                <TableCell className="text-sm">
                  {m.convocation === "MEMBER_REQUEST" ? (
                    <Badge variant="outline">{label(CONVOCATION, m.convocation)}</Badge>
                  ) : (
                    label(CONVOCATION, m.convocation)
                  )}
                </TableCell>
                <TableCell className="text-center tabular-nums">{m.deliberations}</TableCell>
                <TableCell className="text-center tabular-nums">{m.reports}</TableCell>
                <TableCell className="text-center tabular-nums">
                  {m.status === "DONE" ? `${m.presentCount}/${m.memberCount}` : "-"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtPercent(m.attendanceRate)}</TableCell>
                <TableCell className="text-center">
                  <MeetingStatusBadge status={m.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>
                  계 {rows.length}회 (완료 {done.length}회 · 대면 {rows.filter((r) => r.method === "FACE").length} ·
                  서면 {rows.filter((r) => r.method === "WRITTEN").length} · 기타{" "}
                  {rows.filter((r) => r.method === "OTHER").length})
                </TableCell>
                <TableCell className="text-center">{rows.filter((r) => r.isHeadOffice).length}</TableCell>
                <TableCell />
                <TableCell className="text-center">{rows.reduce((s, r) => s + r.deliberations, 0)}</TableCell>
                <TableCell className="text-center">{rows.reduce((s, r) => s + r.reports, 0)}</TableCell>
                <TableCell className="text-center">
                  {totalPresent}/{totalMembers}
                </TableCell>
                <TableCell className="text-right">
                  {fmtPercent(totalMembers ? totalPresent / totalMembers : null)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Card>
      <p className="text-muted-foreground mt-2 text-xs">
        출석률은 완료된 회차만 계산하며, 감사는 재적이사가 아니므로 제외합니다.
      </p>
    </>
  );
}
