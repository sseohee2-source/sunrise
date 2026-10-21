"use client";

import { FileSpreadsheet } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  /** 엑셀을 만드는 API 경로 (예: /api/export/agendas) */
  endpoint: string;
  /** 추가로 붙일 조건 (현재 화면 주소의 검색 조건은 자동으로 함께 전달됨) */
  params?: Record<string, string | number | undefined>;
  label?: string;
};

function DownloadLink({ endpoint, params, label = "엑셀 다운로드" }: Props) {
  const searchParams = useSearchParams();
  const q = new URLSearchParams(searchParams.toString());
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === "") q.delete(k);
    else q.set(k, String(v));
  }
  const qs = q.toString();
  return (
    <Button asChild variant="outline" className="border-emerald-600/40 text-emerald-700 hover:bg-emerald-50">
      <a href={qs ? `${endpoint}?${qs}` : endpoint} download>
        <FileSpreadsheet />
        {label}
      </a>
    </Button>
  );
}

/**
 * 화면 우측 상단 "엑셀 다운로드" 버튼.
 * 현재 화면의 연도·기간·필터·검색 조건(주소창의 ?year=… 등)을 그대로 엑셀 API 에 넘긴다.
 */
export function ExcelDownloadButton(props: Props) {
  return (
    <Suspense>
      <DownloadLink {...props} />
    </Suspense>
  );
}
