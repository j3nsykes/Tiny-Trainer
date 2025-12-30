// ============================================================================
// Color Visualizer
// ============================================================================
// Real-time visualization of APDS9960 color sensor data
// Updates color swatch and bar charts for R, G, B, Clear, Proximity
// ============================================================================

class ColorVisualizer {
  constructor(swatchId = 'color-swatch', valuesContainerId = 'color-values') {
    this.swatchId = swatchId;
    this.valuesContainerId = valuesContainerId;

    // Get DOM elements
    this.swatch = document.getElementById(swatchId);
    this.valuesContainer = document.getElementById(valuesContainerId);

    if (!this.swatch) {
      console.warn(`⚠️ Color swatch element #${swatchId} not found`);
    }

    if (!this.valuesContainer) {
      console.warn(`⚠️ Color values container #${valuesContainerId} not found`);
    }

    // Get individual bar elements
    this.bars = {
      r: document.getElementById('color-bar-r'),
      g: document.getElementById('color-bar-g'),
      b: document.getElementById('color-bar-b'),
      c: document.getElementById('color-bar-c'),
      p: document.getElementById('color-bar-p')
    };

    // Get value display elements
    this.valueDisplays = {
      r: document.getElementById('color-val-r'),
      g: document.getElementById('color-val-g'),
      b: document.getElementById('color-val-b'),
      c: document.getElementById('color-val-c'),
      p: document.getElementById('color-val-p')
    };

    // Animation settings
    this.animationDuration = 100; // ms for smooth transitions

    console.log('✅ ColorVisualizer initialized');
  }

  // ========================================================================
  // Main Update Method
  // ========================================================================

  updateColor(r, g, b, c, p) {
    // Validate inputs
    if ([r, g, b, c, p].some(v => isNaN(v) || v < 0 || v > 1)) {
      console.warn('⚠️ Invalid color values:', { r, g, b, c, p });
      return;
    }

    // Update swatch background color
    this.updateSwatch(r, g, b);

    // Update bar charts
    this.updateBar('r', r);
    this.updateBar('g', g);
    this.updateBar('b', b);
    this.updateBar('c', c);
    this.updateBar('p', p);

    // Update numeric displays
    this.updateValueDisplay('r', r);
    this.updateValueDisplay('g', g);
    this.updateValueDisplay('b', b);
    this.updateValueDisplay('c', c);
    this.updateValueDisplay('p', p);
  }

  // ========================================================================
  // Swatch Updates
  // ========================================================================

  updateSwatch(r, g, b) {
    if (!this.swatch) return;

    const hexColor = this.rgbToHex(r, g, b);
    this.swatch.style.backgroundColor = hexColor;

    // Add a subtle glow effect based on brightness
    const brightness = this.getBrightness(r, g, b);
    const glowIntensity = brightness * 20; // 0-20px
    this.swatch.style.boxShadow = `0 4px 12px rgba(${r*255}, ${g*255}, ${b*255}, ${brightness})`;
  }

  // ========================================================================
  // Bar Chart Updates
  // ========================================================================

  updateBar(channel, value) {
    const bar = this.bars[channel];
    if (!bar) {
      console.warn(`⚠️ Bar element not found for channel: ${channel}`);
      return;
    }

    // Convert value (0-1) to percentage
    const percentage = Math.round(value * 100);

    // Animate bar width
    bar.style.width = `${percentage}%`;

    // Optional: Add pulse effect for high values
    if (value > 0.8) {
      bar.classList.add('pulse');
      setTimeout(() => bar.classList.remove('pulse'), 300);
    }
  }

  // ========================================================================
  // Value Display Updates
  // ========================================================================

  updateValueDisplay(channel, value) {
    const display = this.valueDisplays[channel];
    if (!display) return;

    // Format to 2 decimal places
    display.textContent = value.toFixed(2);

    // Optional: Highlight when value changes significantly
    this.highlightChange(display);
  }

  highlightChange(element) {
    // Add temporary highlight class
    element.classList.add('value-changed');
    setTimeout(() => element.classList.remove('value-changed'), 200);
  }

  // ========================================================================
  // Utility Functions
  // ========================================================================

  rgbToHex(r, g, b) {
    const toHex = (value) => {
      const scaled = Math.round(value * 255);
      const clamped = Math.max(0, Math.min(255, scaled));
      return clamped.toString(16).padStart(2, '0');
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  getBrightness(r, g, b) {
    // Perceived brightness formula (0-1)
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  getDominantChannel(r, g, b) {
    const max = Math.max(r, g, b);
    if (r === max) return 'red';
    if (g === max) return 'green';
    if (b === max) return 'blue';
    return 'none';
  }

  // ========================================================================
  // Reset/Clear
  // ========================================================================

  clear() {
    // Reset swatch to default gray
    if (this.swatch) {
      this.swatch.style.backgroundColor = '#333';
      this.swatch.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
    }

    // Reset all bars to 0%
    Object.values(this.bars).forEach(bar => {
      if (bar) bar.style.width = '0%';
    });

    // Reset all value displays to 0.00
    Object.values(this.valueDisplays).forEach(display => {
      if (display) display.textContent = '0.00';
    });

    console.log('🔄 Color visualization cleared');
  }

  // ========================================================================
  // Helper: Show Color Info
  // ========================================================================

  getColorInfo(r, g, b, c, p) {
    const hex = this.rgbToHex(r, g, b);
    const brightness = this.getBrightness(r, g, b);
    const dominant = this.getDominantChannel(r, g, b);

    return {
      rgb: { r, g, b },
      hex,
      clear: c,
      proximity: p,
      brightness,
      dominantChannel: dominant,
      isNearby: p > 0.3,
      isBright: brightness > 0.5
    };
  }

  // ========================================================================
  // Debug
  // ========================================================================

  logColorInfo(r, g, b, c, p) {
    const info = this.getColorInfo(r, g, b, c, p);
    console.log('🎨 Color Info:', info);
  }
}
