"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { ConfirmButton } from "@/components/common/confirm-button";
import { Field } from "@/components/common/form-field";
import { OrderButtons } from "@/components/common/order-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { POSITION_CATEGORY } from "@/lib/codes";
import { notifyResult } from "@/lib/notify";
import { deletePosition, movePosition, savePosition, type PositionInput } from "../actions";

type PositionRow = PositionInput & { id: number; _count: { appointments: number } };

function PositionDialog({ initial, trigger }: { initial?: PositionRow; trigger: React.ReactNode }) {
  const blank: PositionInput = {
    category: "NON_STANDING",
    name: "",
    quota: 1,
    termYears: 2,
    countsAsMember: true,
    allowanceEligible: false,
    isActive: true,
    note: "",
  };
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<PositionInput>(blank);
  const [pending, start] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV(initial ? { ...initial, note: initial.note ?? "" } : blank);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "직책 수정" : "직책 추가"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="구분" required>
            <NativeSelect value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
              <option value="STANDING">상임</option>
              <option value="NON_STANDING">비상임</option>
            </NativeSelect>
          </Field>
          <Field label="직책명" required>
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="정원" required>
            <Input
              type="number"
              min={0}
              value={v.quota}
              onChange={(e) => setV({ ...v, quota: Number(e.target.value) })}
            />
          </Field>
          <Field label="기본 임기(년)" hint="비워 두면 '해당 직책 재임기간' (당연직이사)">
            <Input
              type="number"
              min={1}
              value={v.termYears ?? ""}
              onChange={(e) => setV({ ...v, termYears: e.target.value ? Number(e.target.value) : null })}
            />
          </Field>
          <Field label="비고" className="col-span-2">
            <Input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={v.countsAsMember} onCheckedChange={(c) => setV({ ...v, countsAsMember: c === true })} />
            재적이사 포함{" "}
            <span className="text-muted-foreground text-xs">(해제 시 출석률·재적인원 계산에서 제외. 예: 감사)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={v.allowanceEligible}
              onCheckedChange={(c) => setV({ ...v, allowanceEligible: c === true })}
            />
            비상임이사 수당 지급 대상
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c === true })} />
            사용 <span className="text-muted-foreground text-xs">(해제 시 새 임원 등록 목록에서 숨김)</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (notifyResult(await savePosition({ ...v, id: initial?.id }))) setOpen(false);
              })
            }
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PositionsTab({ positions }: { positions: PositionRow[] }) {
  const O = <span className="font-semibold text-emerald-700">O</span>;
  const X = <span className="text-muted-foreground">X</span>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          이 순서가 모든 목록과 출력물의 직책 순서가 됩니다. 화살표로 순서를 바꿀 수 있습니다.
          <br />
          기본 임기는 임원 등록 시 종료일 자동 계산에 쓰입니다 (정관 제7조: 이사장 3년, 이사·감사 2년, 연임 1년 단위,
          당연직은 재임기간).
        </p>
        <PositionDialog
          trigger={
            <Button size="sm">
              <Plus />
              직책 추가
            </Button>
          }
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">순서</TableHead>
            <TableHead>구분</TableHead>
            <TableHead>직책</TableHead>
            <TableHead className="text-center">정원</TableHead>
            <TableHead className="text-center">기본 임기</TableHead>
            <TableHead className="text-center">재적이사 포함</TableHead>
            <TableHead className="text-center">수당 지급 대상</TableHead>
            <TableHead>비고</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((p, i) => (
            <TableRow key={p.id} className={p.isActive ? "" : "opacity-50"}>
              <TableCell>
                <OrderButtons first={i === 0} last={i === positions.length - 1} move={(d) => movePosition(p.id, d)} />
              </TableCell>
              <TableCell>{POSITION_CATEGORY[p.category as keyof typeof POSITION_CATEGORY]}</TableCell>
              <TableCell className="font-medium">
                {p.name} {!p.isActive && <Badge variant="outline">사용 안 함</Badge>}
              </TableCell>
              <TableCell className="text-center tabular-nums">{p.quota}</TableCell>
              <TableCell className="text-center tabular-nums">
                {p.termYears != null ? (
                  `${p.termYears}년`
                ) : (
                  <span className="text-muted-foreground text-xs">재임기간</span>
                )}
              </TableCell>
              <TableCell className="text-center">{p.countsAsMember ? O : X}</TableCell>
              <TableCell className="text-center">{p.allowanceEligible ? O : X}</TableCell>
              <TableCell className="text-muted-foreground text-xs">{p.note}</TableCell>
              <TableCell>
                <div className="flex justify-end">
                  <PositionDialog
                    initial={p}
                    trigger={
                      <Button size="icon" variant="ghost" title="수정">
                        <Pencil />
                      </Button>
                    }
                  />
                  <ConfirmButton
                    title="직책 삭제"
                    description={`'${p.name}' 직책을 삭제합니다. 재임 기록이 있는 직책은 삭제되지 않습니다.`}
                    action={() => deletePosition(p.id)}
                    trigger={
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        title="삭제"
                        disabled={p._count.appointments > 0}
                      >
                        <Trash2 />
                      </Button>
                    }
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
