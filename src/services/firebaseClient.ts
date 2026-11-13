import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig';

const app = firebaseConfig ? initializeApp(firebaseConfig) : undefined;
export const auth = app && getAuth(app);
const firestore = app && getFirestore(app);

export function session(userId: string) {
  if (!firestore || auth?.currentUser?.uid !== userId) throw new Error('다시 로그인해 주세요.');
  return { firestore, user: auth.currentUser };
}

export function googleSignIn() {
  if (!auth) throw new Error('Firebase 설정을 확인해 주세요.');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}
