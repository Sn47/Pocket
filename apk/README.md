# APK builds

The installable Android APK for Pixel (and any Android phone) goes in this folder.

## Build it (one command, free)

From the repo root:

```bash
cd app
npm install -g eas-cli        # once
eas login                     # once — free Expo account
eas build -p android --profile preview
```

EAS builds the APK in the cloud (~10 min) and prints a download link.
Save the file here as `pocket.apk` and commit it, e.g.:

```bash
mv ~/Downloads/*.apk ../apk/pocket-v2.2.0.apk
git add ../apk && git commit -m "APK v2.2.0" && git push
```

## Install on the Pixel 7

- Easiest: open the EAS download link on the phone and install directly.
- Or from this folder: transfer the `.apk` to the phone (Drive, USB, or the
  GitHub release page), open it, and allow "install unknown apps" when asked.

## Local build (no Expo account, needs Android Studio)

```bash
cd app
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# APK at android/app/build/outputs/apk/release/app-release.apk
```
