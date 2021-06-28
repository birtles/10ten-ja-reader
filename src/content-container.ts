import { getHash } from './hash';
import { isForeignObjectElement, isSvgDoc, SVG_NS } from './svg';

import contentStyles from '../css/popup.css';
import { getPopupWindow } from './popup';

export function getOrCreateContentContainer(doc: Document): HTMLElement {
  // Drop any legacy containers
  const legacyContainers = doc.querySelectorAll(
    '#rikaichamp-window, #tenten-ja-window'
  );
  for (const container of legacyContainers) {
    removeContentContainer(container);
  }

  // Look for an existing container we can re-use
  const existingContainers = Array.from<HTMLElement>(
    doc.querySelectorAll('#tenten-ja-content')
  );
  if (existingContainers.length) {
    // Drop any duplicate containers, returning only the last one
    while (existingContainers.length > 1) {
      removeContentContainer(existingContainers.shift()!);
    }

    // Make sure the styles are up-to-date
    resetStyles({ container: existingContainers[0], doc });

    return existingContainers[0];
  }

  // Create a new content container

  // For SVG documents we put container <div> inside a <foreignObject>.
  let parent: Element;
  if (isSvgDoc(doc)) {
    const foreignObject = doc.createElementNS(SVG_NS, 'foreignObject');
    foreignObject.setAttribute('width', '100%');
    foreignObject.setAttribute('height', '100%');
    doc.documentElement.append(foreignObject);
    parent = foreignObject;
  } else {
    parent = doc.documentElement;
  }

  // Actually create the container element
  const container = doc.createElement('div');
  container.id = 'tenten-ja-content';
  parent.append(container);

  // Reset any styles the page may have applied.
  container.style.all = 'initial';

  // Add the necessary styles
  resetStyles({ container, doc });

  return container;
}

export function getOrCreateEmptyPopupContainer(doc: Document): HTMLElement {
  const contentContainer = getOrCreateContentContainer(doc);

  // Drop any existing popup container -- for now we never need to re-use the
  // popup container so it's simpler to just drop it and rebuild it if it exists
  const existingPopupContainers = Array.from<Element>(
    contentContainer.shadowRoot!.querySelectorAll('#popup')
  );
  while (existingPopupContainers.length) {
    existingPopupContainers.pop()!.remove();
  }

  // Create the popup container
  const popupContainer = doc.createElement('div');
  popupContainer.id = 'popup';
  contentContainer.shadowRoot!.append(popupContainer);

  // Reset the container position and size so that we can consistently measure
  // the size of the popup.
  popupContainer.style.removeProperty('left');
  popupContainer.style.removeProperty('top');
  popupContainer.style.removeProperty('max-width');
  popupContainer.style.removeProperty('max-height');

  return popupContainer;
}

export function getPopupContainer(doc: Document): HTMLElement | null {
  const contentContainer = doc.getElementById('tenten-ja-content');
  return contentContainer && contentContainer.shadowRoot
    ? contentContainer.shadowRoot.querySelector('#popup')
    : null;
}

export function removePopupContainer() {
  const popupContainer = document.querySelector('#tenten-ja-content #popup');
  if (popupContainer) {
    popupContainer.remove();
  }
}

export function removeAllContent() {
  const containers = Array.from<HTMLElement>(
    document.querySelectorAll(
      '#rikaichamp-window, #tenten-ja-window, #tenten-ja-content'
    )
  );
  for (const container of containers) {
    removeContentContainer(container);
  }
}

export function setContentStyle(style: string) {
  const content = [getPopupWindow(), getPuck()].filter(
    Boolean
  ) as Array<HTMLElement>;

  for (const elem of content) {
    // Theme classes (and only theme classes) start with a '-'
    for (const className of elem.classList.values() || []) {
      if (className.startsWith('-')) {
        elem.classList.remove(className);
      }
    }
    elem.classList.add(`-${style}`);
  }
}

// --------------------------------------------------------------------------
//
// Implementation helpers
//
// --------------------------------------------------------------------------

function removeContentContainer(elem: Element) {
  console.trace('Removing content container');
  if (isForeignObjectElement(elem.parentElement)) {
    elem.parentElement.remove();
  } else {
    elem.remove();
  }
}

function resetStyles({
  container,
  doc,
}: {
  container: HTMLElement;
  doc: Document;
}) {
  if (!container.shadowRoot) {
    container.attachShadow({ mode: 'open' });

    // Add <style>
    const style = doc.createElement('style');
    style.textContent = contentStyles;
    style.dataset.hash = getStyleHash();
    container.shadowRoot!.append(style);
  } else {
    // Reset style
    let existingStyle = container.shadowRoot.querySelector('style');
    if (existingStyle && existingStyle.dataset.hash !== getStyleHash()) {
      existingStyle.remove();
      existingStyle = null;
    }

    if (!existingStyle) {
      const style = doc.createElement('style');
      style.textContent = contentStyles;
      style.dataset.hash = getStyleHash();
      container.shadowRoot!.append(style);
    }
  }
}

let styleHash: string | undefined;

function getStyleHash(): string {
  if (!styleHash) {
    styleHash = getHash(contentStyles.toString());
  }

  return styleHash;
}

function getPuck(): HTMLElement | null {
  const contentContainer = document.getElementById('tenten-ja-content');
  if (!contentContainer || !contentContainer.shadowRoot) {
    return null;
  }

  return contentContainer.shadowRoot.getElementById('puck');
}
