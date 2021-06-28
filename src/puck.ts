import { getOrCreateContentContainer } from './content-container';

export class RikaiPuck {
  private puckElem: HTMLElement | undefined;
  private enabled = false;

  private puckX: number;
  private puckY: number;
  private setPosition(x: number, y: number) {
    this.puckX = x;
    this.puckY = y;
    if (this.puckElem) {
      this.puckElem.style.transform = `translate(${this.puckX}px, ${this.puckY}px)`;
    }
  }

  private puckWidth: number;
  private puckHeight: number;

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.puckWidth || !this.puckHeight || !this.enabled) {
      return;
    }

    event.preventDefault();

    // Work out where the puck should be
    const { clientX, clientY } = event;
    this.setPosition(
      clientX - this.puckWidth / 2,
      clientY - this.puckHeight / 2
    );

    // Work out where we want to lookup
    const targetX = this.puckX;
    // Offset by at least one pixel so that Rikai doesn't attempt to tunnel into
    // the puck rather than the text.
    const targetY = this.puckY - 1;

    // Make sure the target is an actual element since the mousemove handler
    // expects that.
    const target = document.elementFromPoint(targetX, targetY);
    if (target) {
      target.dispatchEvent(
        new MouseEvent('mousemove', {
          // Make sure the event bubbles up to the listener on the window
          bubbles: true,
          clientX: targetX,
          clientY: targetY,
        })
      );
    }
  };

  // Prevent any mouse events on the puck itself from being used for lookup.
  //
  // At least in Firefox Responsive Design Mode (with touch simulation disabled)
  // we can get _both_ pointer events and mouse events being dispatched.
  private readonly onMouseMove = (event: MouseEvent) => {
    event.stopPropagation();
  };

  render(doc: Document): void {
    // Remove any existing pucks (e.g. if we are upgrading and failed to clean
    // up last time).
    const contentContainer = getOrCreateContentContainer(doc);
    const existingPucks = Array.from<Element>(
      contentContainer.shadowRoot!.querySelectorAll('#puck')
    );
    while (existingPucks.length) {
      existingPucks.pop()!.remove();
    }

    // Create the new puck
    this.puckElem = doc.createElement('div');
    this.puckElem.id = 'puck';
    contentContainer.shadowRoot!.append(this.puckElem);

    // Calculate its size
    if (!this.puckWidth || !this.puckHeight) {
      const { width, height } = this.puckElem.getBoundingClientRect();
      this.puckWidth = width;
      this.puckHeight = height;
    }

    // Calculate its initial position
    const viewportWidth = doc.documentElement.clientWidth;
    const viewportHeight = doc.documentElement.clientHeight;
    const safeAreaInsetRight = 16; // TODO: calculate properly
    const safeAreaInsetBottom = 200; // TODO: calculate properly
    this.setPosition(
      viewportWidth - this.puckWidth - safeAreaInsetRight,
      viewportHeight - this.puckHeight - safeAreaInsetBottom
    );

    // Add event listeners
    if (this.enabled) {
      this.puckElem.addEventListener('pointermove', this.onPointerMove);
      this.puckElem.addEventListener('mousemove', this.onMouseMove, {
        capture: true,
      });
    }
  }

  enable(): void {
    this.enabled = true;
    if (this.puckElem) {
      this.puckElem.addEventListener('pointermove', this.onPointerMove);
      this.puckElem.addEventListener('mousemove', this.onMouseMove, {
        capture: true,
      });
    }
  }

  disable(): void {
    this.enabled = false;
    if (this.puckElem) {
      this.puckElem.removeEventListener('pointermove', this.onPointerMove);
      this.puckElem.removeEventListener('mousemove', this.onMouseMove, {
        capture: true,
      });
    }
  }
}
