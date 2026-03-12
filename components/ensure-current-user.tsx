"use client";

import { useEffect, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export function EnsureCurrentUser() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensureCurrentUser);
  const [hasEnsured, setHasEnsured] = useState(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated || hasEnsured) return;

    void ensureUser({})
      .then(() => setHasEnsured(true))
      .catch((err) => {
        console.error("Failed to ensure current user in Convex", err);
      });
  }, [isAuthenticated, isLoading, hasEnsured, ensureUser]);

  return null;
}

