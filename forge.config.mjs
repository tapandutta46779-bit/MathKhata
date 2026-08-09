import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { FusesPlugin } from '@electron-forge/plugin-fuses';

function ignoreEverythingExceptRuntime(filePath) {
  const relative = filePath.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!relative) return false;
  return !['package.json', 'desktop', 'dist'].some(
    (allowed) => relative === allowed || relative.startsWith(`${allowed}/`),
  );
}

export default {
  packagerConfig: {
    name: 'MathKhata',
    executableName: 'MathKhata',
    appBundleId: 'com.mathkhata.desktop',
    appCategoryType: 'public.app-category.productivity',
    icon: 'build/icon',
    asar: true,
    prune: true,
    ignore: ignoreEverythingExceptRuntime,
    osxSign: { identity: process.env.APPLE_CODESIGN_IDENTITY || '-' },
    extendInfo: {
      NSMicrophoneUsageDescription: 'MathKhata uses the microphone only when you start Voice input.',
      NSAudioCaptureUsageDescription: 'MathKhata uses audio capture only when you start Voice input.',
      NSCameraUsageDescription: 'Camera access is disabled in MathKhata.',
      NSBluetoothAlwaysUsageDescription: 'Bluetooth access is disabled in MathKhata.',
      NSBluetoothPeripheralUsageDescription: 'Bluetooth access is disabled in MathKhata.',
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: true,
      },
      CFBundleDisplayName: 'MathKhata',
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerDMG({ name: 'MathKhata' }, ['darwin']),
    new MakerZIP({}, ['darwin']),
    new MakerSquirrel({
      name: 'MathKhata',
      setupIcon: 'build/icon.ico',
    }),
    new MakerDeb({
      options: {
        name: 'mathkhata',
        productName: 'MathKhata',
        genericName: 'Mathematical Notebook',
        categories: ['Education', 'Science', 'Utility'],
        icon: 'build/icon.png',
      },
    }),
    new MakerRpm({
      options: {
        name: 'mathkhata',
        productName: 'MathKhata',
        genericName: 'Mathematical Notebook',
        categories: ['Education', 'Science', 'Utility'],
        icon: 'build/icon.png',
      },
    }),
  ],
  plugins: [
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
