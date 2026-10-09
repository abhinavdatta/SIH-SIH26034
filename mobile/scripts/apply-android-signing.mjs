// ═══════════════════════════════════════════════════════════════
// apply-android-signing — wire the release keystore into the native
// Android project. Idempotent: safe to run after every
// `npx expo prebuild --platform android` (prebuild regenerates
// android/ and resets signing to the debug key, which is exactly
// what makes Play Protect distrust a sideloaded APK).
//
// Reads the keystore password from mobile/keystore/RELEASE_CREDENTIALS.txt
// (or the LMCC_KEYSTORE_PASSWORD environment variable) and:
//   1. appends signing properties to android/gradle.properties
//   2. patches android/app/build.gradle to add a release signingConfig
//
// Usage: node scripts/apply-android-signing.mjs
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const keystorePath = resolve(root, 'keystore', 'lmcc-release.keystore');
const gradlePropsPath = resolve(root, 'android', 'gradle.properties');
const buildGradlePath = resolve(root, 'android', 'app', 'build.gradle');

if (!existsSync(keystorePath)) {
  console.error('✗ keystore/lmcc-release.keystore not found. Create it first (see mobile/README.md › Release signing).');
  process.exit(1);
}
if (!existsSync(buildGradlePath)) {
  console.error('✗ android/app/build.gradle not found. Run `npx expo prebuild --platform android` first.');
  process.exit(1);
}

function readPassword() {
  if (process.env.LMCC_KEYSTORE_PASSWORD) return process.env.LMCC_KEYSTORE_PASSWORD;
  const creds = resolve(root, 'keystore', 'RELEASE_CREDENTIALS.txt');
  const match = readFileSync(creds, 'utf8').match(/^Store password\s*:\s*(\S+)\s*$/m);
  if (!match) {
    console.error('✗ Could not read the store password from keystore/RELEASE_CREDENTIALS.txt');
    process.exit(1);
  }
  return match[1];
}

const password = readPassword();

/* 1 · gradle.properties — the four signing values (android/ is gitignored) */
const props = readFileSync(gradlePropsPath, 'utf8');
const additions = [
  '# LMCC release signing (added by scripts/apply-android-signing.mjs)',
  `LMCC_UPLOAD_STORE_FILE=${keystorePath.replace(/\\/g, '/')}`,
  `LMCC_UPLOAD_STORE_PASSWORD=${password}`,
  'LMCC_UPLOAD_KEY_ALIAS=lmcc',
  `LMCC_UPLOAD_KEY_PASSWORD=${password}`,
].join('\n');

if (!props.includes('LMCC_UPLOAD_STORE_FILE')) {
  writeFileSync(gradlePropsPath, `${props.replace(/\s*$/, '\n')}${additions}\n`);
  console.log('✓ signing properties added to android/gradle.properties');
} else {
  const updated = props
    .replace(/LMCC_UPLOAD_STORE_FILE=.*/g, `LMCC_UPLOAD_STORE_FILE=${keystorePath.replace(/\\/g, '/')}`)
    .replace(/LMCC_UPLOAD_STORE_PASSWORD=.*/g, `LMCC_UPLOAD_STORE_PASSWORD=${password}`)
    .replace(/LMCC_UPLOAD_KEY_ALIAS=.*/g, 'LMCC_UPLOAD_KEY_ALIAS=lmcc')
    .replace(/LMCC_UPLOAD_KEY_PASSWORD=.*/g, `LMCC_UPLOAD_KEY_PASSWORD=${password}`);
  writeFileSync(gradlePropsPath, updated);
  console.log('✓ signing properties refreshed in android/gradle.properties');
}

/* 2 · app/build.gradle — release signingConfig + buildType wiring */
let gradle = readFileSync(buildGradlePath, 'utf8');

const debugBlock = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;
const debugBlockWithRelease = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            // Wired by scripts/apply-android-signing.mjs — dedicated release
            // keystore (keystore/lmcc-release.keystore). A release APK signed
            // with the public debug key is what Play Protect distrusts.
            if (project.hasProperty('LMCC_UPLOAD_STORE_FILE')) {
                storeFile file(LMCC_UPLOAD_STORE_FILE)
                storePassword LMCC_UPLOAD_STORE_PASSWORD
                keyAlias LMCC_UPLOAD_KEY_ALIAS
                keyPassword LMCC_UPLOAD_KEY_PASSWORD
            }
        }
    }`;

if (!gradle.includes('LMCC_UPLOAD_STORE_FILE')) {
  if (!gradle.includes(debugBlock)) {
    console.error('✗ Expected signingConfigs template not found in android/app/build.gradle (prebuild output changed?).');
    process.exit(1);
  }
  gradle = gradle.replace(debugBlock, debugBlockWithRelease);

  const releaseLine = '            signingConfig signingConfigs.debug';
  const releaseLineWithChoice =
    "            signingConfig project.hasProperty('LMCC_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug";
  // Only the buildTypes.release occurrence (the second one in the file).
  const first = gradle.indexOf(releaseLine);
  const second = gradle.indexOf(releaseLine, first + 1);
  if (first === -1 || second === -1) {
    console.error('✗ Expected buildTypes signingConfig lines not found.');
    process.exit(1);
  }
  gradle = gradle.slice(0, second) + releaseLineWithChoice + gradle.slice(second + releaseLine.length);
  writeFileSync(buildGradlePath, gradle);
  console.log('✓ android/app/build.gradle patched with the release signing config');
} else {
  console.log('✓ android/app/build.gradle already patched — nothing to do');
}

/* 3 · cmake version pin — Windows MAX_PATH.
      The repo's folder location ("New folder (2)" etc.) pushes the
      generated codegen object paths past 260 chars; cmake 3.22.1's
      ninja 1.10 hard-fails there ("Filename longer than 260
      characters"). cmake 3.31.6 bundles ninja 1.12.1, which is
      long-path aware when the OS registry LongPathsEnabled=1 (this
      machine already has it on). Requires the SDK package:
      sdkmanager --install "cmake;3.31.6" */
const cmakePin = `    externalNativeBuild {
        cmake {
            version "3.31.6"
        }
    }
`;
const buildToolsLine = '    buildToolsVersion rootProject.ext.buildToolsVersion';
if (!gradle.includes('externalNativeBuild')) {
  if (!gradle.includes(buildToolsLine)) {
    console.error('✗ buildToolsVersion anchor not found in android/app/build.gradle.');
    process.exit(1);
  }
  gradle = gradle.replace(buildToolsLine, `${buildToolsLine}\n${cmakePin}`);
  writeFileSync(buildGradlePath, gradle);
  console.log('✓ cmake pinned to 3.31.6 (long-path ninja 1.12.1) in android/app/build.gradle');
} else {
  console.log('✓ cmake pin already present in android/app/build.gradle');
}

/* 4 · release manifest overlay — allow http:// backends.
      Expo enables cleartext for DEBUG builds only; the release APK
      would otherwise silently fail against every http:// server
      (LAN dev machines, non-HTTPS deployments) on Android 9+.
      Serving production over HTTPS? Delete this overlay file and
      rebuild for strict transport security. */
const releaseManifestDir = resolve(root, 'android', 'app', 'src', 'release');
const releaseManifestPath = resolve(releaseManifestDir, 'AndroidManifest.xml');
const releaseManifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <application android:usesCleartextTraffic="true" tools:targetApi="28" tools:replace="android:usesCleartextTraffic" />
</manifest>
`;
if (!existsSync(releaseManifestPath) || readFileSync(releaseManifestPath, 'utf8') !== releaseManifest) {
  if (!existsSync(releaseManifestDir)) mkdirSync(releaseManifestDir, { recursive: true });
  writeFileSync(releaseManifestPath, releaseManifest);
  console.log('✓ release manifest overlay written (cleartext HTTP enabled for http:// backends)');
} else {
  console.log('✓ release manifest overlay already present');
}

/* 5 · strip permissions the app never uses.
      Expo's prebuild template ships "OPTIONAL PERMISSIONS, REMOVE
      WHATEVER YOU DO NOT NEED" — SYSTEM_ALERT_WINDOW (overlay drawing)
      and VIBRATE have no purpose in LMCC, and RECORD_AUDIO is covered
      by the expo-camera plugin's recordAudioAndroid:false (stripped
      here too, defensively). A camera-only permission set keeps the
      install-time prompts honest. */
const mainManifestPath = resolve(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const mainManifest = readFileSync(mainManifestPath, 'utf8');
const stripped = mainManifest
  .split('\n')
  .filter((line) => !/android\.permission\.(SYSTEM_ALERT_WINDOW|VIBRATE|RECORD_AUDIO)"/.test(line))
  .join('\n');
if (stripped !== mainManifest) {
  writeFileSync(mainManifestPath, stripped);
  console.log('✓ unused permissions stripped from the main manifest (SYSTEM_ALERT_WINDOW / VIBRATE / RECORD_AUDIO)');
} else {
  console.log('✓ main manifest already free of unused permissions');
}

console.log('\nRelease signing is configured. Build with:');
console.log('  cd android && ./gradlew assembleRelease');
console.log('APK lands in android/app/build/outputs/apk/release/app-release.apk');
