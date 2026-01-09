# Smooth Camera Transition System for Model Switching

## Current State
- `loadCrystal` removes old model, adds new model, immediately calls `fitCameraToSelection` which snaps camera to new position
- No transition, instant camera movement

## Goals
1. No initial camera movement on model switch
2. Smooth camera animation ("swoop") to new reset position with ease-in/ease-out
3. No cross-fade or opacity changes - just movement transition

## High-Level Design

### New CrystalViewer Properties
- `targetCameraPosition`: THREE.Vector3 - target camera position to animate to
- `targetCameraTarget`: THREE.Vector3 - target controls target to animate to  
- `cameraTransitionStart`: number - timestamp when transition started
- `cameraTransitionDuration`: number - duration of transition in ms

### New Methods

#### `computeCameraTargets(): {position: Vector3, target: Vector3, cameraDist: number}`
Extracts camera computation logic from `fitCameraToSelection` without applying it.
Returns computed position, target, and camera distance for fog calculations.

#### `startCameraTransition(position: Vector3, target: Vector3, cameraDist: number)`
Sets transition targets, starts transition timer, updates fog uniforms for new model.

### Modified Methods

#### `loadCrystal(url: string)`
```javascript
async loadCrystal(url) {
  // Remove old model
  if (this.crystalGroup) {
    this.scene.remove(this.crystalGroup);
    // dispose resources
  }
  
  // Clear internals
  this.allIndices = null;
  this.geometry = null;
  // ...
  
  // Load and parse new model
  const response = await smartFetch(url);
  const buffer = await response.arrayBuffer();
  const { meshResult, stats } = this.parsePLY(buffer);
  
  this.crystalGroup = meshResult;
  this.scene.add(this.crystalGroup);
  
  // Apply node scaling and UI sync (existing logic)
  
  // Compute and start camera transition instead of immediate fit
  const targets = this.computeCameraTargets();
  if (targets) {
    this.startCameraTransition(targets.position, targets.target, targets.cameraDist);
  }
  
  return stats;
}
```

#### `animate()`
Add camera transition logic before existing uniform lerping:

```javascript
// Camera transition animation
if (this.cameraTransitionStart !== null) {
  const elapsed = performance.now() - this.cameraTransitionStart;
  const t = Math.min(elapsed / this.cameraTransitionDuration, 1);
  
  // Ease-in-out using sine curve for "swoop" effect
  const easedT = 0.5 - 0.5 * Math.cos(t * Math.PI);
  
  // Interpolate camera position and target
  this.camera.position.lerp(this.targetCameraPosition, easedT);
  this.controls.target.lerp(this.targetCameraTarget, easedT);
  this.controls.update();
  
  // End transition when complete
  if (t >= 1) {
    this.cameraTransitionStart = null;
  }
}

// Existing uniform lerping...
```

### Integration Points

#### Constructor
Initialize new properties:
```javascript
this.targetCameraPosition = null;
this.targetCameraTarget = null; 
this.cameraTransitionStart = null;
this.cameraTransitionDuration = 1000; // 1 second default
```

#### `fitCameraToSelection()`
Keep as-is for manual reset button, but could potentially use the transition system too.

## Todo List

1. **Add new properties to CrystalViewer constructor**
   - targetCameraPosition, targetCameraTarget, cameraTransitionStart, cameraTransitionDuration

2. **Implement computeCameraTargets() method**
   - Extract logic from fitCameraToSelection
   - Return {position, target, cameraDist} object

3. **Implement startCameraTransition() method**
   - Set target values
   - Start transition timer
   - Update fog uniforms (uLineNear, uLineFar, uNodeNear, uNodeFar)

4. **Modify loadCrystal() method**
   - Remove immediate fitCameraToSelection call
   - Add camera transition start after model loading

5. **Update animate() loop**
   - Add camera position/target interpolation with easing
   - Use sine-based ease-in-out for smooth "swoop"

6. **Test transition behavior**
   - Verify smooth animation on model switches
   - Ensure no camera movement on initial load
   - Test with different model sizes

## Notes
- Uses existing camera damping for smooth controls during/after transition
- Transition duration is configurable (default 1s)
- No changes to UI or external interfaces needed
- Maintains all existing functionality for manual camera controls