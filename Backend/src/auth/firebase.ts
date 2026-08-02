import fs from 'fs';
import * as admin from 'firebase-admin';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath || !fs.existsSync(serviceAccountPath)) {
  throw new Error(
    `[AUTH] No se encontró el service account de Firebase en FIREBASE_SERVICE_ACCOUNT_PATH="${serviceAccountPath}". ` +
      'Descárgalo desde Firebase Console -> Project Settings -> Service Accounts.'
  );
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export async function verificarIdToken(idToken: string) {
  // Verifica firma, expiración y que el usuario no esté revocado/deshabilitado.
  return admin.auth().verifyIdToken(idToken, true);
}

export { admin };
