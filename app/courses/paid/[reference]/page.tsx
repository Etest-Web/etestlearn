"use client";

import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

type State = "verifying" | "success" | "failed" | "error";

export default function PaymentCallbackPage() {
  const router = useRouter();
  const params = useParams();
  const reference = (params.reference as string) ?? "";
  const verifyAndCompletePurchase = useAction(api.paystack.verifyAndCompletePurchase);

  const [state, setState] = useState<State>("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!reference) {
      setState("error");
      setMessage("No payment reference found in the URL.");
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        // Small delay to give the webhook a chance to land first.
        await new Promise((r) => setTimeout(r, 2000));
        if (cancelled) return;
        const result = await verifyAndCompletePurchase({ reference });
        if (cancelled) return;
        if (result.paid) {
          setState("success");
        } else {
          setState("failed");
          setMessage(`Transaction status: ${result.status ?? "unknown"}`);
        }
      } catch (err) {
        if (cancelled) return;
        setState("error");
        setMessage(err instanceof Error ? err.message : "Verification failed");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [reference, verifyAndCompletePurchase]);

  return (
    <main className="mx-auto max-w-md px-4 py-24">
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            {state === "verifying" && <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />}
            {state === "success" && <CheckCircle2 className="h-12 w-12 text-green-500" />}
            {(state === "failed" || state === "error") && <XCircle className="h-12 w-12 text-red-500" />}
          </div>
          <CardTitle>
            {state === "verifying" && "Verifying your payment..."}
            {state === "success" && "Payment successful!"}
            {state === "failed" && "Payment not completed"}
            {state === "error" && "Something went wrong"}
          </CardTitle>
          <CardDescription>
            {state === "verifying" && "Confirming your transaction with Paystack. This only takes a moment."}
            {state === "success" && "You've been enrolled in the course. Happy learning!"}
            {state === "failed" && message}
            {state === "error" && message}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center gap-3">
          {state === "success" && (
            <Button onClick={() => router.push("/dashboard/courses")}>Go to my courses</Button>
          )}
          {(state === "failed" || state === "error") && (
            <>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Try again
              </Button>
              <Button variant="ghost" onClick={() => router.push("/courses")}>
                Back to courses
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
