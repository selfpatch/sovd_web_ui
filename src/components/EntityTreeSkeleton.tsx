import { Skeleton } from '@/components/ui/skeleton';

interface EntityTreeSkeletonProps {
    /** Number of root items to show */
    itemCount?: number;
}

/**
 * Skeleton loading state for the entity tree sidebar
 */
export function EntityTreeSkeleton({ itemCount = 4 }: EntityTreeSkeletonProps) {
    return (
        <div className="space-y-1 p-2">
            {Array.from({ length: itemCount }).map((_, i) => (
                <div key={i} className="space-y-1">
                    {/* Root level item */}
                    <div className="flex items-center gap-2 py-1.5 px-2">
                        <Skeleton className="w-4 h-4 rounded" />
                        <Skeleton className="w-4 h-4 rounded" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="w-12 h-4 rounded" />
                    </div>
                    {/* Simulated children for first two items */}
                    {i < 2 && (
                        <div className="pl-6 space-y-1">
                            {Array.from({ length: 2 }).map((_, j) => (
                                <div key={j} className="flex items-center gap-2 py-1.5 px-2">
                                    <Skeleton className="w-4 h-4 rounded" />
                                    <Skeleton className="w-4 h-4 rounded" />
                                    <Skeleton className="h-4 flex-1" />
                                    <Skeleton className="w-16 h-4 rounded" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

/**
 * Skeleton for a single tree node
 */
export function TreeNodeSkeleton() {
    return (
        <div className="flex items-center gap-2 py-1.5 px-2 animate-pulse">
            <Skeleton className="w-4 h-4 rounded" />
            <Skeleton className="w-4 h-4 rounded" />
            <Skeleton className="h-4 flex-1 max-w-[180px]" />
            <Skeleton className="w-14 h-4 rounded" />
        </div>
    );
}
