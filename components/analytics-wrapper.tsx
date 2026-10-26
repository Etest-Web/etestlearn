"use client"
import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/next";

export function AnalyticsWrapper() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <Analytics />;
}