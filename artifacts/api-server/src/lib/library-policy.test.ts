import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canExportLibraryItem,
  canReadLibraryItem,
  canRevokeLibraryGrant,
  canShareLibraryItem,
  canUpdateLibraryItem,
  type LibraryActor,
  type LibraryPolicyItem,
  type LibraryPolicyGrant,
} from "./library-policy";

const adultA: LibraryActor = { id: 1, householdId: 10, role: "adult" };
const adultB: LibraryActor = { id: 2, householdId: 10, role: "adult" };
const adminAdult: LibraryActor = { id: 3, householdId: 10, role: "adult" };
const otherHouseholdAdult: LibraryActor = { id: 4, householdId: 11, role: "adult" };
const child: LibraryActor = { id: 5, householdId: 10, role: "child" };

const privateItem: LibraryPolicyItem = {
  id: 100,
  householdId: 10,
  ownerUserId: adultA.id,
  ownerKind: "person",
  visibility: "private",
  status: "active",
  deletedAt: null,
};

const householdItem: LibraryPolicyItem = {
  ...privateItem,
  id: 101,
  ownerKind: "household",
  visibility: "household",
};

const activeGrant: LibraryPolicyGrant = {
  granteeUserId: adultB.id,
  revokedAt: null,
  expiresAt: null,
};

test("private items are readable only by the adult owner before sharing", () => {
  assert.equal(canReadLibraryItem(adultA, privateItem, []), true);
  assert.equal(canReadLibraryItem(adultB, privateItem, []), false);
  assert.equal(canReadLibraryItem(adminAdult, privateItem, []), false);
  assert.equal(canReadLibraryItem(child, privateItem, []), false);
  assert.equal(canReadLibraryItem(otherHouseholdAdult, privateItem, []), false);
});

test("explicit grants allow intended adult access", () => {
  assert.equal(canReadLibraryItem(adultB, privateItem, [activeGrant]), true);
  assert.equal(canReadLibraryItem(adminAdult, privateItem, [activeGrant]), false);
});

test("revocation removes future access", () => {
  const revokedGrant = { ...activeGrant, revokedAt: new Date() };
  assert.equal(canReadLibraryItem(adultB, privateItem, [revokedGrant]), false);
});

test("household items are distinct from private or shared items", () => {
  assert.equal(canReadLibraryItem(adultB, householdItem, []), true);
  assert.equal(canReadLibraryItem(child, householdItem, []), false);
});

test("only the owner can mutate, share, revoke, or export", () => {
  assert.equal(canUpdateLibraryItem(adultA, privateItem), true);
  assert.equal(canUpdateLibraryItem(adultB, privateItem), false);
  assert.equal(canShareLibraryItem(adultA, privateItem), true);
  assert.equal(canShareLibraryItem(adultB, privateItem), false);
  assert.equal(canRevokeLibraryGrant(adultA, privateItem), true);
  assert.equal(canRevokeLibraryGrant(adultB, privateItem), false);
  assert.equal(canExportLibraryItem(adultA, privateItem), true);
  assert.equal(canExportLibraryItem(adultB, privateItem), false);
});
