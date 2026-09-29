# LinkUp — Android APK setup

This project has been prepared for Capacitor Android packaging.

## On Windows

1. Install Node.js (LTS).
2. Install Android Studio and Android SDK/Build Tools.
3. Extract this ZIP to a normal folder.
4. Double-click `android-setup.bat`.
5. After it finishes, open the generated `android` folder in Android Studio.
6. In Android Studio use **Build → Build APK(s)**.
7. The debug APK will normally be under `android/app/build/outputs/apk/debug/`.

## Important

The current LinkUp web app uses Firebase Web Authentication with Google popup sign-in. Android WebView/Capacitor environments can restrict popup-based OAuth. If Google Sign-In does not work in the generated APK, the authentication flow should be migrated to a native/Capacitor-compatible Firebase authentication flow before release.

The existing Firebase project, Firestore rules, friends system, map, and location-sharing code are intentionally preserved.
