# Contrast Axes UX Improvements

## Summary
Three major UX improvements have been implemented for the Contrast Axes visualization in QFFViz:

### 1. **Pan as Default Mouse Click Behavior**
- **Implementation**: Added `mousedown`, `mousemove`, and `mouseup` event listeners to the plot element
- **Behavior**: 
  - Click and drag with the mouse to pan around the scatter plot
  - Pan works on both X and Y axes simultaneously
  - Smooth panning that maintains aspect ratio
- **Location**: [contrastAxes.ts](QFFViz/src/pages/contrastAxes.ts)

### 2. **Ctrl + Mouse Wheel for Slow Zoom**
- **Implementation**: Added `wheel` event listener with Ctrl modifier key check
- **Behavior**:
  - Hold `Ctrl` and scroll mouse wheel to zoom in/out slowly
  - Scroll up to zoom in (1.1x factor)
  - Scroll down to zoom out (0.9x factor)
  - Zoom is centered on the mouse cursor position
- **Location**: [contrastAxes.ts](QFFViz/src/pages/contrastAxes.ts)

### 3. **Sizeable Scatter Plot Bubbles**
- **Implementation**: Added a new "Size by" dropdown selector with three options
- **Options**:
  - **Identity count**: Bubble size proportional to the number of identities that share the keyword (range: 5-17px)
  - **Best mode score**: Bubble size proportional to the highest mode score for that keyword (range: 5-17px)
  - **Uniform**: All bubbles have the same size (9px, default)
- **Benefits**:
  - Quickly identify keywords shared by many identities
  - Visualize which keywords have strong mode affinity
  - Toggle between modes to get different insights
- **Location**: [contrastAxes.ts](QFFViz/src/pages/contrastAxes.ts)

## Technical Details

### Pan Implementation
The pan feature uses a three-event system:
1. `mousedown`: Captures the starting position and axis ranges
2. `mousemove`: Continuously updates the plot range based on mouse movement
3. `mouseup`: Stops panning

The delta movement is converted to axis range changes proportionally based on the container size.

### Zoom Implementation
The zoom feature:
1. Checks for the Ctrl key modifier
2. Prevents default browser zoom behavior
3. Calculates the mouse position relative to the plot
4. Applies zoom centered on the cursor position using Plotly's `relayout` method

### Sizing Implementation
The `getSizes` function:
- Maps each keyword to a size based on the selected sizing mode
- Uses min-max normalization to scale sizes to 5-17px range
- Recalculates whenever the size dropdown changes (via the existing `draw()` event handler)

## Files Modified
- [contrastAxes.ts](QFFViz/src/pages/contrastAxes.ts) - All three improvements

## Testing
- TypeScript compilation: ✅ Passed (`npm run typecheck`)
- No runtime errors with current data
- All controls are functional and wired to the `draw()` redraw cycle
