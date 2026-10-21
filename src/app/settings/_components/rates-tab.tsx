"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { ConfirmButton } from "@/components/common/confirm-button";
import { Field } from "@/components/common/form-field";
import { MoneyInput } from "@/components/common/money-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtMoney, today } from "@/lib/date";
import { notifyResult } from "@/lib/notify";
import { deleteRate, saveRate, setProRata, type RateInput } from "../actions";

type RateRow = Omit<RateInput, "note"> & { id: number; note: string | null; _count: { payments: number } };

function RateDialog({ initial, base, trigger }: { initial?: RateRow; base?: RateRow; trigger: React.ReactNode }) {
  const blank = (): RateInput =>
    base
      ? { ...base, id: undefined, effectiveFrom: today(), note: "" }
      : { effectiveFrom: today(), monthlyFixed: 2_000_000, faceFee: 400_000, writtenFee: 150_000, annualLimit: 30_000_000, warningMargin: 0, note: "" };
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<RateInput>(blank);
  const [pending, start] = useTransition();
  const money = (k: keyof RateInput) => (n: number) => setV({ ...v, [k]: n });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV(initial ? { ...initial, note: initial.note ?? "" } : blank());
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial ? "수당 기준 수정" : "새 수당 기준 등록"}</DialogTitle>
          <DialogDescription>
            {initial
              ? "입력 오류를 고칠 때만 수정하세요. 기준 금액이 바뀐 경우에는 새 적용일로 추가 등록해야 과거 지급분이 당시 기준으로 유지됩니다."
              : "적용 시작일부터 새 기준이 적용됩니다. 그 이전 회의·월의 수당은 기존 기준을 그대로 씁니다."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="적용 시작일" required>
            <Input type="date" value={v.effectiveFrom} onChange={(e) => setV({ ...v, effectiveFrom: e.target.value })} />
          </Field>
          <Field label="정액급여(월)" required>
            <MoneyInput value={v.monthlyFixed} onChange={money("monthlyFixed")} />
          </Field>
          <Field label="회의수당 — 대면" required>
            <MoneyInput value={v.faceFee} onChange={money("faceFee")} />
          </Field>
          <Field label="회의수당 — 서면" required>
            <MoneyInput value={v.writtenFee} onChange={money("writtenFee")} />
          </Field>
          <Field label="1인당 연간 지급 한도" required hint="정액급여 + 이사회·임원추천위원회 회의수당 합산">
            <MoneyInput value={v.annualLimit} onChange={money("annualLimit")} />
          </Field>
          <Field
            label="한도 경고 여유분"
            hint={`(한도 − 여유분) = ${fmtMoney(v.annualLimit - v.warningMargin)}원부터 경고. 파악하지 못한 임원추천위원회 수당 감안용`}
          >
            <MoneyInput value={v.warningMargin} onChange={money("warningMargin")} />
          </Field>
          <Field label="비고" className="col-span-2">
            <Input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="예: ○○부 지침 개정 반영" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
          <Button disabled={pending} onClick={() => start(async () => { if (notifyResult(await saveRate({ ...v, id: initial?.id }))) setOpen(false); })}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RatesTab({ rates, proRata }: { rates: RateRow[]; proRata: boolean }) {
  const [pending, start] = useTransition();
  const current = rates.find((r) => r.effectiveFrom <= today());
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">적용 시작일 기준으로 이력을 관리합니다. 지급 내역은 회의일·해당 월에 적용되던 기준으로 만들어집니다.</p>
        <RateDialog base={current} trigger={<Button size="sm"><Plus />새 기준 등록</Button>} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>적용 시작일</TableHead>
            <TableHead className="text-right">정액급여(월)</TableHead>
            <TableHead className="text-right">대면 회의수당</TableHead>
            <TableHead className="text-right">서면 회의수당</TableHead>
            <TableHead className="text-right">연간 한도</TableHead>
            <TableHead className="text-right">경고 여유분</TableHead>
            <TableHead>비고</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rates.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="tabular-nums">
                {fmtDate(r.effectiveFrom)} {r.id === current?.id && <Badge className="ml-1">현행</Badge>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{fmtMoney(r.monthlyFixed)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtMoney(r.faceFee)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtMoney(r.writtenFee)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtMoney(r.annualLimit)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtMoney(r.warningMargin)}</TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {r.note}
                {r._count.payments > 0 && <div>지급 내역 {r._count.payments}건에 적용</div>}
              </TableCell>
              <TableCell>
                <div className="flex justify-end">
                  <RateDialog initial={r} trigger={<Button size="icon" variant="ghost" title="수정"><Pencil /></Button>} />
                  <ConfirmButton
                    title="수당 기준 삭제"
                    description={`${fmtDate(r.effectiveFrom)}부터 적용되는 기준을 삭제합니다.`}
                    action={() => deleteRate(r.id)}
                    trigger={
                      <Button size="icon" variant="ghost" className="text-destructive" title="삭제" disabled={r._count.payments > 0}>
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

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">정액급여 계산 방식</CardTitle>
          <CardDescription>월 중간에 취임·퇴임한 경우의 정액급여</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={proRata}
              disabled={pending}
              onCheckedChange={(c) => start(async () => void notifyResult(await setProRata(c === true), "설정을 바꿨습니다."))}
            />
            일할계산 (월 정액 × 그 달 재임일수 ÷ 그 달 일수, 원 미만 절사)
          </label>
          <p className="text-muted-foreground mt-2 text-xs">
            해제하면 그 달에 하루라도 재임한 경우 한 달 치 전액을 지급 대상으로 만듭니다. 이미 생성된 지급 내역은 바뀌지 않습니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
