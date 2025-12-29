// ============================================================================
// Settings Manager
// ============================================================================
// Simple settings persistence for BLE Tiny Motion Trainer
// Stores user preferences in the app data directory
// ============================================================================

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const SETTINGS_FILE = 'settings.json';

// Default settings
const DEFAULT_SETTINGS = {
  theme: 'dark',
  serverPort: 3000,
  bluetoothEnabled: true,
  lastDevices: [],
  windowBounds: {
    width: 1200,
    height: 800
  }
};

// ============================================================================
// Settings Storage
// ============================================================================

let settings = { ...DEFAULT_SETTINGS };
let settingsPath = null;

function getSettingsPath() {
  if (!settingsPath) {
    const userDataPath = app.getPath('userData');
    settingsPath = path.join(userDataPath, SETTINGS_FILE);
  }
  return settingsPath;
}

function loadSettings() {
  try {
    const filePath = getSettingsPath();

    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      // const loadedSettings = JSON.parse(data);
      const loadedSettings = data.trim() ? JSON.parse(data) : {};
      // Merge with defaults (in case new settings were added)
      settings = { ...DEFAULT_SETTINGS, ...loadedSettings };

      console.log('✅ Settings loaded from:', filePath);
    } else {
      console.log('📝 No settings file found, using defaults');
      settings = { ...DEFAULT_SETTINGS };
    }
  } catch (error) {
    console.error('❌ Error loading settings:', error);
    settings = { ...DEFAULT_SETTINGS };
  }

  return settings;
}

function saveSettings() {
  try {
    const filePath = getSettingsPath();
    const dirPath = path.dirname(filePath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Write settings to file
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8');

    console.log('✅ Settings saved to:', filePath);
    return true;
  } catch (error) {
    console.error('❌ Error saving settings:', error);
    return false;
  }
}

function getSettings() {
  return { ...settings };
}

function getSetting(key) {
  return settings[key];
}

function updateSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  return saveSettings();
}

function updateSetting(key, value) {
  settings[key] = value;
  return saveSettings();
}

function resetSettings() {
  settings = { ...DEFAULT_SETTINGS };
  return saveSettings();
}

// ============================================================================
// Initialization
// ============================================================================

// Load settings when module is first required
if (app.isReady()) {
  loadSettings();
} else {
  app.on('ready', loadSettings);
}

// Save settings before app quits
app.on('before-quit', () => {
  saveSettings();
});

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  loadSettings,
  saveSettings,
  getSettings,
  getSetting,
  updateSettings,
  updateSetting,
  resetSettings
};