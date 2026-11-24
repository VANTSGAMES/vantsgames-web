import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import firebaseConfig from "../../firebase-applet-config.json";

const projectId =
  process.env.GCP_PROJECT_ID ||
  process.env.VITE_GOOGLE_CLOUD_PROJECT_ID ||
  firebaseConfig.projectId ||
  "semiotic-ion-508913-r1";

if (!getApps().length) {
  initializeApp({
    projectId,
  });
}

export const adminAuth = getAuth();
