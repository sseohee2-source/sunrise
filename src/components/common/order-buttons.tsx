"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { notifyResult } from "@/lib/notify";

/** 표시 순서 위/아래 이동 버튼 */
export function OrderButtons({
  first,
  last,
  move,
}: {
  first: boolean;
  last: boolean;
  move: (dir: -1 | 1) => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const run = (dir: -1 | 1) =>
    start(async () => {
      const r = await move(dir);
      if (!r.ok) notifyResult(r);
    });
  return (
    <div className="flex">
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        disabled={first || pending}
        onClick={() => run(-1)}
        title="위로"
      >
        <ChevronUp />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        disabled={last || pending}
        onClick={() => run(1)}
        title="아래로"
      >
        <ChevronDown />
      </Button>
    </div>
  );
}
