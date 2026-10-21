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
