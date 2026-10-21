import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ComingSoonInline } from "@/components/common/coming-soon";
import { ExcelDownloadButton } from "@/components/common/excel-download-button";
import { Multiline } from "@/components/common/multiline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sp } from "@/lib/action-result";
import { AGENDA_TYPE, agendaLabel, sessionLabel } from "@/lib/codes";
import { fmtDate, fmtPercent } from "@/lib/date";
import { prisma } from "@/lib/db";
import { splitKeywords } from "@/lib/queries/agendas";
import { getMeeting, placeText } from "@/lib/queries/meetings";
import { cn } from "@/lib/utils";
import { AddAgendaButton, AgendaRowActions, DeleteMeetingButton, RenumberButton } from "../_components/agenda-actions";
import { MeetingStatusBadge, MethodText, ResultBadge } from "../_components/meeting-badges";
import { MeetingForm } from "../_components/meeting-form";

const TABS = [
  ["info", "기본정보"],
  ["agendas", "안건"],
  ["attendance", "출석"],
  ["remarks", "발언"],
  ["allowance", "수당"],
] as const;

export default async function MeetingDetailPage({ params, searchParams }: PageProps<"/meetings/[id]">) {
  const { id } = await params;
  const tab = sp(await searchParams, "tab") ?? "info";
  const m = await getMeeting(Number(id));
  if (!m) notFound();

  const members = m.attendances.filter((a) => a.isMember);
  const present = members.filter((a) => a.status === "PRESENT").length;
  const title = `${sessionLabel(m.year, m.sessionNo)} 이사회`;

  return (
    <>
      <Link
        href={`/meetings?year=${m.year}`}
        className="text-muted-foreground mb-2 inline-flex items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-4" />
        {m.year}년 회차 목록
      </Link>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{title}</h1>
        <MeetingStatusBadge status={m.status} />
        <span className="text-muted-foreground text-sm">
          {fmtDate(m.date)} · <MethodText method={m.method} other={m.methodOther} />
          {placeText(m) && ` · ${placeText(m)}`}
          {m.isHeadOffice && " (진주 본사)"}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["심의 안건", `${m.agendas.filter((a) => a.type === "DELIBERATION").length}건`],
          ["보고 안건", `${m.agendas.filter((a) => a.type === "REPORT").length}건`],
          ["출석/재적", `${present}/${members.length}명`],
          ["출석률", m.status === "DONE" ? fmtPercent(members.length ? present / members.length : null) : "개최 전"],
        ].map(([l, v]) => (
          <Card key={l} className="gap-0 py-3">
            <CardContent className="px-4">
              <div className="text-muted-foreground text-xs">{l}</div>
              <div className="text-lg font-bold tabular-nums">{v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <nav className="mb-4 flex gap-1 border-b">
        {TABS.map(([k, l]) => (
          <Link
            key={k}
            href={`/meetings/${m.id}?tab=${k}`}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              tab === k
                ? "border-primary text-primary"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {l}
            {k === "agendas" && <span className="ml-1 text-xs">({m.agendas.length})</span>}
          </Link>
        ))}
      </nav>

      {tab === "info" && <InfoTab m={m} title={title} />}
      {tab === "agendas" && <AgendasTab m={m} title={title} />}
      {tab === "attendance" && <ComingSoonInline stage={4} text="출석 관리(의결제외 포함)" />}
      {tab === "remarks" && <ComingSoonInline stage={4} text="이사 발언 관리" />}
      {tab === "allowance" && <ComingSoonInline stage={5} text="이 회차의 이사회 회의수당" />}
    </>
  );
}

type M = NonNullable<Awaited<ReturnType<typeof getMeeting>>>;

async function InfoTab({ m, title }: { m: M; title: string }) {
  const regions = await prisma.region.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  return (
    <Card>
      <CardContent>
        <MeetingForm
          regions={regions}
          initial={{
            id: m.id,
            year: m.year,
            sessionNo: m.sessionNo,
            date: m.date,
            method: m.method,
            methodOther: m.methodOther ?? "",
            regionId: m.regionId,
            locationDetail: m.locationDetail ?? "",
            isHeadOffice: m.isHeadOffice,
            convocation: m.convocation,
            requesterIds: m.requesters.map((r) => r.appointmentId),
            status: m.status,
            note: m.note ?? "",
          }}
        />
        <div className="mt-8 border-t pt-4">
          <DeleteMeetingButton
            id={m.id}
            label={title}
            counts={`안건 ${m.agendas.length}건, 발언 ${m._count.remarks}건`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

async function AgendasTab({ m, title }: { m: M; title: string }) {
  const departments = await prisma.department.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const nextNo = {
    DELIBERATION: Math.max(0, ...m.agendas.filter((a) => a.type === "DELIBERATION").map((a) => a.agendaNo)) + 1,
    REPORT: Math.max(0, ...m.agendas.filter((a) => a.type === "REPORT").map((a) => a.agendaNo)) + 1,
  };
  const common = { meetingId: m.id, departments, nextNo };
  return (
    <Card className="gap-3 pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5">
        <p className="text-muted-foreground text-sm">{title} 안건 목록 (심의 → 보고 순)</p>
        <div className="flex gap-2">
          <ExcelDownloadButton endpoint="/api/export/agendas" params={{ meeting: m.id, tab: undefined }} />
          <RenumberButton meetingId={m.id} />
          <AddAgendaButton {...common} />
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">번호</TableHead>
            <TableHead>안건명</TableHead>
            <TableHead>담당부서</TableHead>
            <TableHead>발표자</TableHead>
            <TableHead>담당자</TableHead>
            <TableHead>결과</TableHead>
            <TableHead className="text-center">의결제외</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {m.agendas.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground py-10 text-center">
                등록된 안건이 없습니다. &lsquo;안건 추가&rsquo;를 눌러 등록하세요.
              </TableCell>
            </TableRow>
          )}
          {m.agendas.map((a) => (
            <TableRow key={a.id} className="align-top">
              <TableCell className="align-top whitespace-nowrap">
                <Badge variant={a.type === "DELIBERATION" ? "default" : "secondary"}>
                  {AGENDA_TYPE[a.type as "REPORT"]}
                </Badge>{" "}
                제{a.agendaNo}호
              </TableCell>
              <TableCell className="align-top">
                <div className="font-medium">{a.title}</div>
                {a.description && <Multiline text={a.description} className="text-muted-foreground mt-0.5 text-xs" />}
                {a.keywords && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {splitKeywords(a.keywords).map((k) => (
                      <Badge key={k} variant="outline" className="text-[11px]">
                        #{k}
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
                {a.amendment && <div className="text-muted-foreground mt-1 max-w-48 text-xs">수정: {a.amendment}</div>}
              </TableCell>
              <TableCell className="text-center align-top">
                {a._count.recusals > 0 ? (
                  <Link href={`/meetings/${m.id}?tab=attendance`}>
                    <Badge variant="warning">{a._count.recusals}명</Badge>
                  </Link>
                ) : (
                  ""
                )}
              </TableCell>
              <TableCell className="align-top">
                <AgendaRowActions
                  {...common}
                  label={agendaLabel(a.type, a.agendaNo)}
                  agenda={{
                    id: a.id,
                    meetingId: m.id,
                    type: a.type,
                    agendaNo: a.agendaNo,
                    title: a.title,
                    departmentId: a.departmentId,
                    presenter: a.presenter ?? "",
                    contact: a.contact ?? "",
                    result: a.result ?? "",
                    amendment: a.amendment ?? "",
                    description: a.description ?? "",
                    keywords: a.keywords ?? "",
                  }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
