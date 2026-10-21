import * as React from "react";

import { cn } from "@/lib/utils";

/** 브라우저 기본 선택 상자 (키보드 입력·자동완성이 익숙해 사무용 화면에 사용) */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "border-input h-9 w-full min-w-0 cursor-pointer rounded-md border bg-white px-2.5 py-1 text-sm shadow-xs outline-none",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
