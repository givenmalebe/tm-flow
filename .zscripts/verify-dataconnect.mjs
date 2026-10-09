/**
 * Phase 1 verification script.
 *
 * Exercises the deployed SQL Connect service through the generated SDK with a
 * real Firebase Auth ID token, which is the same path the app will use.
 *
 * Usage:
 *   PROBE_EMAIL=... PROBE_PASSWORD=... \
 *   OTHER_EMAIL=... OTHER_PASSWORD=... \
 *   node .zscripts/verify-dataconnect.mjs
 */
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getDataConnect } from "firebase/data-connect";
import {
  connectorConfig,
  me,
  myOrganisation,
  hasOrganisation,
  listTenders,
  getTender,
  createTender,
  registerUser,
  updateTender,
  deleteTender,
} from "../src/lib/dataconnect-generated/index.cjs.js";

const firebaseConfig = {
  apiKey: "AIzaSyBkAbesCUmu9hjLzIEhrCgVqm5F-_aeLi8",
  authDomain: "tender-management-flow.firebaseapp.com",
  projectId: "tender-management-flow",
  storageBucket: "tender-management-flow.firebasestorage.app",
  messagingSenderId: "850311890595",
  appId: "1:850311890595:web:7e2734704371e31cd3a116",
};

const EMAIL = process.env.PROBE_EMAIL;
const PASSWORD = process.env.PROBE_PASSWORD;
const OTHER_EMAIL = process.env.OTHER_EMAIL;
const OTHER_PASSWORD = process.env.OTHER_PASSWORD;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dc = getDataConnect(connectorConfig, { app });

let pass = 0;
let fail = 0;

function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const signIn = (email, password) => signInWithEmailAndPassword(auth, email, password).then((c) => c.user);

function orgTendersOf(res) {
  return (res.data.user?.memberships_on_user ?? []).flatMap(
    (m) => m.organisation?.tenders_on_organisation ?? []
  );
}

async function main() {
  console.log("\n== Sign in ==");
  const user = await signIn(EMAIL, PASSWORD);
  check("signin primary user", !!user, user.uid);

  console.log("\n== Registration ==");
  // RegisterUser is not idempotent: every call inserts a fresh Organisation and
  // Membership. Guard on HasOrganisation so re-runs cannot corrupt the account.
  const hasOrg = await hasOrganisation(dc);
  const existing = hasOrg.data.user?.memberships_on_user ?? [];
  if (existing.length > 0) {
    check("HasOrganisation guards re-registration", true, `${existing.length} membership(s) — skipping RegisterUser`);
  } else {
    await registerUser(dc, {
      fullName: "Probe Primary",
      organisationName: "Probe Primary Org",
      companyName: "Probe Primary Org",
      accountType: "applicant",
    });
    check("RegisterUser executes", true);
  }

  const meRes = await me(dc);
  check("Me returns caller", meRes.data.user?.id === user.uid, meRes.data.user?.email);

  const orgRes = await myOrganisation(dc);
  const memberships = orgRes.data.user?.memberships_on_user ?? [];
  check("MyOrganisation returns membership", memberships.length > 0, memberships[0]?.organisation?.name);

  console.log("\n== Read ==");
  const before = orgTendersOf(await listTenders(dc));
  check("ListTenders readable", Array.isArray(before), `${before.length} rows`);

  console.log("\n== Create ==");
  const ref = `PROBE-${Date.now()}`;
  const created = (await createTender(dc, {
    referenceNumber: ref,
    title: "Probe Tender",
    clientCompany: "Probe Client",
    description: "Created by verification script",
    category: "Security Services",
  })).data.tender_insert;
  check("CreateTender executes", !!created?.id, created?.id);
  const tenderId = created?.id;

  // Re-read rather than trusting the pre-create snapshot: the in-process
  // client cache can serve a stale list right after a mutation.
  const after = orgTendersOf(await listTenders(dc));
  const visible = after.some((t) => t.id === tenderId);
  check("created tender visible to own org", visible, `${after.length} rows, tender present=${visible}`);
  if (!visible) {
    console.log("  NOTE  investigating stale list...");
    const fresh = orgTendersOf(await getTender(dc, { id: tenderId }));
    check("  tender readable via GetTender (list was stale)", fresh.length > 0, `${fresh.length} row(s)`);
  }

  const got = orgTendersOf(await getTender(dc, { id: tenderId })).find((t) => t.id === tenderId);
  check("GetTender returns own tender", !!got, got?.referenceNumber);

  console.log("\n== Update ==");
  const upd = (await updateTender(dc, {
    id: tenderId,
    referenceNumber: ref,
    title: "Probe Tender (updated)",
    clientCompany: "Probe Client",
    description: "Updated by verification script",
    category: "Security Services",
    status: "Under Review",
  })).data.tender_update;
  check("UpdateTender executes", !!upd?.id, upd?.id);

  console.log("\n== Cross-org isolation (@check) ==");
  if (OTHER_EMAIL && OTHER_PASSWORD) {
    const otherUser = await signIn(OTHER_EMAIL, OTHER_PASSWORD);
    check("signin other user", !!otherUser, otherUser.uid);
    const otherHasOrg = await hasOrganisation(dc);
    if ((otherHasOrg.data.user?.memberships_on_user ?? []).length === 0) {
      await registerUser(dc, {
        fullName: "Probe Other",
        organisationName: "Probe Other Org",
        companyName: "Probe Other Org",
        accountType: "applicant",
      });
    }

    const otherVisible = orgTendersOf(await listTenders(dc));
    check(
      "other org cannot SEE primary tender",
      !otherVisible.some((t) => t.id === tenderId),
      `${otherVisible.length} rows visible to other org`
    );

    let updBlocked = false;
    let updMsg = "";
    try {
      await updateTender(dc, {
        id: tenderId,
        referenceNumber: ref,
        title: "HIJACKED",
        clientCompany: "Attacker",
        status: "Under Review",
      });
    } catch (e) {
      updBlocked = true;
      updMsg = String(e).slice(0, 220);
    }
    check("@check blocks cross-org UPDATE", updBlocked, updMsg || "write was NOT blocked");

    let delBlocked = false;
    let delMsg = "";
    try {
      await deleteTender(dc, { id: tenderId });
    } catch (e) {
      delBlocked = true;
      delMsg = String(e).slice(0, 220);
    }
    check("@check blocks cross-org DELETE", delBlocked, delMsg || "delete was NOT blocked");

    await signIn(EMAIL, PASSWORD);
  } else {
    console.log("  SKIP  cross-org test (OTHER_EMAIL / OTHER_PASSWORD not set)");
  }

  console.log("\n== Delete (own tender) ==");
  let delOk = false;
    let delDetail = "";
  try {
    delOk = !!(await deleteTender(dc, { id: tenderId })).data.tender_delete;
  } catch (e) {
    delDetail = String(e).slice(0, 220);
  }
  check("DeleteTender executes for own tender", delOk, delDetail);

  const final = orgTendersOf(await listTenders(dc));
  check("tender removed after delete", !final.some((t) => t.id === tenderId), `${final.length} rows remaining`);

  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nFATAL:", e);
  process.exit(1);
});
