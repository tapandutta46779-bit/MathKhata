import type { SpeechProvider, SpeechProviderCallbacks } from './types';

/**
 * Web-release stub. The public build uses WebSpeechProvider and must not ship
 * the packaged desktop Whisper runtime or imply that Electron IPC is present.
 */
export class DesktopSpeechProvider implements SpeechProvider {
  readonly id = 'desktop-speech-unavailable-on-web';
  readonly supported = false;

  start(callbacks: SpeechProviderCallbacks): void {
    callbacks.onState('unsupported');
    callbacks.onError('Desktop speech recognition is available only in the packaged MathKhata app.');
    callbacks.onEnd();
  }

  stop(): void {}

  cancel(): void {}
}
