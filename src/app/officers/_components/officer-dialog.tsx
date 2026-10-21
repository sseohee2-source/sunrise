"use client";

import { useState, useTransition } from "react";

import { termEnd } from "@/lib/date";
import { OPEN_TERM_LABEL } from "@/lib/domain/appointment";

import { Field } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { notifyResult } from "@/lib/notify";
import { saveOfficer, type OfficerInput } from "../actions";

export type PersonOption = {
  id: number;
  name: string;
  education: string | null;
  career: string | null;
  note: string | null;
  /** 동명이인 구분용 요약 (예: 비상임이사 '23~'25) */
  summary: string;
  positionIds: number[];
};

export type PositionOption = { id: number; name: string; category: string; termYears: number | null };

type Initial = {
  appointmentId: number;
  personId: number;
  person: OfficerInput["person"];
  positionId: number;
  startDate: string;
  endDate: string | null;
  retiredDate: string | null;
  isReappointment: boolean;
  note: string | null;
};

export function OfficerDialog({
  positions,
  persons,
  initial,
  trigger,
}: {
  positions: PositionOption[];
  persons: PersonOption[];
  initial?: Initial;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const editing = !!initial;

  const empty = { name: "", education: "", career: "", note: "" };
  const [mode, setMode] = useState<"new" | "existing">(editing ? "existing" : "new");
  const [personId, setPersonId] = useState<number | undefined>(initial?.personId);
  const [person, setPerson] = useState(initial?.person ?? empty);
  const [positionId, setPositionId] = useState<number>(initial?.positionId ?? 0);
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [retiredDate, setRetiredDate] = useState(initial?.retiredDate ?? "");
  const [isReappointment, setIsReappointment] = useState(initial?.isReappointment ?? false);
  const [note, setNote] = useState(initial?.note ?? "");
  // 종료일을 직접 고치면 자동 계산을 멈춤 (수정 시에는 처음부터 멈춤)
  const [endTouched, setEndTouched] = useState(editing);

  function reset() {
    setMode(editing ? "existing" : "new");
    setPersonId(initial?.personId);
    setPerson(initial?.person ?? empty);
    setPositionId(initial?.positionId ?? 0);
    setStartDate(initial?.startDate ?? "");
    setEndDate(initial?.endDate ?? "");
    setRetiredDate(initial?.retiredDate ?? "");
    setIsReappointment(initial?.isReappointment ?? false);
    setNote(initial?.note ?? "");
    setEndTouched(editing);
  }

  /** 정관 제7조 기본 임기로 종료일 자동 계산 (이사장 3년, 이사·감사 2년, 연임 1년, 당연직은 비움) */
  function autoEnd(next: { positionId?: number; startDate?: string; isReappointment?: boolean }) {
    if (endTouched) return;
    const pos = positions.find((p) => p.id === (next.positionId ?? positionId));
    const start = next.startDate ?? startDate;
    const re = next.isReappointment ?? isReappointment;
    if (!pos || !start) return;
    if (pos.termYears == null) setEndDate("");
    else setEndDate(termEnd(start, re ? 1 : pos.termYears));
  }

  function choosePerson(id: number) {
    const p = persons.find((x) => x.id === id);
    setPersonId(p?.id);
    setPerson(p ? { name: p.name, education: p.education ?? "", career: p.career ?? "", note: p.note ?? "" } : empty);
    // 같은 직책을 이전에 맡았으면 연임으로 미리 체크
    if (p && positionId) {
      const re = p.positionIds.includes(positionId);
      setIsReappointment(re);
      autoEnd({ isReappointment: re });
    }
  }

  function choosePosition(id: number) {
    setPositionId(id);
    let re = isReappointment;
    if (!editing && mode === "existing" && personId) {
      re = !!persons.find((x) => x.id === personId)?.positionIds.includes(id);
      setIsReappointment(re);
    }
    autoEnd({ positionId: id, isReappointment: re });
  }

  const pos = positions.find((p) => p.id === positionId);
  const openTerm = pos?.termYears == null && !!pos;

  function submit() {
    startTransition(async () => {
      const r = await saveOfficer({
        appointmentId: initial?.appointmentId,
        personId: mode === "existing" ? personId : undefined,
        person,
        positionId,
        startDate,
        endDate,
        retiredDate,
        isReappointment,
        note,
      });
      if (notifyResult(r)) setOpen(false);
    });
  }

  const standing = positions.filter((p) => p.category === "STANDING");
  const nonStanding = positions.filter((p) => p.category !== "STANDING");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "임원 정보 수정" : "임원 등록"}</DialogTitle>
          <DialogDescription>
            한 사람이 연임하거나 직책을 바꾸면 &lsquo;기존&rsquo;을 선택해 재임 기록을 새로 추가하세요.
          </DialogDescription>
        </DialogHeader>

        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">인적사항</h3>
          {!editing && (
            <div className="flex gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  checked={mode === "new"}
                  onChange={() => {
                    setMode("new");
                    setPersonId(undefined);
                    setPerson(empty);
                  }}
                />
                신임
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} />
                기존 (연임·직책 변경)
              </label>
            </div>
          )}
          {!editing && mode === "existing" && (
            <Field label="인물" required>
              <NativeSelect value={personId ?? ""} onChange={(e) => choosePerson(Number(e.target.value))}>
                <option value="">선택하세요</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.summary})
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="성명" required>
              <Input value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} />
            </Field>
            <Field label="인물 비고">
              <Input value={person.note} onChange={(e) => setPerson({ ...person, note: e.target.value })} />
            </Field>
            <Field label="학력" hint="한 줄에 하나씩 입력">
              <Textarea
                rows={3}
                value={person.education}
                onChange={(e) => setPerson({ ...person, education: e.target.value })}
              />
            </Field>
            <Field label="주요경력" hint="한 줄에 하나씩 입력">
              <Textarea
                rows={3}
                value={person.career}
                onChange={(e) => setPerson({ ...person, career: e.target.value })}
              />
            </Field>
          </div>
          {mode === "existing" && personId && (
            <p className="text-muted-foreground text-xs">
              ※ 인적사항(성명·학력·경력)을 고치면 이 사람의 모든 재임 기록에 반영됩니다.
            </p>
          )}
        </section>

        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">재임 정보</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="직책" required>
              <NativeSelect value={positionId || ""} onChange={(e) => choosePosition(Number(e.target.value))}>
                <option value="">선택하세요</option>
                <optgroup label="상임">
                  {standing.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="비상임">
                  {nonStanding.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              </NativeSelect>
            </Field>
            <Field
              label="연임 여부"
              hint={
                isReappointment
                  ? pos?.name === "이사장"
                    ? "연임은 1년 단위입니다. 이사장 연임 시 기관장계약을 다시 체결해야 합니다."
                    : "연임은 1년 단위입니다 (임원추천위원회 추천 없음)."
                  : undefined
              }
            >
              <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={isReappointment}
                  onCheckedChange={(v) => {
                    setIsReappointment(v === true);
                    autoEnd({ isReappointment: v === true });
                  }}
                />
                연임
              </label>
            </Field>
            <Field label="임기 시작일" required>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  autoEnd({ startDate: e.target.value });
                }}
              />
            </Field>
            <Field
              label="임기 종료일(예정)"
              required={!openTerm}
              hint={
                openTerm
                  ? `${pos?.name}는 임기가 ${OPEN_TERM_LABEL}이므로 비워 둡니다.`
                  : "시작일·직책을 고르면 자동 계산됩니다 (이사장 3년, 이사·감사 2년, 연임 1년). 직접 고칠 수 있습니다."
              }
            >
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setEndTouched(true);
                }}
              />
            </Field>
            <Field
              label="실제 퇴임일"
              hint="퇴임한 경우에만 입력. 비워 두면 임기 종료일이 지나도 후임자 임명 시까지 '직무수행'으로 봅니다."
            >
              <Input type="date" value={retiredDate} onChange={(e) => setRetiredDate(e.target.value)} />
            </Field>
            <Field label="재임 비고">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 중도 퇴임 사유" />
            </Field>
          </div>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "저장 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
