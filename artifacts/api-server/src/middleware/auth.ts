import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function requireHouseholdMatch(resourceHouseholdId: number, req: Request, res: Response): boolean {
  if (req.session.householdId !== resourceHouseholdId) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}
