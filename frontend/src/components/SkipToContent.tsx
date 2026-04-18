/**
 * Skip to main content link for keyboard users.
 * Only visible when focused (Tab key).
 */
export default function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-primary focus:px-6 focus:py-3 focus:text-primary-foreground focus:text-sm focus:font-semibold focus:shadow-lg focus:outline-none"
    >
      跳到主要内容
    </a>
  );
}
