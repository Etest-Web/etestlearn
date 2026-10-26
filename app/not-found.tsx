import { Button, EmptyState } from "@/components/ui";
import { Compass, GraduationCap } from "lucide-react";
import Link from "next/link";

/**
 * `/_not-found` is not in `proxy.ts`'s public-route map, so it is served the
 * nonce-based CSP. A nonce only lands on inline scripts during a per-request
 * render, so this boundary must stay dynamic to hydrate like every other
 * nonce-protected page. (Its content and links would still show from static
 * HTML, but keeping it dynamic keeps the nonce story uniform.)
 */
export const dynamic = "force-dynamic";

export default function NotFound() {
    return (
        <main className="flex min-h-dvh items-center justify-center px-4 py-12">
            <div className="w-full max-w-lg">
                <div className="flex items-center justify-center gap-2">
                    <GraduationCap aria-hidden className="h-5 w-5 text-brand" />
                    <span className="display-subheading text-lg">
                        Glypha Learning
                    </span>
                </div>

                <div className="mt-8 border border-rule bg-card">
                    {/* The numeral is the page's one piece of personality, so it
                        stays at display scale — but it now sits on a hairline
                        plane rather than floating on a gradient. `tabular` keeps
                        the digits on a fixed advance as the font swaps. */}
                    <p className="display-heading tabular px-6 pt-12 text-center text-[clamp(3.5rem,14vw,5.5rem)] text-brand">
                        404
                    </p>
                    {/* EmptyState owns an h3, so the page heading is kept in
                        the document outline as an sr-only h1 rather than being
                        dropped. */}
                    <h1 className="sr-only">Page not found — 404</h1>
                    <EmptyState
                        className="border-y-0"
                        icon={Compass}
                        tone="warning"
                        title="Page not found"
                        description="The page you&apos;re looking for doesn&apos;t exist or may have moved."
                        action={
                            <div className="flex flex-wrap items-center justify-center gap-2">
                                <Button render={<Link href="/" />}>Back home</Button>
                                <Button variant="outline" render={<Link href="/courses" />}>
                                    Browse courses
                                </Button>
                            </div>
                        }
                    />
                </div>
            </div>
        </main>
    );
}
