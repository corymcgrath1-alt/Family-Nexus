import React from "react";
import { Shield, Lock, FileText, Key, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function VaultPage() {
  const { user } = useAuth();

  if (user?.role === "child") {
    return (
      <div className="flex-1 p-6 md:p-10 flex flex-col items-center justify-center text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-6">
          <Lock className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-serif mb-2">Restricted Access</h2>
        <p className="text-muted-foreground text-sm">The Vault is only accessible to adult family members.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-10 max-w-4xl mx-auto w-full space-y-8">
      <header>
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-serif text-foreground">Vault</h1>
        </div>
        <p className="text-muted-foreground">Private documents and sensitive information.</p>
      </header>

      <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 flex items-start gap-4">
        <EyeOff className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <h3 className="font-medium text-primary mb-1">Privacy Notice</h3>
          <p className="text-sm text-primary/80 leading-relaxed">
            Your account access is protected by your email and password. This version does not use end-to-end encryption and is not suitable for medical records, banking credentials, identity documents, or other highly sensitive files. Document storage is coming in a future version.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {[
          { title: "Personal Documents", icon: FileText, desc: "IDs, passports, records" },
          { title: "Passwords", icon: Key, desc: "Secure credentials" },
          { title: "Private Notes", icon: Lock, desc: "Journaling and secure notes" },
        ].map((item, i) => (
          <div key={i} className="p-6 rounded-xl border border-border bg-card hover-elevate cursor-pointer flex items-start gap-4 transition-all">
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-secondary-foreground shrink-0">
              <item.icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">{item.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
