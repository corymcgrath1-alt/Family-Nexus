export type LibraryVisibility = "private" | "shared" | "household";
export type LibraryStatus = "active" | "archived" | "deleted";

export type LibraryActor = {
  id: number;
  householdId: number;
  role: string;
};

export type LibraryPolicyItem = {
  id: number;
  householdId: number;
  ownerUserId: number;
  ownerKind: string;
  visibility: string;
  status: string;
  deletedAt: Date | null;
};

export type LibraryPolicyGrant = {
  granteeUserId: number;
  revokedAt: Date | null;
  expiresAt: Date | null;
};

export function isAdult(actor: LibraryActor): boolean {
  return actor.role === "adult";
}

export function isActiveGrant(grant: LibraryPolicyGrant, now = new Date()): boolean {
  if (grant.revokedAt) return false;
  if (grant.expiresAt && grant.expiresAt <= now) return false;
  return true;
}

export function canReadLibraryItem(
  actor: LibraryActor,
  item: LibraryPolicyItem,
  grants: LibraryPolicyGrant[],
  now = new Date(),
): boolean {
  if (actor.householdId !== item.householdId) return false;
  if (item.status === "deleted" || item.deletedAt) return false;
  if (!isAdult(actor)) return false;
  if (item.ownerUserId === actor.id) return true;
  if (item.visibility === "household") return true;
  return grants.some((grant) => grant.granteeUserId === actor.id && isActiveGrant(grant, now));
}

export function canUpdateLibraryItem(actor: LibraryActor, item: LibraryPolicyItem): boolean {
  if (actor.householdId !== item.householdId) return false;
  if (item.status === "deleted" || item.deletedAt) return false;
  if (!isAdult(actor)) return false;
  return item.ownerUserId === actor.id;
}

export function canShareLibraryItem(actor: LibraryActor, item: LibraryPolicyItem): boolean {
  return canUpdateLibraryItem(actor, item) && item.visibility !== "household";
}

export function canRevokeLibraryGrant(actor: LibraryActor, item: LibraryPolicyItem): boolean {
  return canUpdateLibraryItem(actor, item);
}

export function canExportLibraryItem(actor: LibraryActor, item: LibraryPolicyItem): boolean {
  return canUpdateLibraryItem(actor, item);
}
