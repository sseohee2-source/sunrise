import { Badge } from "@/components/ui/badge";
import { AGENDA_RESULT, MEETING_METHOD, label } from "@/lib/codes";

export function MeetingStatusBadge({ status }: { status: string }) {
  return status === "DONE" ? <Badge variant="secondary">완료</Badge> : <Badge variant="outline">예정</Badge>;
}

export function MethodText({ method, other }: { method: string; other?: string | null }) {
  return (
    <>
      {label(MEETING_METHOD, method)}
      {method === "OTHER" && other ? <span className="text-muted-foreground">({other})</span> : null}
    </>
  );
}

const RESULT_STYLE: Record<string, string> = {
  ORIGINAL: "bg-emerald-50 text-emerald-700 border-emerald-200",
  AMENDED: "bg-blue-50 text-blue-700 border-blue-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  DEFERRED: "bg-amber-50 text-amber-700 border-amber-200",
  REPORTED: "bg-slate-50 text-slate-700 border-slate-200",
};

export function ResultBadge({ result }: { result: string | null }) {
  if (!result) return <span className="text-muted-foreground text-xs">미입력</span>;
  return (
    <Badge variant="outline" className={RESULT_STYLE[result]}>
      {label(AGENDA_RESULT, result)}
    </Badge>
  );
}
