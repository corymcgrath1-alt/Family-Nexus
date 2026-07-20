import React from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/lib/auth";

export default function VaultPage() {
  const { user } = useAuth();

  if (user?.role === "child") {
    return <Redirect to="/privacy" />;
  }

  return <Redirect to="/library" />;
}
