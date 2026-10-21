import { Construction } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";

/** 아직 구현 전인 메뉴 */
export function ComingSoon({ title, stage, items }: { title: string; stage: number; items?: string[] }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <CardContent className="flex items-start gap-3">
          <Construction className="text-muted-foreground mt-0.5 size-5" />
          <div>
            <p className="font-medium">{stage}단계에서 구현할 화면입니다.</p>
            {items && (
              <ul className="text-muted-foreground mt-2 list-disc pl-5 text-sm">
                {items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/** 화면 일부(탭)가 아직 구현 전일 때 */
export function ComingSoonInline({ stage, text }: { stage: number; text: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <Construction className="text-muted-foreground size-5" />
        <p>
          {text} 기능은 <b>{stage}단계</b>에서 구현합니다.
        </p>
      </CardContent>
    </Card>
  );
}
