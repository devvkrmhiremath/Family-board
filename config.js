// Paste the config from Firebase console → Project settings → Your apps → Web app.
//
// These values are meant to be public: every Firebase web app ships them to the
// browser, and they only say which project to talk to. Your data is protected by
// anonymous sign-in plus firestore.rules (and optionally App Check), not by
// hiding this key. For extra safety, restrict the key to your website's address
// in Google Cloud Console (see README → "Lock the API key to your site").
export const firebaseConfig = {
  apiKey: "AIzaSyBIU5DBNYil2OoV7R-2IzusRr1fB70zuro", // nosemgrep: detected-google-api-key, generic-api-key -- public Firebase web key, see note above
  authDomain: "familyboard-c8b2a.firebaseapp.com",
  projectId: "familyboard-c8b2a",
  storageBucket: "familyboard-c8b2a.firebasestorage.app",
  messagingSenderId: "305849647142",
  appId: "1:305849647142:web:2a9a28498f19a08dbfe6e7",
  // Optional App Check (see README): paste a reCAPTCHA v3 site key to turn it on
  // appCheckSiteKey: "",
};
