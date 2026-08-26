import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getFirebaseApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // Support both JSON string and individual env vars
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
    return initializeApp({
      credential: cert(serviceAccount),
    });
  }

  if (process.env.FIREBASE_PROJECT_ID) {
    return initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }

  // Fallback: use application default credentials (works in Google Cloud)
  return initializeApp();
}

const app = getFirebaseApp();
export const firestore = getFirestore(app);

// Enable settings for better performance
firestore.settings({ ignoreUndefinedProperties: true });

export default firestore;
