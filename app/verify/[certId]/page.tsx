"use client";

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { BadgeCheck, GraduationCap, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

function formatDate(ts: number) {
    return new Date(ts).toLocaleDateString("en-NG", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

export default function VerifyCertificatePage() {
    const params = useParams();
    const certId = params.certId as string;

    const result = useQuery(
        api.certificates.getCertificateForVerification,
        certId ? { certificateId: certId as never } : "skip",
    );

    return (
        <main className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-lg">
                <div className="flex items-center justify-center gap-2 mb-8">
                    <GraduationCap className="h-6 w-6 text-[#945DA3]" />
                    <span className="text-xl font-bold tracking-tight">Glypha Learning</span>
                </div>

                {result === undefined && (
                    <div className="bg-card rounded-2xl shadow-sm border p-10 text-center space-y-3">
                        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
                        <p className="text-muted-foreground">Verifying certificate...</p>
                    </div>
                )}

                {result === null && (
                    <div className="bg-card rounded-2xl shadow-sm border p-10 text-center space-y-3">
                        <XCircle className="h-12 w-12 text-red-500 mx-auto" />
                        <h1 className="text-xl font-bold">Certificate not found</h1>
                        <p className="text-muted-foreground text-sm">
                            This verification link is invalid. Check the link and try again.
                        </p>
                        <Link href="/" className="inline-block text-sm font-medium text-[#945DA3] hover:underline">
                            Back to Glypha Learning
                        </Link>
                    </div>
                )}

                {result && (
                    <div className="bg-card rounded-2xl shadow-sm border overflow-hidden">
                        <div className="bg-emerald-50 border-b border-emerald-100 p-5 flex items-start gap-3">
                            <BadgeCheck className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold text-emerald-800">Authentic certificate</p>
                                <p className="text-sm text-emerald-700/80">
                                    This certificate was issued by Glypha Learning and its details below are verified.
                                </p>
                            </div>
                        </div>

                        <dl className="p-8 space-y-6">
                            <div>
                                <dt className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                                    Awarded to
                                </dt>
                                <dd className="text-2xl font-bold mt-1">{result.holderName}</dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                                    For successfully completing
                                </dt>
                                <dd className="text-lg font-semibold mt-1">{result.courseTitle}</dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                                    Issued on
                                </dt>
                                <dd className="mt-1">{formatDate(result.issuedAt)}</dd>
                            </div>
                        </dl>
                    </div>
                )}
            </div>
        </main>
    );
}
