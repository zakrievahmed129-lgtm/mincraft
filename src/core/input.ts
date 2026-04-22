/**
 * InputManager — Keyboard + pointer lock mouse input.
 * Accumulates deltas per frame, reset by engine after each tick.
 */
export class InputManager {
  private keysDown = new Set<string>();
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  isPointerLocked = false;
  justPressedLeft = false;
  justPressedRight = false;
  isMouseDownLeft = false;
  isMouseDownRight = false;
  
  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      this.keysDown.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    canvas.addEventListener('click', () => {
      canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === canvas;
      const prompt = document.getElementById('prompt');
      if (prompt) prompt.style.opacity = this.isPointerLocked ? '0' : '1';
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isPointerLocked) {
        this.mouseDeltaX += e.movementX;
        this.mouseDeltaY += e.movementY;
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (this.isPointerLocked) {
        if (e.button === 0) {
          this.justPressedLeft = true;
          this.isMouseDownLeft = true;
        }
        if (e.button === 2) {
          this.justPressedRight = true;
          this.isMouseDownRight = true;
        }
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.isMouseDownLeft = false;
      if (e.button === 2) this.isMouseDownRight = false;
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isKeyDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  resetFrame(): void {
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.justPressedLeft = false;
    this.justPressedRight = false;
  }
}
