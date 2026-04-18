declare const __BUILD_TIME__: string;

/**
 * Floating bottom-right badge showing build timestamp.
 * Click to copy. Hidden on print.
 */
export default function BuildBadge() {
  const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';
  if (!buildTime) return null;

  // Format as "YYYY-MM-DD HH:mm UTC" — compact, unambiguous.
  const d = new Date(buildTime);
  const pad = (n: number) => String(n).padStart(2, '0');
  const label = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())} UTC`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(`Build: ${buildTime}`).catch(() => {});
  };

  return (
    <button
      onClick={handleCopy}
      title={`点击复制完整构建时间\n${buildTime}`}
      aria-label={`构建于 ${label}，点击复制`}
      className="fixed bottom-2 right-2 z-30 hidden md:inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground/70 backdrop-blur-sm hover:bg-muted hover:text-muted-foreground transition-colors print:hidden"
    >
      <span aria-hidden="true">⚙</span>
      <span>构建 {label}</span>
    </button>
  );
}
