import type { ReactNode } from "react";

interface Props {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  actions?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  align = "left",
  actions,
}: Props) {
  return (
    <header
      className={`page-hero${align === "center" ? " page-hero--center" : ""}${
        actions ? " page-hero--actions" : ""
      }`}
    >
      <div className="page-hero-text">
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
