# Launch and Firebase setup

This is a static site with no build step. `firebase.json` configures Firebase Hosting, response security headers, cache revalidation, and deployment of the Firestore rules. Hosting excludes the Python practice file and setup documentation. The planner supports Google, Facebook, and email/password accounts through Firebase Authentication. Signed-in profiles and plans are stored in Cloud Firestore at `users/{uid}/planner/default`; the rules in `firestore.rules` restrict each document to its owning account. Guest plans stay in that browser's local storage.

## Configure the project

1. Create a Firebase project and register a **Web app**.
2. Copy its web-app configuration values into `firebase-config.js`. These client configuration values identify the Firebase project; do not put a service-account key or Facebook app secret in the website.
3. In **Authentication → Sign-in method**, enable **Email/Password** and **Google**. Enable Facebook only if needed and after configuring a Facebook app; keep its app secret in Firebase's provider settings.
4. Create a Cloud Firestore database and publish the rules from `firestore.rules`.
5. In **Authentication → Settings → Authorized domains**, include `localhost` for development and the Firebase Hosting domain (and any custom domain) used by the app.
6. Install the Firebase CLI, sign in, and select the project from this folder:

   ```powershell
   npm install --global firebase-tools
   firebase login
   firebase use --add
   ```

7. Serve locally for a smoke test with `python -m http.server 8000`, then visit `http://localhost:8000/`. Do not open `index.html` as a `file:` URL for account testing.
8. Deploy Hosting and Firestore rules together:

   ```powershell
   firebase deploy --only hosting,firestore:rules
   ```

   Firebase prints the live HTTPS URL after deployment. Add that hostname to Firebase Authentication's authorized domains if it is not already present.

Firebase project configuration and enabled providers are required before account sign-in or cloud sync can work. Until then, the app hides unavailable sign-in controls and allows guest planning. It remembers guest mode in that browser and does not ask the user to choose again on every visit. Firebase web-app settings are project-specific and cannot be guessed; the included blank config is intentional until you create a project. Do not commit a Firebase Admin SDK or service-account credential.

## Before you announce the launch

- Replace the launch reminders in `privacy.html` with the operator's name and a monitored contact, and have the policy reviewed for your location and audience. It is a template, not legal advice.
- Test account creation, sign-in, password reset, sign-out, cloud save/load, and guest switching using your configured Firebase project. Verify the Firestore rules are deployed and each account can access only its own document.
- Check Firebase Authentication's authorized domains and test the deployed HTTPS site on desktop and mobile.
- Review all recipe ingredients, allergen tags, and nutrition estimates before presenting the catalog as reliable. The current catalog is illustrative and is not a substitute for verified nutrition data.
- Confirm that the website's operator/contact, privacy policy, and any other disclosures required where you operate are in place.

## Nutrition and food-safety limits

- The catalog has 56 entries, including recipes inspired by 23 regional cuisines, and supports balanced, vegetarian, and vegan filtering. It is a curated sample, not an exhaustive or authoritative representation of world cuisines. Ingredient lists are abbreviated examples and may omit garnishes, cooking oils, sauces, or substitutions.
- Calorie and macro values are hand-entered per-serving estimates, not verified nutrition-label data.
- Calorie targets are rough estimates for adults, not medical advice. The profile flow is for adults 18+ and is not intended for pregnancy, eating-disorder recovery, or treatment of a medical condition.
- Recipe suggestions filter against a limited set of recorded allergen tags. Tags may be incomplete, the catalog does not screen for cross-contact, and manual meals are not allergy-screened. Never rely on this app to determine that food is safe; check every ingredient, package label, and preparation environment.
- Shopping lists collect ingredient notes from planned meals; they do not calculate quantities.
