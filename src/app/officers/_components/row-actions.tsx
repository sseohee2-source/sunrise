"use client";

import { Pencil, Trash2 } from "lucide-react";

import { ConfirmButton } from "@/components/common/confirm-button";
import { Button } from "@/components/ui/button";
import { deleteAppointment } from "../actions";
import { OfficerDialog, type PersonOption, type PositionOption } from "./officer-dialog";

export type RowData = {
  appointmentId: number;
  personId: number;
  person: { name: string; education: string; career: string; note: string };
  positionId: number;
  positionName: string;
  startDate: string;
  endDate: string;
  retiredDate: string | null;
  isReappointment: boolean;
  note: string | null;
};

export function OfficerRowActions({
  row,
  positions,
  persons,
}: {
  row: RowData;
  positions: PositionOption[];
  persons: PersonOption[];
}) {
  return (
    <div className="flex justify-end gap-1">
      <OfficerDialog
        positions={positions}
        persons={persons}
        initial={row}
        trigger={
          <Button size="icon" variant="ghost" title="수정">
            <Pencil />
          </Button>
        }
      />
      <ConfirmButton
        title="재임 기록 삭제"
        description={`${row.person.name} (${row.positionName}) 재임 기록을 삭제합니다. 이사회 출석 기록이 있는 경우에는 삭제되지 않습니다.`}
        action={() => deleteAppointment(row.appointmentId)}
        trigger={
          <Button size="icon" variant="ghost" title="삭제" className="text-destructive">
            <Trash2 />
          </Button>
        }
      />
    </div>
  );
}
