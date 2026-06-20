// Firebase 設定檔

const firebaseConfig = {
  apiKey: "AIzaSyAR1tSz_-pSoqm5Eq8xXk8m29-c_vu0mKs",
  authDomain: "split-the-bill-458cc.firebaseapp.com",
  projectId: "split-the-bill-458cc",
  storageBucket: "split-the-bill-458cc.firebasestorage.app",
  messagingSenderId: "313780304972",
  appId: "1:313780304972:web:10e796795efb26fa2708e9"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
