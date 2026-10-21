import { ComingSoon } from "@/components/common/coming-soon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";

export default async function DashboardPage() {
  const [persons, appointments, meetings, agendas, remarks, payments, committeeMeetings] = await Promise.all([
    prisma.person.count(),
    prisma.appointment.count(),
    prisma.meeting.count(),
    prisma.agenda.count(),
    prisma.remark.count(),
    prisma.allowancePayment.count(),
    prisma.committeeMeeting.count(),
  ]);
  const stats = [
    ["인물", persons],
    ["재임 기록", appointments],
    ["이사회 회차", meetings],
    ["안건", agendas],
    ["발언", remarks],
    ["수당 내역", payments],
    ["소위원회 개최", committeeMeetings],
  ] as const;
  return (
    <>
      <ComingSoon title="대시보드" stage={7} items={["연도별 실적 지표 카드·차트, 최근 5개년 비교표"]} />
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>DB 연결 확인 (1단계 점검용)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {stats.map(([label, n]) => (
            <div key={label} className="bg-muted/50 rounded-lg p-3">
              <div className="text-muted-foreground text-xs">{label}</div>
              <div className="text-xl font-bold tabular-nums">{n.toLocaleString("ko-KR")}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
