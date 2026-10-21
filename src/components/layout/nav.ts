import {
  BarChart3,
  Download,
  FileSearch,
  Gavel,
  type LucideIcon,
  MessageSquareText,
  Settings,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; children?: { href: string; label: string }[] };

/** 좌측 메뉴 */
export const NAV: NavItem[] = [
  { href: "/", label: "대시보드", icon: BarChart3 },
  { href: "/meetings", label: "이사회", icon: Gavel },
  { href: "/agendas", label: "안건 검색", icon: FileSearch },
  { href: "/remarks", label: "발언 관리", icon: MessageSquareText },
  {
    href: "/officers",
    label: "임원",
    icon: Users,
    children: [
      { href: "/officers", label: "임원 현황" },
      { href: "/officers/history", label: "역대 임원 리스트" },
      { href: "/officers/print", label: "임원명단 출력" },
    ],
  },
  {
    href: "/allowances",
    label: "수당 관리",
    icon: Wallet,
    children: [
      { href: "/allowances", label: "지급 내역" },
      { href: "/allowances/limits", label: "이사별 한도 현황" },
      { href: "/allowances/recommend", label: "임원추천위원회 수당" },
    ],
  },
  {
    href: "/committees",
    label: "소위원회",
    icon: UsersRound,
    children: [
      { href: "/committees", label: "위원 배정" },
      { href: "/committees/meetings", label: "개최·안건" },
    ],
  },
  { href: "/export", label: "데이터 내보내기", icon: Download },
  { href: "/settings", label: "설정", icon: Settings },
];
