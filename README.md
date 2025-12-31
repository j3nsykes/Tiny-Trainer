# BLE Tiny Motion Trainer

This app is inspired by [Google Creative Lab's Tiny Motion Trainer](https://experiments.withgoogle.com/tiny-motion-trainer) with implementation of the BLE connectivity functionality and design forked from [Irti Nasar's Serial Bridge app](https://github.com/IrtizaNasar). 

This desktop application can be used to train machine learning models with the Arduino Nano 33 BLE Sense inputs. It expands beyond just motion sensing to also collect sensor data for colour and motion, trains and tests models in the app, and deploys them back to Arduino for standalone, on-device classification.

## Features

- **IMU Classification** - Train models using accelerometer and gyroscope data (motion gestures)
- **Color Classification** - Train models using the APDS9960 color sensor
- **Real-time Training** - Train TensorFlow.js models directly in the app
- **Arduino Export** - Download ready-to-upload Arduino code with your trained model
- **BLE Connectivity** - Wireless data collection and device management

## Hardware Requirements

- **Arduino Nano 33 BLE Sense** (or Sense Rev2)
  - Built-in IMU sensor (LSM9DS1 or BMI270/BMM150)
  - Built-in color sensor (APDS9960)
  - Bluetooth Low Energy connectivity

## Software Requirements

- **Node.js** 16.x or higher
- **Arduino IDE** (for uploading sketches to Arduino)
- **Bluetooth** enabled on your computer

## Getting Started

### 1. Upload Arduino Code

Before using the app, you need to upload the multi-sensor streaming sketch to your Arduino:

1. Open Arduino IDE
2. Install required libraries:
   - ArduinoBLE
   - Arduino_LSM9DS1 (for original Nano 33 BLE Sense)
   - Arduino_BMI270_BMM150 (for Nano 33 BLE Sense Rev2)
   - Arduino_APDS9960
3. Open `examples/Arduino/multi-sensor-stream/multi-sensor-stream.ino`
4. Select your board: **Tools > Board > Arduino Nano 33 BLE**
5. Select your port: **Tools > Port**
6. Click **Upload**
7. Open Serial Monitor (115200 baud) to verify - should show "BLE peripheral active, waiting for connections..."

### 2. Download and Run the App

#### Option A: Download Release (Recommended)

1. Go to [Releases](https://github.com/j3nsykes/Tiny-Trainer/releases)
2. Download the latest version for your Mac:
   - **Apple Silicon (M1/M2/M3):** `Tiny Trainer-1.0.0-arm64-mac.zip`
   - **Intel Macs:** `Tiny Trainer-1.0.0-mac.zip`
3. Extract the ZIP file
4. Open `Tiny Trainer.app`
5. If you see a security warning: System Preferences → Security & Privacy → Click "Open Anyway"

#### Option B: Run from Source

1. Clone this repository:

   ```bash
   git clone https://github.com/j3nsykes/Tiny-Trainer.git
   cd Tiny-Trainer
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the app:

   ```bash
   npm start
   ```

   Or run in development mode:

   ```bash
   npm run dev
   ```

### 3. Connect Your Arduino

1. Make sure your Arduino has the multi-sensor-stream sketch uploaded
2. Click **"Start Connection"** button
3. Click **"Start Scanning"**
4. Select your Arduino from the list (shows as "TMT_XXXX")
5. Click **"Open Trainer"** to begin

### 4. Collect Training Data

#### For IMU (Motion/Gesture) Classification:

1. Select **IMU** tab
2. Click **"+ Create Gesture"** and name it (e.g., "punch", "wave", "shake")
3. Click **"Start Capture"** on the gesture
4. Perform the motion for 1-2 seconds
5. Repeat 20-30 times for each gesture
6. Create 2-3 different gestures

#### For Color Classification:

1. Select **Color** tab
2. Click **"+ Create Color"** and name it (e.g., "red", "blue", "green")
3. Click **"Start Capture"** on the color
4. Hold a colored object close to the sensor for 1-2 seconds
5. Repeat 20-30 times for each color
6. Create 2-3 different colors

**Tip:** Aim for 20-30 samples per class for best results. More samples = better accuracy.

### 5. Train Your Model

1. Click **"Start Training"** button
2. Wait for training to complete (usually 10-60 seconds)
3. View the training accuracy in the results panel
4. Test your model in real-time by performing gestures or showing colors

### 6. Export Your Model

You have three export options:

#### Export Training Data (JSON)

- Saves all your captured samples as JSON
- Use this to backup your data or share with others
- Can be imported later to retrain or modify

#### Export Model (TensorFlow.js)

- Downloads your trained model in TensorFlow.js format
- Use this for web applications or further training

#### Download Arduino Code

- Generates complete Arduino sketch with your trained model embedded
- Includes all necessary code for on-device inference
- Upload to Arduino for standalone operation (no computer needed)

## Usage Tips

- **Start Simple:** Begin with 2-3 classes and 20 samples each
- **Be Consistent:** Perform gestures or show colors the same way during capture
- **Test Thoroughly:** Use the real-time testing before exporting
- **Lighting Matters:** For color classification, use consistent lighting
- **Motion Matters:** For IMU, make distinct, repeatable gestures

## Troubleshooting

### Arduino won't connect

- Ensure Bluetooth is enabled on your computer
- Check Arduino is powered and running the multi-sensor-stream sketch
- Open Arduino Serial Monitor (115200 baud) - should show "BLE peripheral active"
- Try moving Arduino closer to computer (within 5 meters)
- Restart the app and try again

### Connection drops frequently

- Reduce distance between Arduino and computer
- Close other Bluetooth devices/apps
- Check Arduino USB power is stable

### Training accuracy is low

- Collect more samples (aim for 30+ per class)
- Make gestures more distinct from each other
- Ensure consistent motion/color presentation during capture
- Try retraining with a validation split

### Arduino code won't compile

- Ensure you have all required libraries installed
- Check you selected the correct board (Arduino Nano 33 BLE)
- For Rev2 boards, uncomment the Rev2 sensor includes in the code

## Project Structure

```
BLE_tinyMotionTrainer/
├── main.js                    # Electron main process
├── package.json              # Dependencies and scripts
├── preload.js                # Electron preload script
├── settings-manager.js       # App settings manager
│
├── public/                   # Frontend code
│   ├── index.html           # Connection page
│   ├── trainer.html         # Training interface
│   ├── client.js            # Main client logic
│   ├── feature-flags.js     # Feature toggles
│   │
│   ├── css/                 # Stylesheets
│   │   ├── main.css
│   │   └── trainer.css
│   │
│   ├── js/                  # JavaScript modules
│   │   ├── ble-device.js   # BLE device handler
│   │   ├── gesture-manager.js  # Gesture management
│   │   ├── data-visualizer.js  # Real-time graphs
│   │   │
│   │   └── ml/              # Machine learning
│   │       ├── ml-trainer.js
│   │       ├── imu-trainer.js
│   │       ├── color-trainer.js
│   │       ├── imu-arduino-generator.js
│   │       └── color-arduino-generator.js
│   │
│   └── profiles/            # Device profiles
│       └── nano-ble.json
│
└── examples/                # Example code
    └── Arduino/
        └── multi-sensor-stream/
            └── multi-sensor-stream.ino
```

## Development

### Build from source:

```bash
npm install
npm start
```

### Build release packages:

```bash
npm run build
```

This creates platform-specific packages in the `release-builds/` directory.

### Enable debug features:

Edit `public/js/feature-flags.js` and set:

```javascript
DEBUG_MODE: true;
```

## Technical Details

- **Frontend:** HTML/CSS/JavaScript (Electron renderer)
- **Backend:** Node.js (Electron main process)
- **BLE Library:** Noble (via @abandonware/noble)
- **ML Library:** TensorFlow.js (@tensorflow/tfjs)
- **Communication:** Nordic UART Service (NUS)
- **Supported Sensors:** IMU (accelerometer/gyroscope), Color (APDS9960)

## Credits

Workflow methods reference [Google Creative Lab's Tiny Motion Trainer](https://experiments.withgoogle.com/tiny-motion-trainer) and [Irti Nasar's Serial Bridge app](https://github.com/IrtizaNasar)

Other historical influences for accessible educational machine learning tools: [Teachable Machine](https://teachablemachine.withgoogle.com/) and [Rebecca Fiebrink's Wekinator](https://doc.gold.ac.uk/~mas01rf/Wekinator/)

## License

MIT License - see LICENSE file for details

## Contributing

Issues and pull requests welcome! Please see CONTRIBUTING.md for guidelines.

## Support

For questions or issues:

- Open an issue on GitHub
- Check existing issues for solutions
- Review the troubleshooting section above

---

**Version:** 1.0.0
**Last Updated:** December 2025
**Compatibility:** macOS
**Arduino:** Nano 33 BLE Sense (all revisions)
