// Opening video in VLC — the shop owner's player of choice.
//
// Why this file exists: VLC pops its own "RTSP authentication" dialog whenever
// it receives a `401 Digest` challenge, and it only has to deal with that
// challenge when the credentials are NOT already handled for it. Two rules keep
// the dialog away:
//
// 1. RTSP: use the SAME credential shape as the live URL that already works —
//    `user=…&password=…` inside the PATH (see `buildXmArchiveUrl`). VLC then
//    never sees a userinfo component and never starts its own auth.
// 2. Archives: hand VLC a LOCAL FILE (`content://` through the app's own
//    FileProvider) instead of a network URL. A local file has no auth at all,
//    so there is nothing to prompt for. The file is fetched over DVRIP by the
//    native module.
//
// `Linking.openURL` cannot be used for a `content://` URI: React Native does
// not add `FLAG_GRANT_READ_URI_PERMISSION`, so VLC would be denied read access.
// The native module adds that flag; when it is missing (Expo Go) we fall back
// to `Linking` for network URLs and report honestly for local ones.
import { Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { isAvailable as nativeAvailable, openInVlc as nativeOpenInVlc } from '../../modules/cctv-playback';

export const VLC_PACKAGE = 'org.videolan.vlc';

/** `…/clip-123.h264` → `file:///…/clip-123.h264` */
function toFileUri(path) {
  const value = String(path || '');
  if (!value) return '';
  return value.startsWith('file://') || value.startsWith('content://') ? value : `file://${value}`;
}

/**
 * Opens a network stream (rtsp://) or a local file in VLC.
 * Resolves { ok, via } — never throws.
 */
export async function openInVlc(target, { mimeType = 'video/*' } = {}) {
  const value = String(target || '');
  if (!value) return { ok: false, reason: 'empty' };

  if (nativeAvailable) {
    try {
      const opened = await nativeOpenInVlc(value, mimeType);
      if (opened) return { ok: true, via: 'native' };
    } catch (error) {
      // fall through to Linking
    }
  }

  if (value.startsWith('content://')) {
    // Without the read grant VLC cannot open it — say so instead of a silent fail.
    return { ok: false, reason: 'grant' };
  }

  try {
    await Linking.openURL(value);
    return { ok: true, via: 'linking' };
  } catch (error) {
    return { ok: false, reason: 'no-app' };
  }
}

/**
 * Publishes an app-private clip through the FileProvider and plays it in VLC.
 * This is the prompt-free path: the player reads a local `content://` URI.
 */
export async function openLocalFileInVlc(filePath, { mimeType = 'video/*' } = {}) {
  const uri = toFileUri(filePath);
  if (!uri) return { ok: false, reason: 'empty' };
  let contentUri = uri;
  try {
    contentUri = await FileSystem.getContentUriAsync(uri);
  } catch (error) {
    // Keep the file:// URI; the native side may still be able to grant it.
    contentUri = uri;
  }
  const result = await openInVlc(contentUri, { mimeType });
  return { ...result, contentUri };
}
