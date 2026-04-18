import { motion, AnimatePresence } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{ keys: string[]; description: string }>;
}

interface KeyboardShortcutsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  groups: ShortcutGroup[];
}

function KeyBadge({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[2rem] items-center justify-center rounded-md border border-border bg-muted px-2 py-1 text-xs font-mono font-semibold text-foreground shadow-sm">
      {children}
    </kbd>
  );
}

export default function KeyboardShortcutsPanel({
  isOpen,
  onClose,
  groups,
}: KeyboardShortcutsPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-foreground/20 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed inset-x-4 bottom-4 top-auto z-[101] mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
            role="dialog"
            aria-label="键盘快捷键帮助"
          >
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Keyboard className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">键盘快捷键</h2>
              </div>
              <button
                onClick={onClose}
                className="a11y-target rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="关闭快捷键帮助"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Shortcut Groups */}
            <div className="max-h-[60vh] overflow-y-auto space-y-5">
              {groups.map((group) => (
                <div key={group.title}>
                  <h3 className="mb-2.5 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.title}
                  </h3>
                  <div className="space-y-2">
                    {group.shortcuts.map((shortcut, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-muted/50"
                      >
                        <span className="text-sm text-foreground">
                          {shortcut.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, j) => (
                            <span key={j} className="flex items-center gap-1">
                              {j > 0 && (
                                <span className="text-xs text-muted-foreground">+</span>
                              )}
                              <KeyBadge>{key}</KeyBadge>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-5 pt-4 border-t border-border text-center">
              <p className="text-xs text-muted-foreground">
                按 <KeyBadge>?</KeyBadge> 打开/关闭此面板 · 按 <KeyBadge>Esc</KeyBadge> 关闭
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
