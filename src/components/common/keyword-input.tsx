"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/** 키워드(태그) 입력: Enter 또는 쉼표로 추가, ×로 삭제. 값은 쉼표로 이은 문자열 */
export function KeywordInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState("");
  const list = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  function add(raw: string) {
    const items = raw
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!items.length) return;
    onChange([...new Set([...list, ...items])].join(","));
    setText("");
  }

  return (
    <div className="border-input flex min-h-9 flex-wrap items-center gap-1 rounded-md border bg-white px-2 py-1 shadow-xs">
      {list.map((k) => (
        <Badge key={k} variant="secondary" className="gap-1">
          {k}
          <button
            type="button"
            className="cursor-pointer opacity-60 hover:opacity-100"
            onClick={() => onChange(list.filter((x) => x !== k).join(","))}
            aria-label={`${k} 삭제`}
          >
            <X />
          </button>
        </Badge>
      ))}
      <Input
        value={text}
        onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && list.length) {
            onChange(list.slice(0, -1).join(","));
          }
        }}
        onBlur={() => add(text)}
        placeholder={list.length ? "" : "입력 후 Enter (예: 예산, 정관)"}
        className="h-7 min-w-32 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
