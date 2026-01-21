// Serial Bridge Example - Gesture Prediction Visualiser
// This sketch displays gesture predictions from Arduino with confidence levels

let bridge;
let currentGesture = 'waiting...';
let confidence = 0;
let isConnected = false;
let connectionStatus = 'disconnected';
let lastUpdateTime = 0;

// Colors for each gesture
const GESTURE_COLOURS = {
    'circle': [59, 130, 246],      // Blue
    'figure8': [236, 72, 153],     // Pink
    'waiting...': [156, 163, 175]  // Gray
};

function setup() {
    let canvas = createCanvas(600, 400);
    canvas.parent('canvas-container');

    // Connect to Serial Bridge
    bridge = new SerialBridge(); // Auto-detects URL from socket.io script
    // OR: bridge = new SerialBridge('http://localhost:3000');

    // Listen for data from arduino_1
    bridge.onData('arduino_1', (data) => {
        // Parse prediction from Arduino output
        // Format: "Predicted: circle (95.3%)"
        let match = data.match(/Predicted: (\w+) \((\d+\.?\d*)\%\)/);
        if (match) {
            currentGesture = match[1];
            confidence = parseFloat(match[2]);
            lastUpdateTime = millis();
            console.log(`Gesture: ${currentGesture}, Confidence: ${confidence}%`);
        }
    });

    // Listen for connection status changes
    bridge.onStatus('arduino_1', (status, port) => {
        connectionStatus = status;
        isConnected = (status === 'connected');
        console.log(`Arduino status: ${status} on ${port}`);
    });

    console.log('P5.js Gesture Prediction Visualiser initialised');
    console.log('Waiting for Arduino predictions...');
}

function draw() {
    background(30);

    // Connection status indicator (top right)
    let statusColour = isConnected ? color(16, 185, 129) : color(239, 68, 68);
    fill(statusColour);
    noStroke();
    circle(width - 30, 30, 16);

    fill(200);
    textSize(12);
    textAlign(RIGHT, CENTER);
    text(connectionStatus.toUpperCase(), width - 50, 30);

    if (isConnected) {
        // Main gesture display
        textAlign(CENTER, CENTER);

        // Get color for current gesture
        // match the array of colours in currentGestures to GESTURE_COLORS
        let gestureColour = GESTURE_COLOURS[currentGesture] || GESTURE_COLOURS['waiting...'];

        // size of circle based on confidence
        let diam = map(confidence, 0, 100, 100, 250);


        // Draw main circle
        // chnage colour according to gesture predicted
        fill(gestureColour[0], gestureColour[1], gestureColour[2]);
        circle(width / 2, height / 2 - 20, diam);

        // Display gesture name
        fill(255);
        textSize(36);
        textStyle(BOLD);
        text(currentGesture.toUpperCase(), width / 2, height / 2 - 20);

        // Display confidence
        textSize(24);
        textStyle(NORMAL);
        text(`${confidence.toFixed(1)}%`, width / 2, height / 2 + 30);


        // Instructions
        fill(150);
        textSize(12);
        textAlign(CENTER, BOTTOM);
        text('Perform gestures with your Arduino sensor', width / 2, height - 20);

    } else {
        // Not connected message
        fill(200);
        textAlign(CENTER, CENTER);
        textSize(16);
        text('Waiting for Arduino connection...', width / 2, height / 2 - 20);

        textSize(12);
        fill(150);
        text('Make sure Serial Bridge is running', width / 2, height / 2 + 10);
        text('and arduino_1 is connected', width / 2, height / 2 + 30);
    }
}

// Optional: Add gesture-specific behaviors
// Uncomment and customize based on your needs
/*
function draw() {
    // ... existing draw code ...

    // Add gesture-specific visual effects
    if (currentGesture === 'circle') {
        //do something here
    } else if (currentGesture === 'figure8') {
        //do something here
    }
}

*/
