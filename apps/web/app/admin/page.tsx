"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { safeReplace } from "@/lib/navigation";

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    safeReplace(router, "/command");
  }, [router]);

  return <main aria-busy="true" className="auth-screen" />;
}
