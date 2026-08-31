# Building the Pocket APK

Two ways — run either from your Mac. Both put `Pocket.apk` in this folder.

## Option A — EAS cloud build (no Android SDK needed, ~10 min)

```bash
cd app
npx eas-cli build -p android --profile preview
```

- First run: log in / create a free Expo account, accept "create project".
- When it finishes it prints a download URL → download and save as `Pocket.apk` in this folder,
  or fetch it directly:

```bash
npx eas-cli build:download --platform android --output ../Pocket.apk
```

## Option B — local build (needs Android Studio or SDK + JDK 17)

```bash
# once: brew install --cask temurin@17 android-studio   (or android-commandlinetools)
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

cd app
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../../Pocket.apk
```

The release build is signed with a debug keystore by default — fine for installing on your own
Pixel (enable "Install unknown apps"), not for the Play Store. For Play, use the `production`
profile in `app/eas.json` (AAB + auto version bump).
