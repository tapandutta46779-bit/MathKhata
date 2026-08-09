const { contextBridge, ipcRenderer } = require('electron');

const versionArgument = process.argv.find((argument) => argument.startsWith('--mathkhata-version='));
const version = versionArgument?.slice('--mathkhata-version='.length) || '1.0.0';

function markDesktopDocument() {
  document.documentElement.dataset.desktopPlatform = process.platform;
  if (process.platform === 'darwin') {
    document.documentElement.style.setProperty('--desktop-titlebar-left', '82px');
  }
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', markDesktopDocument, { once: true });
else markDesktopDocument();

contextBridge.exposeInMainWorld('mathKhataDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  version,
  onCommand(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('desktop:command', listener);
    return () => ipcRenderer.removeListener('desktop:command', listener);
  },
  aion: Object.freeze({
    check: () => ipcRenderer.invoke('aion:check'),
    chat: (payload) => ipcRenderer.invoke('aion:chat', payload),
  }),
}));
