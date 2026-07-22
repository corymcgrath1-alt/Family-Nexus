import { withDatabaseActor } from "@workspace/db";
import type { Request, Response, NextFunction, RequestHandler } from "express";

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

export function withAuthenticatedDatabaseActor(handler: RequestHandler): RequestHandler {
  return async (req, res, next): Promise<void> => {
    const userId = req.session?.userId;
    const householdId = req.session?.householdId;
    if (!userId || !householdId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      await withDatabaseActor({ userId, householdId }, () => handler(req, res, next));
    } catch (error) {
      next(error);
    }
  };
}
