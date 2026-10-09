/**
 * Firebase client singletons.
 *
 * The web config's apiKey is a project identifier, not a credential: it is
 * designed to ship in client bundles. Access control lives in the SQL Connect
 * @auth directives and the Cloud Storage rules, not in hiding this key.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getDataConnect, type DataConnect } from "firebase/data-connect";
import { connectorConfig } from "./dataconnect-generated";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyBkAbesCUmu9hjLzIEhrCgVqm5F-_aeLi8",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "tender-management-flow.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "tender-management-flow",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "tender-management-flow.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "850311890595",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:850311890595:web:7e2734704371e31cd3a116",
};

export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getDataConnectInstance(): DataConnect {
  return getDataConnect(getFirebaseApp(), connectorConfig);
}

export { connectorConfig };
