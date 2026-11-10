// In-app build stamp so the owner can tell WHICH APK is installed.
//
// v9 (manual) and v10 (automatic) both shipped as "1.2.0" with the same APK
// file name, which made it impossible to know which build was on the phone.
// The version comes from app.json (one source of truth) and the build number
// mirrors app.json → expo.android.versionCode. scripts/verify.js fails if the
// two ever drift apart.
import appJson from '../app.json';

export const APP_VERSION = appJson.expo.version;
export const BUILD_NUMBER = appJson.expo.android.versionCode;

/** e.g. "1.3.0 (10)" — keep Latin digits so it can be compared to the file name. */
export const BUILD_STAMP = `${APP_VERSION} (${BUILD_NUMBER})`;
