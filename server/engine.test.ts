import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const testDatabase = resolve("./data/revivepay.test.db");
process.env.DATABASE_PATH = testDatabase;
process.env.PUBLIC_APP_URL = "http://test.local";
delete process.env.OPENAI_API_KEY;
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;

let database: typeof import("./db.js");
let engine: typeof import("./engine.js");
let ai: typeof import("./ai.js");

before(async () => {
  if (existsSync(testDatabase)) unlinkSync(testDatabase);
  database = await import("./db.js");
  engine = await import("./engine.js");
  ai = await import("./ai.js");
  database.resetAndSeedDatabase();
});

after(() => {
  database.db.close();
  for (const suffix of ["", "-shm", "-wal"]) {
    const path = `${testDatabase}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

test("seeds a batch large enough for evaluation", () => {
  assert.equal(database.getCases().length, 80);
});

test("high-value action is gated and becomes an executable demo link after approval", async () => {
  const recoveryCase = database.getCase("rcv_0035");
  const action = database.getActions("rcv_0035")[0];
  assert.equal(recoveryCase?.status, "needs_review");
  assert.equal(action.requiresApproval, 1);
  const result = await engine.approveAndExecuteAction("rcv_0035", action.id);
  assert.match(result.link?.url ?? "", /^http:\/\/test\.local\/pay\//);
  assert.equal(database.getCase("rcv_0035")?.status, "awaiting_payment");
});

test("a disputed payment stops automation", async () => {
  const classification = await ai.classifyReply("This purchase is not mine. I want to dispute it.");
  engine.handleReply("rcv_0002", "This purchase is not mine. I want to dispute it.", classification);
  assert.equal(classification.intent, "dispute");
  assert.equal(database.getCase("rcv_0002")?.status, "escalated");
});

test("duplicate webhook is accepted once and ignored thereafter", () => {
  const first = engine.processIncomingEvent("evt_fixed_duplicate", "payment_link.paid", "rcv_0003", { test: true });
  const second = engine.processIncomingEvent("evt_fixed_duplicate", "payment_link.paid", "rcv_0003", { test: true });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(database.getCase("rcv_0003")?.status, "recovered");
  assert.equal(database.getAudit("rcv_0003")[0].title, "Duplicate webhook ignored");
});
