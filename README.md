<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/a19262d4-124f-4ff7-ad85-323497fd9873

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Android APK

This project is prepared for Capacitor Android packaging. On Windows, run `android-setup.bat` after installing Node.js and Android Studio. See `ANDROID_APK_GUIDE.md` for the steps and the Google Sign-In WebView limitation.
