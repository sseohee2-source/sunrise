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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notifyResult } from "@/lib/notify";
import { deleteSimple, moveSimple, saveSimple, type SimpleInput, type SimpleKind } from "../actions";

type Item = { id: number; name: string; isActive: boolean; isHeadOffice?: boolean };

function ItemDialog({
  kind,
  noun,
  headOffice,
  initial,
  trigger,
}: {
  kind: SimpleKind;
  noun: string;
  headOffice: boolean;
  initial?: Item;
  trigger: React.ReactNode;
}) {
  const blank: SimpleInput = { name: "", isActive: true, isHeadOffice: false };
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<SimpleInput>(blank);
  const [pending, start] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV(initial ?? blank);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {noun} {initial ? "수정" : "추가"}
          </DialogTitle>
        </DialogHeader>
        <Field label={`${noun} 이름`} required>
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus />
        </Field>
        <div className="grid gap-2 text-sm">
          {headOffice && (
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={!!v.isHeadOffice} onCheckedChange={(c) => setV({ ...v, isHeadOffice: c === true })} />
              본사 지역 <span className="text-muted-foreground text-xs">(이 지역을 고르면 &lsquo;진주 본사 개최&rsquo;가 자동 체크됨)</span>
            </label>
          )}
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c === true })} />
            사용 <span className="text-muted-foreground text-xs">(해제 시 선택 목록에서 숨김, 기존 기록은 유지)</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
          <Button
            disabled={pending}
            onClick={() => start(async () => { if (notifyResult(await saveSimple(kind, { ...v, id: initial?.id }))) setOpen(false); })}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 부서·지역·소위원회처럼 이름만 관리하는 목록 */
export function SimpleTab({
  kind,
  noun,
  items,
  description,
  headOffice = false,
}: {
  kind: SimpleKind;
  noun: string;
  items: Item[];
  description?: string;
  headOffice?: boolean;
}) {
  return (
    <div className="grid max-w-2xl gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{description}</p>
        <ItemDialog kind={kind} noun={noun} headOffice={headOffice} trigger={<Button size="sm"><Plus />{noun} 추가</Button>} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">순서</TableHead>
            <TableHead>{noun}</TableHead>
            {headOffice && <TableHead className="text-center">본사 지역</TableHead>}
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it, i) => (
            <TableRow key={it.id} className={it.isActive ? "" : "opacity-50"}>
              <TableCell>
                <OrderButtons first={i === 0} last={i === items.length - 1} move={(d) => moveSimple(kind, it.id, d)} />
              </TableCell>
              <TableCell className="font-medium">
                {it.name} {!it.isActive && <Badge variant="outline">사용 안 함</Badge>}
              </TableCell>
              {headOffice && <TableCell className="text-center">{it.isHeadOffice ? <Badge>본사</Badge> : ""}</TableCell>}
              <TableCell>
                <div className="flex justify-end">
                  <ItemDialog
                    kind={kind}
                    noun={noun}
                    headOffice={headOffice}
                    initial={it}
                    trigger={<Button size="icon" variant="ghost" title="수정"><Pencil /></Button>}
                  />
                  <ConfirmButton
                    title={`${noun} 삭제`}
                    description={`'${it.name}'을(를) 삭제합니다. 사용 중인 기록이 있으면 삭제되지 않습니다.`}
                    action={() => deleteSimple(kind, it.id)}
                    trigger={<Button size="icon" variant="ghost" className="text-destructive" title="삭제"><Trash2 /></Button>}
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
