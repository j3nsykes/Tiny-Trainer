#ifndef MPR121_HELPER_H
#define MPR121_HELPER_H

#include "Adafruit_MPR121.h"

// Beginner-friendly wrapper for Adafruit MPR121 to align with the old Bare Conductive library
// Hides the need to show Bit manipulation to beginners.
class MPR121_Helper {
private:
  Adafruit_MPR121* sensor;
  uint16_t currentTouchData;
  uint16_t lastTouchData;
  uint16_t filteredDataCache[12];  // Cache for filtered data

public:
  MPR121_Helper(Adafruit_MPR121* cap) {
    sensor = cap;
    currentTouchData = 0;
    lastTouchData = 0;
    // Initialise filtered data cache
    for (uint8_t i = 0; i < 12; i++) {
      filteredDataCache[i] = 0;
    }
  }

  // Update touch data from the sensor. Call this once per loop
  void updateTouchData() {
    lastTouchData = currentTouchData;
    currentTouchData = sensor->touched();
  }

  // Update filtered data for all electrodes. Call once per loop for proximity sensing
  void updateFilteredData() {
    for (uint8_t i = 0; i < 12; i++) {
      filteredDataCache[i] = sensor->filteredData(i);
    }
  }

    // Check if a specific sensor is currently touched
  bool getTouchData(uint8_t electrode) {
    if (electrode > 11) return false;
    return (currentTouchData & (1 << electrode)) != 0;
  }

  // Check if a specific sensor is currently touched
  bool isTouched(uint8_t electrode) {
    if (electrode > 11) return false;
    return (currentTouchData & (1 << electrode)) != 0;
  }

  // Check if a sensor was touched in the last reading
  bool wasTouched(uint8_t electrode) {
    if (electrode > 11) return false;
    return (lastTouchData & (1 << electrode)) != 0;
  }

  // Check if there is a new touch event
  bool isNewTouch(uint8_t electrode) {
    return isTouched(electrode) && !wasTouched(electrode);
  }

  // Check if there was a new release event
  bool isNewRelease(uint8_t electrode) {
    return !isTouched(electrode) && wasTouched(electrode);
  }

  // Get the total number of sensors currently touched
  uint8_t getNumTouches() {
    uint8_t count = 0;
    for (uint8_t i = 0; i < 12; i++) {
      if (isTouched(i)) count++;
    }
    return count;
  }

  // Get filtered data for proximity sensing
  // Higher values = closer to electrode
  // Returns cached value. Call updateFilteredData() first
  uint16_t getFilteredData(uint8_t electrode) {
    if (electrode > 11) return 0;
    return filteredDataCache[electrode];
  }

  // Set touch and release thresholds for all electrodes
  void setThresholds(uint8_t touchThreshold, uint8_t releaseThreshold) {
    sensor->setThresholds(touchThreshold, releaseThreshold);
  }

  // Separate methods for setting thresholds individually
  void setTouchThreshold(uint8_t threshold) {
    sensor->setThresholds(threshold, 20); // Use default release of 20
  }

  void setReleaseThreshold(uint8_t threshold) {
    sensor->setThresholds(40, threshold); // Use default touch of 40
  }
};

#endif
