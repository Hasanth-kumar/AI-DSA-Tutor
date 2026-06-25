/** Hex mark used in the sidebar brand icon and app logo assets. */
export const BRAND_MARK_PATH =
  "M8 1L2 4.5v5L8 13l6-3.5v-5L8 1zm0 2.2l3.8 2.2L8 7.6 4.2 5.4 8 3.2zM3.5 6.8L7 8.7V11L3.5 9V6.8zm5 4.2V8.7l3.5-1.9V9L8.5 11z";

interface BrandLogoMarkProps {
  className?: string;
}

/** White hex mark on transparent background (parent supplies the accent tile). */
export function BrandLogoMark({ className }: BrandLogoMarkProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d={BRAND_MARK_PATH} />
    </svg>
  );
}
