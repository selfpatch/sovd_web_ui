import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home, Bug } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
    /** Called when error is caught */
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    /** Called when user clicks retry */
    onRetry?: () => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
    showDetails: boolean;
}

/**
 * Error Boundary component for catching React errors
 *
 * Features:
 * - Catches render errors in child components
 * - Provides retry functionality
 * - Shows error details in collapsible section
 * - Reports errors via onError callback
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            showDetails: false,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        this.setState({ errorInfo });

        // Report error
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }

        // Log to console in development
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    handleRetry = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
            showDetails: false,
        });

        if (this.props.onRetry) {
            this.props.onRetry();
        }
    };

    handleReload = (): void => {
        window.location.reload();
    };

    toggleDetails = (): void => {
        this.setState((prev) => ({ showDetails: !prev.showDetails }));
    };

    render(): ReactNode {
        if (this.state.hasError) {
            // Custom fallback provided
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // Default error UI
            return (
                <div className="flex items-center justify-center min-h-[400px] p-6">
                    <Card className="max-w-lg w-full">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-destructive/10">
                                    <AlertCircle className="w-6 h-6 text-destructive" />
                                </div>
                                <div>
                                    <CardTitle>Something went wrong</CardTitle>
                                    <CardDescription>
                                        An unexpected error occurred while rendering this component.
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Error message */}
                            <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                                <p className="text-sm font-mono text-destructive">
                                    {this.state.error?.message || 'Unknown error'}
                                </p>
                            </div>

                            {/* Error details (collapsible) */}
                            <Collapsible open={this.state.showDetails} onOpenChange={this.toggleDetails}>
                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="gap-2">
                                        <Bug className="w-4 h-4" />
                                        {this.state.showDetails ? 'Hide' : 'Show'} technical details
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <div className="mt-2 p-3 rounded-lg bg-muted text-xs font-mono overflow-auto max-h-48">
                                        <p className="font-semibold mb-2">Error Stack:</p>
                                        <pre className="whitespace-pre-wrap text-muted-foreground">
                                            {this.state.error?.stack || 'No stack trace available'}
                                        </pre>
                                        {this.state.errorInfo?.componentStack && (
                                            <>
                                                <p className="font-semibold mt-4 mb-2">Component Stack:</p>
                                                <pre className="whitespace-pre-wrap text-muted-foreground">
                                                    {this.state.errorInfo.componentStack}
                                                </pre>
                                            </>
                                        )}
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        </CardContent>
                        <CardFooter className="flex gap-2">
                            <Button variant="default" onClick={this.handleRetry} className="gap-2">
                                <RefreshCw className="w-4 h-4" />
                                Try Again
                            </Button>
                            <Button variant="outline" onClick={this.handleReload} className="gap-2">
                                <Home className="w-4 h-4" />
                                Reload Page
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}

/**
 * Hook-based error boundary wrapper for functional components
 * Useful for wrapping specific sections of the UI
 */
interface ErrorBoundaryWrapperProps {
    children: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    onRetry?: () => void;
    title?: string;
    description?: string;
}

export function ErrorBoundaryWrapper({
    children,
    onError,
    onRetry,
    title,
    description,
}: ErrorBoundaryWrapperProps): React.JSX.Element {
    return (
        <ErrorBoundary
            onError={onError}
            onRetry={onRetry}
            fallback={
                title || description ? (
                    <ErrorFallback title={title} description={description} onRetry={onRetry} />
                ) : undefined
            }
        >
            {children}
        </ErrorBoundary>
    );
}

/**
 * Simple error fallback component
 */
interface ErrorFallbackProps {
    title?: string;
    description?: string;
    onRetry?: () => void;
}

function ErrorFallback({ title, description, onRetry }: ErrorFallbackProps): React.JSX.Element {
    return (
        <div className="flex flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="w-10 h-10 text-destructive mb-3" />
            <h3 className="font-semibold text-lg">{title || 'Error loading content'}</h3>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
            {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry} className="mt-4 gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Retry
                </Button>
            )}
        </div>
    );
}
