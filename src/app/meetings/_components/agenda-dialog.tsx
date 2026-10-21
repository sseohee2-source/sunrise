"use client";

import { useState, useTransition } from "react";

import { Field } from "@/components/common/form-field";
import { KeywordInput } from "@/components/common/keyword-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { AGENDA_RESULT, AGENDA_TYPE, RESULTS_BY_TYPE } from "@/lib/codes";
import { notifyResult } from "@/lib/notify";
import { saveAgenda, type AgendaInput } from "../actions";

export type DeptOption = { id: number; name: string; isActive: boolean };

export function AgendaDialog({
  meetingId,
  departments,
  nextNo,
  initial,
  trigger,
}: {
  meetingId: number;
  departments: DeptOption[];
  /** 구분별 다음 번호 */
  nextNo: Record<string, number>;
  initial?: AgendaInput;
  trigger: React.ReactNode;
}) {
  const blank = (type = "DELIBERATION"): AgendaInput => ({
    meetingId,
    type,
    agendaNo: nextNo[type] ?? 1,
    title: "",
    departmentId: null,
    presenter: "",
    contact: "",
    result: "",
    amendment: "",
    description: "",
    keywords: "",
  });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<AgendaInput>(blank());
  const [pending, start] = useTransition();
  const set = (patch: Partial<AgendaInput>) => setV((p) => ({ ...p, ...patch }));
  const results = RESULTS_BY_TYPE[v.type as keyof typeof RESULTS_BY_TYPE] ?? [];

  function changeType(type: string) {
    // 새 안건이면 구분에 맞는 다음 번호로, 결과는 구분에 맞지 않으면 비움
    const allowed = RESULTS_BY_TYPE[type as keyof typeof RESULTS_BY_TYPE] as readonly string[];
    set({
      type,
      ...(initial ? {} : { agendaNo: nextNo[type] ?? 1 }),
      ...(allowed.includes(v.result) ? {} : { result: "" }),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV(initial ?? blank());
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "안건 수정" : "안건 추가"}</DialogTitle>
          <DialogDescription>안건 번호는 구분별로 매깁니다 (심의 제1호…, 보고 제1호…).</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-3">
          <Field label="구분" required>
            <NativeSelect value={v.type} onChange={(e) => changeType(e.target.value)}>
              {Object.entries(AGENDA_TYPE).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="안건 번호" required>
            <div className="flex items-center gap-1.5 text-sm">
              제
              <Input
                type="number"
                min={1}
                value={v.agendaNo}
                onChange={(e) => set({ agendaNo: Number(e.target.value) })}
                className="w-20"
              />
              호
            </div>
          </Field>
          <Field label="안건명" required className="col-span-2">
            <Input value={v.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="담당부서">
            <NativeSelect
              value={v.departmentId ?? ""}
              onChange={(e) => set({ departmentId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">선택 안 함</option>
              {departments
                .filter((d) => d.isActive || d.id === v.departmentId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="발표자">
            <Input
              value={v.presenter}
              onChange={(e) => set({ presenter: e.target.value })}
              placeholder="예: 기획조정실장"
            />
          </Field>
          <Field label="담당자">
            <Input value={v.contact} onChange={(e) => set({ contact: e.target.value })} placeholder="예: 홍길동 차장" />
          </Field>
          <Field label="결과">
            <NativeSelect value={v.result} onChange={(e) => set({ result: e.target.value })}>
              <option value="">미입력</option>
              {results.map((k) => (
                <option key={k} value={k}>
                  {AGENDA_RESULT[k]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {v.result === "AMENDED" && (
            <Field label="수정 내용" className="col-span-4">
              <Textarea rows={2} value={v.amendment} onChange={(e) => set({ amendment: e.target.value })} />
            </Field>
          )}
          <Field label="설명 (선택)" className="col-span-4">
            <Textarea rows={2} value={v.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label="키워드 (선택)" className="col-span-4" hint="안건 검색에서 함께 찾아집니다.">
            <KeywordInput value={v.keywords} onChange={(keywords) => set({ keywords })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (notifyResult(await saveAgenda(v))) setOpen(false);
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
