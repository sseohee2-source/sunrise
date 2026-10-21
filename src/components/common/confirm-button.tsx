"use client";

import { useState, useTransition } from "react";

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
import type { ActionResult } from "@/lib/action-result";
import { notifyResult } from "@/lib/notify";

/** 확인 창을 띄운 뒤 동작 실행 (삭제 등) */
export function ConfirmButton({
  title,
  description,
  confirmLabel = "삭제",
  successMessage = "삭제했습니다.",
  action,
  trigger,
}: {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  successMessage?: string;
  action: () => Promise<ActionResult>;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (notifyResult(await action(), successMessage)) setOpen(false);
              })
            }
          >
            {pending ? "처리 중…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
