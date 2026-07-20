import "express-session";

declare module "express-session" {
  interface SessionData {
    userId: number;
    householdId: number;
    role: "adult" | "child";
  }
}
