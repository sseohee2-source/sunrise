"use client";

import { ListOrdered, Pencil, Plus, Trash2 } from "lucide-react";
import { useTransition } from "react";

import { ConfirmButton } from "@/components/common/confirm-button";
import { Button } from "@/components/ui/button";
import { notifyResult } from "@/lib/notify";
import { deleteAgenda, deleteMeeting, renumberAgendas, type AgendaInput } from "../actions";
import { AgendaDialog, type DeptOption } from "./agenda-dialog";
import { useRouter } from "next/navigation";

type Common = { meetingId: number; departments: DeptOption[]; nextNo: Record<string, number> };

export function AddAgendaButton(props: Common) {
  return (
    <AgendaDialog
      {...props}
      trigger={
        <Button size="sm">
          <Plus />
          안건 추가
        </Button>
      }
    />
  );
}

export function RenumberButton({ meetingId }: { meetingId: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      title="구분별로 1번부터 빈 번호 없이 다시 매깁니다"
      onClick={() => start(async () => void notifyResult(await renumberAgendas(meetingId), "번호를 다시 매겼습니다."))}
    >
      <ListOrdered />
      번호 다시 매기기
    </Button>
  );
}

export function AgendaRowActions({
  agenda,
  label,
  ...props
}: Common & { agenda: AgendaInput & { id: number }; label: string }) {
  return (
    <div className="flex justify-end">
      <AgendaDialog
        {...props}
        initial={agenda}
        trigger={
          <Button size="icon" variant="ghost" title="수정">
            <Pencil />
          </Button>
        }
      />
      <ConfirmButton
        title="안건 삭제"
        description={`${label}을(를) 삭제합니다. 이 안건의 의결제외 기록도 함께 삭제되고, 연결된 발언은 '관련 안건 없음'으로 바뀝니다.`}
        action={() => deleteAgenda(agenda.id)}
        trigger={
          <Button size="icon" variant="ghost" className="text-destructive" title="삭제">
            <Trash2 />
          </Button>
        }
      />
    </div>
  );
}

export function DeleteMeetingButton({ id, label, counts }: { id: number; label: string; counts: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      title="이사회 회차 삭제"
      description={`${label}을(를) 삭제합니다. 안건·출석·발언(${counts})이 모두 함께 삭제되며 되돌릴 수 없습니다. 수당 내역은 남고 회차 연결만 끊깁니다.`}
      confirmLabel="회차 삭제"
      action={async () => {
        const r = await deleteMeeting(id);
        if (r.ok) router.push("/meetings");
        return r;
      }}
      trigger={
        <Button variant="outline" className="text-destructive">
          <Trash2 />
          회차 삭제
        </Button>
      }
    />
  );
}
