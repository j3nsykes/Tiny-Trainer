// ============================================================================
// Preload Script
// ============================================================================
// Exposes safe APIs from the main process to the renderer process
// This runs in a sandboxed environment with access to both Node.js and DOM
// ============================================================================

const { contextBridge, ipcRenderer } = require('electron');

// ============================================================================
// Expose Safe APIs to Renderer
// ============================================================================

contextBridge.exposeInMainWorld('electron', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  
  // File system
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  
  // IPC listeners
  on: (channel, callback) => {
    const validChannels = ['server-started', 'ble-state-changed'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  
  once: (channel, callback) => {
    const validChannels = ['server-started', 'ble-state-changed'];
    if (validChannels.includes(channel)) {
      ipcRenderer.once(channel, (event, ...args) => callback(...args));
    }
  },
  
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  }
});

// ============================================================================
// Log
// ============================================================================

console.log('✅ Preload script loaded');
