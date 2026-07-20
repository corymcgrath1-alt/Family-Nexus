import bcrypt from "bcryptjs";
import {
  auditEventsTable,
  db,
  experienceProfilesTable,
  householdsTable,
  invitationsTable,
  libraryItemsTable,
  memoriesTable,
  messagesTable,
  planningTasksTable,
  sharingGrantsTable,
  usersTable,
} from "@workspace/db";
import { DEFAULT_PROFILES } from "./mock-family";
import { nanoid } from "nanoid";

const DEMO_PASSWORD_HASH_CACHE: Record<string, string> = {};

async function hash(pw: string): Promise<string> {
  if (!DEMO_PASSWORD_HASH_CACHE[pw]) {
    DEMO_PASSWORD_HASH_CACHE[pw] = await bcrypt.hash(pw, 12);
  }
  return DEMO_PASSWORD_HASH_CACHE[pw];
}

function newPassportId(): string {
  return `lhp_${nanoid(24)}`;
}

export async function checkAndSeed(): Promise<void> {
  if (process.env.NODE_ENV === "test" || process.env.SKIP_DEMO_SEED === "true") return;

  // Idempotent: skip if household already exists
  const existing = await db.select().from(householdsTable).limit(1);
  if (existing.length > 0) return;

  console.log("[seed] Seeding demo data...");

  // 1. Household
  const [household] = await db
    .insert(householdsTable)
    .values({ name: "The Lighthouse" })
    .returning();

  const hhId = household.id;

  // 2. Users
  const alexHash = await hash("lighthouse123");
  const morganHash = await hash("lighthouse123");
  const jamieHash = await hash("lighthouse123");

  const [alex] = await db.insert(usersTable).values({
    householdId: hhId,
    lighthousePassportId: newPassportId(),
    email: "alex@example.com",
    passwordHash: alexHash,
    displayName: "Alex",
    role: "adult",
    avatarInitials: "AL",
    color: "#4A7C59",
    age: 38,
  }).returning();

  const [morgan] = await db.insert(usersTable).values({
    householdId: hhId,
    lighthousePassportId: newPassportId(),
    email: "morgan@example.com",
    passwordHash: morganHash,
    displayName: "Morgan",
    role: "adult",
    avatarInitials: "MO",
    color: "#7B5EA7",
    age: 36,
  }).returning();

  await db.insert(usersTable).values({
    householdId: hhId,
    lighthousePassportId: newPassportId(),
    email: "jamie@example.com",
    passwordHash: jamieHash,
    displayName: "Jamie",
    role: "child",
    avatarInitials: "JA",
    color: "#E08D3C",
    age: 9,
  });

  // 3. Experience profiles
  const alexProfile = DEFAULT_PROFILES["alex"] as Record<string, unknown>;
  const morganProfile = DEFAULT_PROFILES["morgan"] as Record<string, unknown>;

  await db.insert(experienceProfilesTable).values({
    householdId: hhId,
    userId: alex.id,
    interests: alexProfile.interests as object[],
    dislikes: alexProfile.dislikes as object[],
    curiosityItems: alexProfile.curiosityItems as object[],
    foodPreferences: alexProfile.foodPreferences as object[],
    allergies: alexProfile.allergies as string[],
    crowdTolerance: String(alexProfile.crowdTolerance),
    activityLevel: String(alexProfile.activityLevel),
    preferredTimeOfDay: alexProfile.preferredTimeOfDay as string[],
    travelTolerance: String(alexProfile.travelTolerance),
    spendingComfort: String(alexProfile.spendingComfort),
    surpriseComfort: String(alexProfile.surpriseComfort),
    accessibilityNeeds: alexProfile.accessibilityNeeds as string[],
    favorites: alexProfile.favorites as string[],
    neverSuggest: alexProfile.neverSuggest as string[],
  });

  await db.insert(experienceProfilesTable).values({
    householdId: hhId,
    userId: morgan.id,
    interests: morganProfile.interests as object[],
    dislikes: morganProfile.dislikes as object[],
    curiosityItems: morganProfile.curiosityItems as object[],
    foodPreferences: morganProfile.foodPreferences as object[],
    allergies: morganProfile.allergies as string[],
    crowdTolerance: String(morganProfile.crowdTolerance),
    activityLevel: String(morganProfile.activityLevel),
    preferredTimeOfDay: morganProfile.preferredTimeOfDay as string[],
    travelTolerance: String(morganProfile.travelTolerance),
    spendingComfort: String(morganProfile.spendingComfort),
    surpriseComfort: String(morganProfile.surpriseComfort),
    accessibilityNeeds: morganProfile.accessibilityNeeds as string[],
    favorites: morganProfile.favorites as string[],
    neverSuggest: morganProfile.neverSuggest as string[],
  });

  // 4. Demo messages
  const demoMessages = [
    { senderId: morgan.id, body: "Morning! Don't forget Jamie's school thing is next Thursday evening.", messageType: "message" },
    { senderId: alex.id, body: "Got it — already on the calendar. How are you feeling today?", messageType: "message" },
    { senderId: morgan.id, body: "Better. Just need a slow weekend. Maybe we can actually do that thing we keep putting off.", messageType: "feeling" },
    { senderId: alex.id, body: "Yes. Let's actually plan something this week instead of talking about it.", messageType: "plan" },
    { senderId: morgan.id, body: "Jamie's been really into drawing lately — maybe we get him a proper sketchbook.", messageType: "message" },
    { senderId: alex.id, body: "Good idea. He's been asking about taking a drawing class too.", messageType: "message" },
    { senderId: morgan.id, body: "That pottery class looks fun — we should try it sometime 🎨", messageType: "message", hasExperienceMention: true, experienceMentionText: "That pottery class looks fun" },
    { senderId: alex.id, body: "Agreed — I was looking at that last week. Saturday mornings apparently.", messageType: "message" },
  ];

  const baseTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (let i = 0; i < demoMessages.length; i++) {
    const msg = demoMessages[i];
    const createdAt = new Date(baseTime + i * 3 * 60 * 60 * 1000);
    await db.insert(messagesTable).values({
      householdId: hhId,
      senderId: msg.senderId,
      body: msg.body,
      messageType: msg.messageType,
      hasExperienceMention: msg.hasExperienceMention ?? false,
      experienceMentionText: msg.experienceMentionText ?? null,
      createdAt,
    });
  }

  // 5. Demo invitation (pottery class, Alex → Morgan)
  const [inv] = await db.insert(invitationsTable).values({
    householdId: hhId,
    slug: "inv-001",
    inviterId: alex.id,
    inviteeIds: [morgan.id],
    experienceId: "exp-002",
    experienceTitle: "Riverside Pottery Class",
    status: "pending",
    purpose: "Been wanting to try this together for a while — thought this could be a nice Saturday morning.",
    proposedDate: "2026-08-15",
    proposedDateFlexible: false,
    durationMinutes: 120,
    detailLevel: "partial",
    dressGuidance: "Wear clothes you do not mind getting clay on.",
    whatToBring: "Just yourselves — all materials included.",
    planningResponsibility: "Alex",
    paymentArrangement: "Alex will cover",
    childcareNotes: "Need to arrange someone for Jamie that morning.",
    reservationStatus: "Not yet booked — will confirm once you say yes.",
    message: "I know we keep talking about trying pottery. Saturday morning works — let me know what you think.",
    isSurprise: false,
    surpriseRevealedFields: [],
  }).returning();

  // 6. Demo memories
  await db.insert(memoriesTable).values([
    {
      householdId: hhId,
      slug: "mem-001",
      title: "Pottery class — something we both want to try",
      description: "Morgan mentioned this in chat. The Kiln & Co. Saturday morning session looks perfect.",
      sourceType: "message",
      sourceMessage: "That pottery class looks fun — we should try it sometime 🎨",
      mentionedById: morgan.id,
      imageUrl: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400&q=80",
      season: "any",
      budgetEstimate: "95",
      participantIds: [alex.id, morgan.id],
      surpriseEligible: true,
      advancePlanningNeeded: true,
      status: "active",
    },
    {
      householdId: hhId,
      slug: "mem-002",
      title: "Autumn overlook picnic — postponed from last year",
      description: "Wanted to do this last October. Saving again — season comes back in September.",
      sourceType: "manual",
      mentionedById: alex.id,
      imageUrl: "https://images.unsplash.com/photo-1569975020836-44de93cf20dc?w=400&q=80",
      season: "autumn",
      budgetEstimate: "20",
      participantIds: [alex.id, morgan.id],
      surpriseEligible: true,
      advancePlanningNeeded: false,
      status: "postponed",
    },
    {
      householdId: hhId,
      slug: "mem-003",
      title: "Natural history museum dinosaur exhibit",
      description: "Jamie has been asking about dinosaurs constantly. The Deep Time exhibit runs through December.",
      sourceType: "manual",
      mentionedById: alex.id,
      imageUrl: "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=400&q=80",
      season: "any",
      budgetEstimate: "52",
      participantIds: [alex.id, morgan.id],
      surpriseEligible: false,
      advancePlanningNeeded: false,
      status: "active",
    },
  ]);

  // 7. Demo planning tasks
  const DEMO_TASKS = [
    { slug: "task-demo-001", title: "Arrange childcare for the evening", description: "Contact a trusted babysitter or family member for the evening of your date.", category: "childcare", dueDate: "2026-08-10" },
    { slug: "task-demo-002", title: "Reserve spots at Kiln & Co.", description: "Book two seats for the Saturday 10am pottery session.", category: "reservation", dueDate: "2026-08-05" },
    { slug: "task-demo-003", title: "Confirm allergy accommodation", description: "Contact the studio to note any dietary or material sensitivities if relevant.", category: "other", dueDate: "2026-08-05" },
    { slug: "task-demo-004", title: "Plan travel route and parking", description: "Riverside Arts District — street parking on Oak Ave usually available Saturday mornings.", category: "transport", dueDate: "2026-08-15" },
    { slug: "task-demo-005", title: "Set a reminder for 48 hours before", description: "Reminder to confirm childcare and check reservation.", category: "reminder", dueDate: "2026-08-13" },
    { slug: "task-demo-006", title: "Check weather forecast", description: "Pottery class is indoors — no issue, but good to plan travel clothing.", category: "weather", dueDate: "2026-08-14" },
    { slug: "task-demo-007", title: "Identify backup plan if class is cancelled", description: "The studio sometimes closes for private events. Have a backup activity in mind.", category: "backup", dueDate: "2026-08-10" },
  ];

  for (const task of DEMO_TASKS) {
    await db.insert(planningTasksTable).values({
      ...task,
      householdId: hhId,
      invitationId: inv.slug,
      assigneeId: alex.id,
      completed: false,
    });
  }

  // 8. Demo Family Library items
  const [alexPrivate] = await db.insert(libraryItemsTable).values({
    householdId: hhId,
    ownerUserId: alex.id,
    subjectUserId: alex.id,
    ownerKind: "person",
    visibility: "private",
    category: "instruction",
    title: "Alex private reminder about travel packing",
    body: "Keep a spare charger in the front pouch of the weekender bag.",
    sourceType: "manual",
    sourceLabel: "Demo note",
    provenance: { sourceType: "manual", note: "Synthetic seed data", recordedByUserId: alex.id },
    sensitivity: "personal",
    retentionPolicy: "review-annually",
    createdById: alex.id,
    updatedById: alex.id,
  }).returning();

  const [morganPrivate] = await db.insert(libraryItemsTable).values({
    householdId: hhId,
    ownerUserId: morgan.id,
    subjectUserId: morgan.id,
    ownerKind: "person",
    visibility: "private",
    category: "note",
    title: "Morgan private weekend reset note",
    body: "A quiet Saturday morning works better than adding another errand.",
    sourceType: "manual",
    sourceLabel: "Demo note",
    provenance: { sourceType: "manual", note: "Synthetic seed data", recordedByUserId: morgan.id },
    sensitivity: "personal",
    retentionPolicy: "review-annually",
    createdById: morgan.id,
    updatedById: morgan.id,
  }).returning();

  const [householdLibraryItem] = await db.insert(libraryItemsTable).values({
    householdId: hhId,
    ownerUserId: alex.id,
    ownerKind: "household",
    visibility: "household",
    category: "household-record",
    title: "Water shutoff is in the basement utility closet",
    body: "Main valve is on the wall behind the washer. Turn clockwise until snug.",
    sourceType: "manual",
    sourceLabel: "Synthetic home note",
    provenance: { sourceType: "manual", note: "Synthetic seed data", recordedByUserId: alex.id },
    sensitivity: "standard",
    retentionPolicy: "keep-until-archived",
    createdById: alex.id,
    updatedById: alex.id,
  }).returning();

  const [sharedLibraryItem] = await db.insert(libraryItemsTable).values({
    householdId: hhId,
    ownerUserId: alex.id,
    subjectUserId: alex.id,
    ownerKind: "person",
    visibility: "shared",
    category: "decision",
    title: "Try a slow Sunday after busy Saturdays",
    body: "Shared decision: protect Sunday morning as recovery time unless something is truly urgent.",
    sourceType: "manual",
    sourceLabel: "Synthetic shared decision",
    provenance: { sourceType: "manual", note: "Synthetic seed data", recordedByUserId: alex.id },
    sensitivity: "personal",
    retentionPolicy: "review-annually",
    createdById: alex.id,
    updatedById: alex.id,
  }).returning();

  const [grant] = await db.insert(sharingGrantsTable).values({
    householdId: hhId,
    resourceType: "library_item",
    resourceId: sharedLibraryItem.id,
    grantorUserId: alex.id,
    granteeUserId: morgan.id,
    permission: "read",
    purpose: "library_share",
  }).returning();

  await db.insert(auditEventsTable).values([
    {
      householdId: hhId,
      actorUserId: alex.id,
      targetType: "library_item",
      targetId: alexPrivate.id,
      eventType: "created",
      summary: "Library item created",
      metadata: { category: alexPrivate.category, visibility: alexPrivate.visibility, sensitivity: alexPrivate.sensitivity },
    },
    {
      householdId: hhId,
      actorUserId: morgan.id,
      targetType: "library_item",
      targetId: morganPrivate.id,
      eventType: "created",
      summary: "Library item created",
      metadata: { category: morganPrivate.category, visibility: morganPrivate.visibility, sensitivity: morganPrivate.sensitivity },
    },
    {
      householdId: hhId,
      actorUserId: alex.id,
      targetType: "library_item",
      targetId: householdLibraryItem.id,
      eventType: "created",
      summary: "Library item created",
      metadata: { category: householdLibraryItem.category, visibility: householdLibraryItem.visibility, sensitivity: householdLibraryItem.sensitivity },
    },
    {
      householdId: hhId,
      actorUserId: alex.id,
      targetType: "library_item",
      targetId: sharedLibraryItem.id,
      eventType: "created",
      summary: "Library item created",
      metadata: { category: sharedLibraryItem.category, visibility: sharedLibraryItem.visibility, sensitivity: sharedLibraryItem.sensitivity },
    },
    {
      householdId: hhId,
      actorUserId: alex.id,
      targetType: "library_item",
      targetId: sharedLibraryItem.id,
      eventType: "shared",
      summary: "Library item shared",
      metadata: { grantId: grant.id, sharedRecipientCount: 1 },
    },
  ]);

  console.log(`[seed] Done. Household id=${hhId}, Alex id=${alex.id}, Morgan id=${morgan.id}`);
}
