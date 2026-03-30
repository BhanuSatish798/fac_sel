import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, getDocFromServer, doc } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

// Use the provided database ID if it exists and isn't "(default)", otherwise use the default database
export const db = (firebaseConfig as any).firestoreDatabaseId && (firebaseConfig as any).firestoreDatabaseId !== "(default)"
  ? getFirestore(app, (firebaseConfig as any).firestoreDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);
export const storage = getStorage(app);

// Validate connection to Firestore as per guidelines
async function testConnection() {
  try {
    // Attempt to reach the server to verify configuration
    await getDocFromServer(doc(db, '_connection_test_', 'ping'));
    console.log("Firestore connection verified.");
  } catch (error: any) {
    if (error.message?.includes('offline') || error.code === 'unavailable') {
      console.error("Firestore is unreachable. This typically indicates an incorrect firestoreDatabaseId or projectId in firebase-applet-config.json.");
    }
    // Permission errors are expected for this dummy path and confirm we reached the server
  }
}
testConnection();
