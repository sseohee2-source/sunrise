import Link from "next/link";

import { ExcelDownloadButton } from "@/components/common/excel-download-button";
import { FilterBar, FilterField } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AGENDA_RESULT, AGENDA_TYPE, MEETING_METHOD } from "@/lib/codes";
import { fmtDate } from "@/lib/date";
import { departmentOptions, parseAgendaFilter, searchAgendas, splitKeywords } from "@/lib/queries/agendas";
import { meetingYears } from "@/lib/queries/meetings";
import { MethodText, ResultBadge } from "../meetings/_components/meeting-badges";

/** 검색어를 노란색으로 표시 */
function Highlight({ text, q }: { text: string; q?: string }) {
  const terms = (q ?? "").split(/\s+/).filter(Boolean);
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        terms.some((t) => t.toLowerCase() === part.toLowerCase()) ? (
          <mark key={i} className="rounded-sm bg-yellow-200 px-0.5">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default async function AgendasPage({ searchParams }: PageProps<"/agendas">) {
  const params = await searchParams;
  const f = parseAgendaFilter(params);
  const [rows, years, departments] = await Promise.all([searchAgendas(f), meetingYears(), departmentOptions()]);
  const delib = rows.filter((r) => r.type === "DELIBERATION").length;

  return (
    <>
      <PageHeader
        title="안건 검색"
        description={`${f.period.label}${f.q ? ` · 검색어 "${f.q}"` : ""} · ${rows.length}건 (심의 ${delib} · 보고 ${rows.length - delib})`}
        actions={<ExcelDownloadButton endpoint="/api/export/agendas" />}
      />
      <FilterBar action="/agendas" period={f.period} years={years} hasFilter={Object.keys(params).length > 0}>
        <FilterField label="통합 검색 (안건명·설명·키워드)">
          <Input name="q" defaultValue={f.q ?? ""} placeholder="예: 예산 정관" className="w-56" />
        </FilterField>
        <FilterField label="구분">
          <NativeSelect name="type" defaultValue={f.type ?? ""} className="w-24">
            <option value="">전체</option>
            {Object.entries(AGENDA_TYPE).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </FilterField>
        <FilterField label="결과">
          <NativeSelect name="result" defaultValue={f.result ?? ""} className="w-28">
            <option value="">전체</option>
            {Object.entries(AGENDA_RESULT).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
            <option value="NONE">미입력</option>
          </NativeSelect>
        </FilterField>
        <FilterField label="담당부서">
          <NativeSelect name="dept" defaultValue={f.departmentId ?? ""} className="w-32">
            <option value="">전체</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </FilterField>
        <FilterField label="개최 방법">
          <NativeSelect name="method" defaultValue={f.method ?? ""} className="w-24">
            <option value="">전체</option>
            {Object.entries(MEETING_METHOD).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </FilterField>
        <FilterField label="의결제외">
          <NativeSelect name="recusal" defaultValue={f.recusal ?? ""} className="w-32">
            <option value="">전체</option>
            <option value="1">의결제외 있는 안건</option>
          </NativeSelect>
        </FilterField>
      </FilterBar>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>회차</TableHead>
              <TableHead>개최일</TableHead>
              <TableHead>방법</TableHead>
              <TableHead>번호</TableHead>
              <TableHead>안건명</TableHead>
              <TableHead>담당부서</TableHead>
              <TableHead>발표자</TableHead>
              <TableHead>담당자</TableHead>
              <TableHead>결과</TableHead>
              {f.q && <TableHead>일치 위치</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-muted-foreground py-10 text-center">
                  조건에 맞는 안건이 없습니다.
                </TableCell>
              </TableRow>
            )}
            {rows.map((a) => (
              <TableRow key={a.id} className="align-top">
                <TableCell className="align-top whitespace-nowrap">
                  <Link href={`/meetings/${a.meetingId}?tab=agendas`} className="text-primary hover:underline">
                    {a.meeting.year}년 제{a.meeting.sessionNo}회
                  </Link>
                </TableCell>
                <TableCell className="align-top tabular-nums">{fmtDate(a.meeting.date)}</TableCell>
                <TableCell className="align-top">
                  <MethodText method={a.meeting.method} other={a.meeting.methodOther} />
                </TableCell>
                <TableCell className="align-top whitespace-nowrap">
                  {AGENDA_TYPE[a.type as "REPORT"]} 제{a.agendaNo}호
                </TableCell>
                <TableCell className="max-w-96 align-top">
                  <div className="font-medium">
                    <Highlight text={a.title} q={f.q} />
                    {a._count.recusals > 0 && (
                      <Badge variant="warning" className="ml-1">
                        의결제외 {a._count.recusals}
                      </Badge>
                    )}
                  </div>
                  {f.q && a.matched.includes("설명") && a.description && (
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      <Highlight text={a.description} q={f.q} />
                    </div>
                  )}
                  {a.keywords && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {splitKeywords(a.keywords).map((k) => (
                        <Badge key={k} variant="outline" className="text-[11px]">
                          #<Highlight text={k} q={f.q} />
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="align-top">{a.department?.name}</TableCell>
                <TableCell className="align-top">{a.presenter}</TableCell>
                <TableCell className="align-top">{a.contact}</TableCell>
                <TableCell className="align-top">
                  <ResultBadge result={a.result} />
                </TableCell>
                {f.q && (
                  <TableCell className="align-top">
                    <div className="flex flex-wrap gap-1">
                      {a.matched.map((m) => (
                        <Badge key={m} variant="secondary">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
