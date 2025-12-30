// ============================================================================
// Tab Manager - Multi-Modal UI Navigation
// ============================================================================
// Handles switching between IMU, Color, and Audio tabs
// Manages BLE mode switching and data routing
// ============================================================================

class TabManager {
    constructor() {
        this.currentTab = 'imu';  // Default tab
        this.bleMode = 'MODE:IMU'; // Default BLE mode
        this.onTabChangeCallbacks = [];

        this.init();
    }

    init() {
        // Get all tab buttons and panels
        this.tabButtons = document.querySelectorAll('.tab-btn');
        this.tabPanels = document.querySelectorAll('.tab-panel');

        // Attach click handlers to tab buttons
        this.tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                this.switchTab(tabName);
            });
        });

        console.log('✅ TabManager initialized');
        console.log(`   Current tab: ${this.currentTab}`);
    }

    switchTab(tabName) {
        if (tabName === this.currentTab) {
            return; // Already on this tab
        }

        console.log(`🔄 Switching from ${this.currentTab} to ${tabName}`);

        // Update active states
        this.tabButtons.forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        this.tabPanels.forEach(panel => {
            if (panel.id === `${tabName}-panel`) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        });

        // Update current tab
        const previousTab = this.currentTab;
        this.currentTab = tabName;

        // Determine BLE mode based on tab
        this.updateBLEMode(tabName);

        // Notify listeners
        this.notifyTabChange(tabName, previousTab);
    }

    updateBLEMode(tabName) {
        let newMode;

        switch (tabName) {
            case 'imu':
                newMode = 'MODE:IMU';
                break;
            case 'color':
                newMode = 'MODE:COLOR';
                break;
            case 'audio':
                // Audio doesn't use BLE streaming (uses laptop mic)
                newMode = null;
                break;
            default:
                newMode = 'MODE:IMU';
        }

        if (newMode !== this.bleMode) {
            this.bleMode = newMode;
            console.log(`   BLE mode: ${newMode || 'None (using laptop sensors)'}`);

            // Send BLE command if connected
            if (window.bridge && window.bridge.isConnected() && newMode) {
                const deviceId = typeof connectedDeviceId !== 'undefined' ? connectedDeviceId : null;
                window.bridge.sendCommand(newMode, deviceId);
            } else if (newMode) {
                console.log(`   ⏳ BLE command queued (will send when connected): ${newMode}`);
            }
        }
    }

    onTabChange(callback) {
        this.onTabChangeCallbacks.push(callback);
    }

    notifyTabChange(newTab, previousTab) {
        this.onTabChangeCallbacks.forEach(callback => {
            try {
                callback(newTab, previousTab);
            } catch (error) {
                console.error('Error in tab change callback:', error);
            }
        });
    }

    getCurrentTab() {
        return this.currentTab;
    }

    getBLEMode() {
        return this.bleMode;
    }

    // Helper to get modality type
    getModality() {
        switch (this.currentTab) {
            case 'imu':
                return 'gesture';
            case 'color':
                return 'color';
            case 'audio':
                return 'audio';
            default:
                return 'gesture';
        }
    }

    // Helper to get expected data format
    getDataFormat() {
        switch (this.currentTab) {
            case 'imu':
                return {
                    type: 'imu',
                    channels: 9,
                    labels: ['ax', 'ay', 'az', 'gx', 'gy', 'gz', 'mx', 'my', 'mz']
                };
            case 'color':
                return {
                    type: 'color',
                    channels: 5,
                    labels: ['r', 'g', 'b', 'c', 'proximity']
                };
            case 'audio':
                return {
                    type: 'audio',
                    channels: 'variable', // Depends on feature extraction
                    labels: ['mfcc', 'spectral', 'temporal']
                };
            default:
                return {
                    type: 'unknown',
                    channels: 0,
                    labels: []
                };
        }
    }
}

// Global instance (will be initialized in trainer-ui.js)
let tabManager = null;
