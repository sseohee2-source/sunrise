import { AlertTriangle, Plus } from "lucide-react";
import Link from "next/link";

import { ExcelDownloadButton } from "@/components/common/excel-download-button";
import { Multiline } from "@/components/common/multiline";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, today } from "@/lib/date";
import { prisma } from "@/lib/db";
import { getAllQuotaWarnings, getHistory, getOfficerFormOptions, parseHistoryFilter } from "@/lib/queries/officers";
import { OfficerDialog } from "../_components/officer-dialog";
import { OfficerRowActions } from "../_components/row-actions";
import { ApptStatusBadge } from "../_components/status-badge";

export default async function OfficerHistoryPage({ searchParams }: PageProps<"/officers/history">) {
  const sp = await searchParams;
  const filter = parseHistoryFilter(sp);
  const on = today();
  const [rows, options, positions, warnings] = await Promise.all([
    getHistory(filter, on),
    getOfficerFormOptions(),
    prisma.position.findMany({ orderBy: { sortOrder: "asc" } }),
    getAllQuotaWarnings(),
  ]);
  const filtered = !!(filter.positionId || filter.q || filter.from || filter.to || filter.status);

  return (
    <>
      <PageHeader
        title="역대 임원 리스트"
        description="인물별 재임 기록입니다. 연임·직책 변경은 재임 기록이 따로 한 줄씩 표시됩니다."
        actions={
          <>
            <ExcelDownloadButton endpoint="/api/export/officers/history" />
            <OfficerDialog
              positions={options.positions}
              persons={options.persons}
              trigger={
                <Button>
                  <Plus />
                  임원 등록
                </Button>
              }
            />
          </>
        }
      />

      {warnings.length > 0 && (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle />
          <AlertTitle>정원을 넘는 재임 기간이 있습니다</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <span className="text-xs">전임자의 &lsquo;실제 퇴임일&rsquo;이 비어 있지 않은지 확인하세요.</span>
          </AlertDescription>
        </Alert>
      )}

      <Card className="mb-4 py-4">
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <label className="grid gap-1 text-sm">
              직책
              <NativeSelect name="position" defaultValue={filter.positionId ?? ""} className="w-40">
                <option value="">전체</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-1 text-sm">
              성명
              <Input name="q" defaultValue={filter.q ?? ""} placeholder="이름 일부" className="w-36" />
            </label>
            <label className="grid gap-1 text-sm">
              재임기간
              <span className="flex items-center gap-1">
                <Input type="date" name="from" defaultValue={filter.from ?? ""} className="w-40" />~
                <Input type="date" name="to" defaultValue={filter.to ?? ""} className="w-40" />
              </span>
            </label>
            <label className="grid gap-1 text-sm">
              상태
              <NativeSelect name="status" defaultValue={filter.status ?? ""} className="w-32">
                <option value="">전체</option>
                <option value="serving">재임중</option>
                <option value="retired">퇴임</option>
              </NativeSelect>
            </label>
            <Button type="submit">조회</Button>
            {filtered && (
              <Button variant="ghost" asChild>
                <Link href="/officers/history">조건 초기화</Link>
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">직책</TableHead>
              <TableHead className="w-20">성명</TableHead>
              <TableHead className="w-48">임기</TableHead>
              <TableHead className="w-28">실제 퇴임일</TableHead>
              <TableHead className="w-36">상태</TableHead>
              <TableHead>학력</TableHead>
              <TableHead>주요경력</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground py-10 text-center">
                  조건에 맞는 임원이 없습니다.
                </TableCell>
              </TableRow>
            )}
            {rows.map((a) => (
              <TableRow key={a.id} className="align-top">
                <TableCell className="align-top">{a.position.name}</TableCell>
                <TableCell className="align-top font-medium">
                  {a.person.name}
                  {a.isReappointment && <Badge variant="outline" className="ml-1">연임</Badge>}
                </TableCell>
                <TableCell className="align-top tabular-nums">
                  {fmtDate(a.startDate)} ~ {fmtDate(a.endDate)}
                </TableCell>
                <TableCell className="align-top tabular-nums">{fmtDate(a.retiredDate)}</TableCell>
                <TableCell className="align-top">
                  <ApptStatusBadge status={a.status} />
                  {a.note && <div className="text-muted-foreground mt-1 text-xs">{a.note}</div>}
                </TableCell>
                <TableCell className="align-top text-xs">
                  <Multiline text={a.person.education} />
                </TableCell>
                <TableCell className="align-top text-xs">
                  <Multiline text={a.person.career} />
                </TableCell>
                <TableCell className="align-top">
                  <OfficerRowActions
                    positions={options.positions}
                    persons={options.persons}
                    row={{
                      appointmentId: a.id,
                      personId: a.personId,
                      person: {
                        name: a.person.name,
                        education: a.person.education ?? "",
                        career: a.person.career ?? "",
                        note: a.person.note ?? "",
                      },
                      positionId: a.positionId,
                      positionName: a.position.name,
                      startDate: a.startDate,
                      endDate: a.endDate,
                      retiredDate: a.retiredDate,
                      isReappointment: a.isReappointment,
                      note: a.note,
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="text-muted-foreground mt-2 text-sm">총 {rows.length}건</p>
    </>
  );
}
