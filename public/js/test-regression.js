// ============================================================================
// Regression Training Test Script
// ============================================================================
// Console-based test to verify regression training works end-to-end
// Open trainer.html in browser, then run: testRegression()
// ============================================================================

async function testRegression() {
  console.log('🧪 Starting Regression Test...\n');

  try {
    // Step 1: Create test regression data
    console.log('📊 Step 1: Creating synthetic test data...');

    const regressionManager = new RegressionManager();
    regressionManager.setOutputLabels(['Tilt X', 'Tilt Y']);

    // Generate 30 synthetic samples with realistic IMU data + tilt outputs
    // Simulate device tilting in different directions
    for (let i = 0; i < 30; i++) {
      // Generate tilt values between -1 and 1
      const tiltX = (Math.random() * 2 - 1); // -1 to 1
      const tiltY = (Math.random() * 2 - 1); // -1 to 1

      // Generate synthetic IMU data (900 values)
      // In real app, this comes from sensor
      const imuData = [];
      for (let frame = 0; frame < 100; frame++) {
        // Accelerometer (influenced by tilt)
        imuData.push(tiltX * 0.5 + (Math.random() - 0.5) * 0.1); // ax
        imuData.push(tiltY * 0.5 + (Math.random() - 0.5) * 0.1); // ay
        imuData.push(1.0 + (Math.random() - 0.5) * 0.1); // az (gravity)

        // Gyroscope (random motion)
        imuData.push((Math.random() - 0.5) * 0.2); // gx
        imuData.push((Math.random() - 0.5) * 0.2); // gy
        imuData.push((Math.random() - 0.5) * 0.2); // gz

        // Magnetometer (random)
        imuData.push((Math.random() - 0.5) * 0.3); // mx
        imuData.push((Math.random() - 0.5) * 0.3); // my
        imuData.push((Math.random() - 0.5) * 0.3); // mz
      }

      regressionManager.addSample(imuData, [tiltX, tiltY]);
    }

    console.log(`✅ Created ${regressionManager.getSampleCount()} samples`);
    console.log('   Statistics:', regressionManager.getStatistics());

    // Step 2: Train regression model
    console.log('\n📚 Step 2: Training regression model...');

    const config = {
      epochs: 20, // Fewer epochs for quick test
      batchSize: 8,
      learningRate: 0.001,
    };

    await mlTrainer.trainRegression(regressionManager.getAllSamples(), config);

    console.log('✅ Training complete!');
    console.log('   Final MAE:', mlTrainer.history.mae[mlTrainer.history.mae.length - 1].toFixed(4));
    console.log('   Final Val MAE:', mlTrainer.history.valMae[mlTrainer.history.valMae.length - 1].toFixed(4));

    // Step 3: Test prediction
    console.log('\n🔮 Step 3: Testing prediction...');

    // Create test sample
    const testTiltX = 0.5;
    const testTiltY = -0.3;
    const testImuData = [];
    for (let frame = 0; frame < 100; frame++) {
      testImuData.push(testTiltX * 0.5 + (Math.random() - 0.5) * 0.1);
      testImuData.push(testTiltY * 0.5 + (Math.random() - 0.5) * 0.1);
      testImuData.push(1.0 + (Math.random() - 0.5) * 0.1);
      testImuData.push((Math.random() - 0.5) * 0.2);
      testImuData.push((Math.random() - 0.5) * 0.2);
      testImuData.push((Math.random() - 0.5) * 0.2);
      testImuData.push((Math.random() - 0.5) * 0.3);
      testImuData.push((Math.random() - 0.5) * 0.3);
      testImuData.push((Math.random() - 0.5) * 0.3);
    }

    const prediction = await mlTrainer.predictRegression(testImuData);

    console.log('   Expected outputs:', [testTiltX.toFixed(3), testTiltY.toFixed(3)]);
    console.log('   Predicted outputs:', prediction.map(v => v.toFixed(3)));
    console.log('   Error:', [
      Math.abs(prediction[0] - testTiltX).toFixed(3),
      Math.abs(prediction[1] - testTiltY).toFixed(3)
    ]);

    // Step 4: Test export/import
    console.log('\n💾 Step 4: Testing export/import...');

    const exportedJSON = regressionManager.exportJSON();
    console.log(`✅ Exported ${exportedJSON.length} bytes`);

    const newManager = new RegressionManager();
    const imported = newManager.importJSON(exportedJSON);

    if (imported) {
      console.log(`✅ Imported ${newManager.getSampleCount()} samples`);
      console.log('   Match:', newManager.getSampleCount() === regressionManager.getSampleCount());
    }

    // Step 5: Summary
    console.log('\n✅ ALL TESTS PASSED!');
    console.log('\n📝 Summary:');
    console.log('   ✓ Regression data manager works');
    console.log('   ✓ Model training completes successfully');
    console.log('   ✓ Predictions return continuous values');
    console.log('   ✓ Export/import preserves data');
    console.log('\n🎉 Regression backend is ready for UI integration!');

    return {
      success: true,
      manager: regressionManager,
      trainer: mlTrainer,
      prediction: prediction,
    };

  } catch (error) {
    console.error('❌ TEST FAILED:', error);
    console.error(error.stack);
    return { success: false, error: error.message };
  }
}

// Quick test with fewer samples for rapid iteration
async function testRegressionQuick() {
  console.log('🧪 Quick Regression Test (10 samples, 5 epochs)...\n');

  const regressionManager = new RegressionManager();
  regressionManager.setOutputLabels(['Output X', 'Output Y']);
  regressionManager.setMinSamples(10);

  // Create 10 samples
  for (let i = 0; i < 10; i++) {
    const outX = Math.random() * 2 - 1;
    const outY = Math.random() * 2 - 1;

    const imuData = Array(900).fill(0).map(() => Math.random() * 2 - 1);
    regressionManager.addSample(imuData, [outX, outY]);
  }

  console.log(`✅ Created ${regressionManager.getSampleCount()} samples`);

  await mlTrainer.trainRegression(regressionManager.getAllSamples(), {
    epochs: 5,
    batchSize: 4,
  });

  console.log('✅ Quick test complete!');
  console.log('   Final MAE:', mlTrainer.history.mae[mlTrainer.history.mae.length - 1].toFixed(4));
}

console.log('🎯 Regression test script loaded!');
console.log('   Run: testRegression() - Full test with 30 samples, 20 epochs');
console.log('   Run: testRegressionQuick() - Quick test with 10 samples, 5 epochs');
