import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

/**
 * Skeleton loading state for entity detail panels
 */
export function EntityDetailSkeleton() {
    return (
        <div className="space-y-6">
            {/* Breadcrumb skeleton */}
            <div className="flex items-center gap-2">
                <Skeleton className="w-4 h-4" />
                <Skeleton className="w-4 h-4" />
                <Skeleton className="w-16 h-4" />
                <Skeleton className="w-4 h-4" />
                <Skeleton className="w-24 h-4" />
            </div>

            {/* Header card skeleton */}
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <Skeleton className="w-10 h-10 rounded-lg" />
                            <div className="space-y-2">
                                <Skeleton className="h-6 w-48" />
                                <div className="flex items-center gap-2">
                                    <Skeleton className="h-5 w-16 rounded-full" />
                                    <Skeleton className="h-4 w-4" />
                                    <Skeleton className="h-4 w-32" />
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-8 w-24 rounded-md" />
                            <Skeleton className="h-8 w-24 rounded-md" />
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Content card skeleton */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Skeleton className="w-5 h-5" />
                        <Skeleton className="h-5 w-32" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                                <Skeleton className="w-8 h-8 rounded" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-48" />
                                    <Skeleton className="h-3 w-32" />
                                </div>
                                <Skeleton className="w-4 h-4" />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

/**
 * Skeleton for statistics cards grid
 */
export function StatCardsSkeleton() {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-3 rounded-lg border">
                    <Skeleton className="w-4 h-4 mb-1" />
                    <Skeleton className="h-8 w-12 mb-1" />
                    <Skeleton className="h-3 w-16" />
                </div>
            ))}
        </div>
    );
}

/**
 * Skeleton for resource list items
 */
export function ResourceListSkeleton({ count = 5 }: { count?: number }) {
    return (
        <div className="space-y-2">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg">
                    <Skeleton className="h-5 w-12 rounded-full" />
                    <Skeleton className="h-4 flex-1 max-w-[200px]" />
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="w-4 h-4" />
                </div>
            ))}
        </div>
    );
}
