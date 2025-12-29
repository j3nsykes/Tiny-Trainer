// ============================================================================
// BLE Motion Trainer - Basic P5.js Test Sketch
// ============================================================================
// Simple sketch to test your BLE connection and visualize IMU data
// ============================================================================

let bridge;
let imuData = {
  ax: 0, ay: 0, az: 0,  // Accelerometer
  gx: 0, gy: 0, gz: 0   // Gyroscope
};

function setup() {
  createCanvas(800, 600);
  
  // Connect to BLE Bridge
  bridge = new BLEBridge(); // Auto-detects server URL
  
  // Listen for data from device_1
  bridge.onData('device_1', (data) => {
    // Data format: "ax,ay,az,gx,gy,gz"
    // Example: "0.12,-0.03,0.98,1.45,-0.32,0.87"
    
    let values = data.split(',');
    
    if (values.length === 6) {
      imuData.ax = parseFloat(values[0]);
      imuData.ay = parseFloat(values[1]);
      imuData.az = parseFloat(values[2]);
      imuData.gx = parseFloat(values[3]);
      imuData.gy = parseFloat(values[4]);
      imuData.gz = parseFloat(values[5]);
    }
  });
  
  // Listen for connection status
  bridge.onStatus('device_1', (status) => {
    console.log('Device status:', status);
  });
}

function draw() {
  background(30);
  
  // Title
  fill(255);
  textSize(24);
  textAlign(CENTER);
  text('BLE Motion Trainer - IMU Test', width/2, 40);
  
  // Accelerometer Visualization
  drawAccelerometer();
  
  // Gyroscope Visualization
  drawGyroscope();
  
  // Raw Data Display
  drawRawData();
}

function drawAccelerometer() {
  push();
  translate(200, 200);
  
  // Title
  fill(255);
  textSize(16);
  textAlign(CENTER);
  text('Accelerometer (g)', 0, -120);
  
  // Circle background
  noFill();
  stroke(60);
  strokeWeight(2);
  circle(0, 0, 180);
  
  // Crosshair
  stroke(60);
  line(-100, 0, 100, 0);
  line(0, -100, 0, 100);
  
  // Acceleration vector
  let ax = imuData.ax * 80;  // Scale for visualization
  let ay = imuData.ay * 80;
  
  stroke(100, 200, 255);
  strokeWeight(3);
  line(0, 0, ax, ay);
  
  fill(100, 200, 255);
  noStroke();
  circle(ax, ay, 12);
  
  pop();
  
  // Labels
  fill(100, 200, 255);
  textSize(12);
  textAlign(LEFT);
  text(`X: ${imuData.ax.toFixed(3)} g`, 50, 340);
  text(`Y: ${imuData.ay.toFixed(3)} g`, 50, 360);
  text(`Z: ${imuData.az.toFixed(3)} g`, 50, 380);
}

function drawGyroscope() {
  push();
  translate(600, 200);
  
  // Title
  fill(255);
  textSize(16);
  textAlign(CENTER);
  text('Gyroscope (dps)', 0, -120);
  
  // Circle background
  noFill();
  stroke(60);
  strokeWeight(2);
  circle(0, 0, 180);
  
  // Crosshair
  stroke(60);
  line(-100, 0, 100, 0);
  line(0, -100, 0, 100);
  
  // Rotation vector
  let gx = imuData.gx * 0.5;  // Scale for visualization
  let gy = imuData.gy * 0.5;
  
  stroke(255, 150, 100);
  strokeWeight(3);
  line(0, 0, gx, gy);
  
  fill(255, 150, 100);
  noStroke();
  circle(gx, gy, 12);
  
  pop();
  
  // Labels
  fill(255, 150, 100);
  textSize(12);
  textAlign(LEFT);
  text(`X: ${imuData.gx.toFixed(2)} dps`, 450, 340);
  text(`Y: ${imuData.gy.toFixed(2)} dps`, 450, 360);
  text(`Z: ${imuData.gz.toFixed(2)} dps`, 450, 380);
}

function drawRawData() {
  fill(255);
  textSize(14);
  textAlign(CENTER);
  text('Move your Arduino to see data!', width/2, height - 80);
  
  textSize(12);
  fill(150);
  text('Make sure device_1 is connected in the BLE Motion Trainer app', width/2, height - 50);
  
  textSize(11);
  fill(100);
  text('Press any key to test sending data to Arduino', width/2, height - 25);
}

function keyPressed() {
  // Test sending data to Arduino
  bridge.send('device_1', 'LED_ON');
  console.log('Sent: LED_ON');
  
  setTimeout(() => {
    bridge.send('device_1', 'LED_OFF');
    console.log('Sent: LED_OFF');
  }, 1000);
}
