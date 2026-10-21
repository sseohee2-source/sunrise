import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 내부 업무용 앱: 모든 화면을 요청 시점의 DB 값으로 그린다 (루트 layout 의 dynamic = "force-dynamic").
  // Cache Components 는 사용하지 않음.
  cacheComponents: false,
  serverExternalPackages: ["@prisma/client", "exceljs"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
