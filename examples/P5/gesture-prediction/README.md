# Gesture Prediction Visualizer

A P5.js example that visualizes real-time gesture predictions from Arduino using Tiny Trainer and Serial Bridge.

## Features

- 🎯 Real-time gesture prediction display
- 📊 Confidence level visualization with animated bars
- 🎨 Color-coded gestures with pulsing effects
- 🔌 Connection status indicator
- 💫 Smooth animations and transitions

## How It Works

This sketch parses prediction data from your Arduino in the format:
```
Predicted: circle (95.3%)
  circle: 95.3%
  figure8: 4.7%
```

It extracts the gesture name and confidence level using regex matching:
```javascript
let match = data.match(/Predicted: (\w+) \((\d+\.?\d*)\%\)/);
```

## Setup

1. **Train your model** with Tiny Trainer
2. **Upload Arduino sketch** that outputs predictions in the format shown above
3. **Start Serial Bridge:**
   ```bash
   npm start
   ```
4. **Open this example** in your browser:
   ```
   open examples/P5/gesture-prediction/index.html
   ```

## Configuration

### Change Device Name

By default, this sketch listens to `arduino_1`. To change the device:

```javascript
bridge.onData('your_device_name', (data) => {
    // ...
});
```

### Add More Gestures

Update the `GESTURE_COLORS` object in `sketch.js`:

```javascript
const GESTURE_COLORS = {
  'circle': [59, 130, 246],      // Blue
  'figure8': [236, 72, 153],     // Pink
  'swipe': [34, 197, 94],        // Green
  'tap': [251, 146, 60],         // Orange
  'waiting...': [156, 163, 175]  // Gray
};
```

### Custom Visual Effects

Uncomment and customize the gesture-specific effects at the bottom of `sketch.js` to add unique animations for each gesture.

## Arduino Output Format

Make sure your Arduino code outputs predictions like this:

```cpp
Serial.print("Predicted: ");
Serial.print(GESTURES[pred]);
Serial.print(" (");
Serial.print(maxConf * 100, 1);
Serial.println("%)");
```

## Troubleshooting

- **No connection**: Make sure Serial Bridge is running on `http://localhost:3000`
- **No predictions**: Check that your Arduino is uploading data and the device name matches
- **Stale data**: The sketch shows "No recent predictions..." if no data arrives for 2 seconds

## Dependencies

- P5.js 2.1.1+
- Socket.IO Client (from Serial Bridge)
- Serial Bridge running on localhost:3000
