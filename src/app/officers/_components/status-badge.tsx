import { Badge } from "@/components/ui/badge";
import { APPT_STATUS_LABEL, type ApptStatus } from "@/lib/domain/appointment";

export function ApptStatusBadge({ status, expiringSoon }: { status: ApptStatus; expiringSoon?: boolean }) {
  if (status === "EXPIRED_SERVING") return <Badge variant="warning">임기만료·직무수행</Badge>;
  if (status === "SERVING" && expiringSoon) return <Badge variant="warning">3개월 내 만료</Badge>;
  if (status === "SERVING") return <Badge variant="secondary">재임중</Badge>;
  if (status === "FUTURE") return <Badge variant="outline">취임 예정</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">{APPT_STATUS_LABEL[status]}</Badge>;
}
