"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA_Rx6OHmVw-5vEUA9ZqYpC-2EnzBqZKEw",
  authDomain: "ychao-booking-schedule.firebaseapp.com",
  projectId: "ychao-booking-schedule",
  storageBucket: "ychao-booking-schedule.firebasestorage.app",
  messagingSenderId: "885880899717",
  appId: "1:885880899717:web:62093f3b36f1a33e6241ec",
  measurementId: "G-2JHRNGW0GL",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    return {
      idToken: await result.user.getIdToken(),
      email: result.user.email ?? "",
      displayName: result.user.displayName ?? "",
    };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
    if (code === "auth/unauthorized-domain") {
      throw new Error("此網站尚未加入 Firebase 已授權網域，請聯絡管理者。");
    }
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      throw new Error("Google 登入視窗已關閉，請再試一次。");
    }
    if (code === "auth/popup-blocked") {
      throw new Error("瀏覽器封鎖了 Google 登入視窗，請允許彈出式視窗後再試。");
    }
    throw new Error("Google 登入失敗，請稍後再試。");
  }
}

export function signOutFirebase() {
  return signOut(firebaseAuth);
}

async function currentIdToken() {
  const current = firebaseAuth.currentUser ?? await new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
  if (!current) throw new Error("請先使用 Google 登入。");
  return current.getIdToken();
}

export async function authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${await currentIdToken()}`);
  return fetch(input, { ...init, headers });
}
