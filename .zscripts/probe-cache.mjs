import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getDataConnect } from "firebase/data-connect";
import { connectorConfig, createTender, listTenders, updateTender, getTender } from "../src/lib/dataconnect-generated/index.cjs.js";

const app = initializeApp({apiKey:"AIzaSyBkAbesCUmu9hjLzIEhrCgVqm5F-_aeLi8",authDomain:"tender-management-flow.firebaseapp.com",projectId:"tender-management-flow",storageBucket:"tender-management-flow.firebasestorage.app",messagingSenderId:"850311890595",appId:"1:850311890595:web:7e2734704371e31cd3a116"});
const auth = getAuth(app);
const dc = getDataConnect(connectorConfig, { app });
await signInWithEmailAndPassword(auth, "auth-probe-tmflow@example.com", "Probe-Pass-12345");

const flat = (r) => (r.data.user?.memberships_on_user ?? []).flatMap(m => m.organisation?.tenders_on_organisation ?? []);

const mode = process.argv[2];

if (mode === "create") {
  const c = (await createTender(dc, {
    referenceNumber: "CACHE-" + Date.now(),
    title: "cache probe",
    clientCompany: "probe",
    closingDate: "2026-12-01",
  })).data.tender_insert;
  console.log("CREATED " + c.id);
} else if (mode === "probe") {
  const rows = flat(await listTenders(dc));
  console.log("listTenders rows: " + rows.length);
  const cacheRow = rows.find(r => r.referenceNumber?.startsWith("CACHE-"));
  console.log("CACHE row visible in list: " + (cacheRow ? cacheRow.id : "none"));

  const all = flat(await getTender(dc, { id: "00000000-0000-0000-0000-000000000000" }));
  console.log("getTender(sentinel) rows: " + all.length);
  process.exit(0);
} else if (mode === "update") {
  const id = process.argv[3];
  console.log("updating " + id);
  try {
    const u = (await updateTender(dc, {
      id, referenceNumber: "CACHE-UPD", title: "updated", clientCompany: "probe", status: "Under Review",
    })).data.tender_update;
    console.log("UPDATE OK " + u?.id);
  } catch (e) {
    console.log("UPDATE BLOCKED: " + String(e).slice(0, 260));
  }
}
