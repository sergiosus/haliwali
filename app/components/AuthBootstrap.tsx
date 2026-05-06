"use client";

import { useEffect } from "react";
import { refreshAuthFromServer } from "../lib/auth";

/** Runs once on load: sync in-memory auth from HttpOnly session via `/api/auth/me`. */
export function AuthBootstrap() {
  useEffect(() => {
    void refreshAuthFromServer();
  }, []);
  return null;
}
