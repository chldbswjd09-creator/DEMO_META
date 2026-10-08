// 브랜드 로고 — 실제 회사 로고(이리데센트 실버 십자)를 누끼(투명 배경)로 사용.
// 원본 검은 배경을 밝기 기반 알파로 제거해 public/logo.png 로 저장(투명 PNG, 십자에 맞춰 크롭).
// 타일 없이 십자만 얹고, 밝은 배경에서 형태가 보이도록 은은한 드롭섀도우만 준다.

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt=""
        width={size}
        height={size}
        draggable={false}
        className="max-w-none select-none"
        style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 1px 2px rgba(20,45,55,0.30))" }}
      />
    </span>
  );
}

export function Logo({
  size = 34,
  title = "광고 성과 분석",
  subtitle,
}: {
  size?: number;
  title?: string;
  subtitle?: string;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="flex min-w-0 flex-col leading-none">
        <span className="truncate text-[15px] font-bold tracking-tight text-slate-800">{title}</span>
        {subtitle && <span className="mt-0.5 truncate text-[11px] font-medium text-brand">{subtitle}</span>}
      </span>
    </span>
  );
}
