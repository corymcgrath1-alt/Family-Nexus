import React from "react";
import { Building, Shield, FileText, Settings, Key } from "lucide-react";

export default function HouseholdPage() {
  return (
    <div className="flex-1 p-6 md:p-10 max-w-4xl mx-auto w-full space-y-8">
      <header>
        <h1 className="text-3xl font-serif text-foreground mb-2">Household</h1>
        <p className="text-muted-foreground">Shared home management and logistics.</p>
      </header>

      <div className="grid sm:grid-cols-2 gap-4">
        {[
          { title: "Chores & Tasks", icon: CheckSquare, desc: "Shared responsibilities" },
          { title: "Shopping List", icon: ShoppingCart, desc: "Groceries and supplies" },
          { title: "Finances", icon: CreditCard, desc: "Shared budgets and bills" },
          { title: "Contacts", icon: Users, desc: "Service providers and emergency" },
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
      
      <div className="p-6 rounded-xl bg-muted/50 border border-border border-dashed text-center mt-8">
        <p className="text-sm text-muted-foreground">This section is available in the full application.</p>
      </div>
    </div>
  );
}

// Icons
function CheckSquare(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> }
function ShoppingCart(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg> }
function CreditCard(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg> }
function Users(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> }
