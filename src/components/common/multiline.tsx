/** 여러 줄 텍스트를 줄바꿈 그대로 표시 */
export function Multiline({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  return <div className={`whitespace-pre-line ${className ?? ""}`}>{text}</div>;
}
