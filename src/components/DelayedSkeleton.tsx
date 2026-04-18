import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface DelayedSkeletonProps {
  /** 延迟多少毫秒后才显示骨架屏；快网络下组件早已渲染，骨架屏永远不会出现 */
  delay?: number;
  /** 骨架屏布局变体 */
  variant?: 'page' | 'card';
}

/**
 * 延迟骨架屏（SO / NN/g / Vercel 共识）
 * - 慢网：delay 后出骨架，用户知道还在加载
 * - 快网：组件先渲染好，骨架永不出现，避免闪烁
 */
export function DelayedSkeleton({
  delay = 200,
  variant = 'page',
}: DelayedSkeletonProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (!show) return null;

  if (variant === 'card') {
    return (
      <div
        className="mx-auto max-w-lg space-y-3 p-4"
        role="status"
        aria-live="polite"
        aria-label="正在加载"
      >
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  // page variant: 首屏骨架（header + 主卡片 + 按钮行）
  return (
    <div
      className="mx-auto max-w-lg space-y-5 p-5"
      role="status"
      aria-live="polite"
      aria-label="正在加载"
    >
      <div className="space-y-2 text-center">
        <Skeleton className="mx-auto h-8 w-40" />
        <Skeleton className="mx-auto h-4 w-56" />
      </div>
      <Skeleton className="h-48 w-full rounded-2xl" />
      <div className="flex gap-2">
        <Skeleton className="h-11 flex-1 rounded-xl" />
        <Skeleton className="h-11 w-24 rounded-xl" />
      </div>
    </div>
  );
}
