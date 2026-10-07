// Mermaid diagrams are drawn to the column width, which makes the big ones unreadable. A click on a
// diagram opens it full screen with wheel/button zoom and drag to pan. The listener is delegated
// on document because mermaid renders after navigation.

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const BUTTON_STEP = 1.25;

export function setupDiagramZoom() {
  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (!target || target.closest('a, .diagram-zoom')) return;
    const svg = target.closest('.mermaid')?.querySelector('svg');
    if (svg) open(svg);
  });
}

function open(source: SVGSVGElement) {
  const overlay = document.createElement('div');
  overlay.className = 'diagram-zoom';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Diagram, full screen');
  overlay.innerHTML = `
    <div class="diagram-zoom-toolbar">
      <button type="button" data-action="in" aria-label="Zoom in">+</button>
      <button type="button" data-action="out" aria-label="Zoom out">−</button>
      <button type="button" data-action="fit" aria-label="Fit to screen">Fit</button>
      <button type="button" data-action="close" aria-label="Close">✕</button>
    </div>
    <div class="diagram-zoom-stage"></div>`;

  const stage = overlay.querySelector<HTMLElement>('.diagram-zoom-stage')!;
  const svg = cloneWithOwnIds(source);
  const box = svg.viewBox.baseVal;
  const width = box?.width || source.getBoundingClientRect().width;
  const height = box?.height || source.getBoundingClientRect().height;
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.style.cssText = `width:${width}px;height:${height}px;max-width:none;`;
  stage.append(svg);

  let scale = 1;
  let x = 0;
  let y = 0;
  const apply = () => {
    svg.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };
  const fit = () => {
    const rect = stage.getBoundingClientRect();
    scale = Math.min(
      (rect.width - 48) / width,
      (rect.height - 48) / height,
      MAX_SCALE
    );
    x = (rect.width - width * scale) / 2;
    y = (rect.height - height * scale) / 2;
    apply();
  };
  // Zoom keeping the point under (cx, cy) in place.
  const zoomAt = (factor: number, cx: number, cy: number) => {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    x = cx - ((cx - x) * next) / scale;
    y = cy - ((cy - y) * next) / scale;
    scale = next;
    apply();
  };
  const zoomAtCenter = (factor: number) => {
    const rect = stage.getBoundingClientRect();
    zoomAt(factor, rect.width / 2, rect.height / 2);
  };

  stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      zoomAt(
        Math.exp(-event.deltaY * 0.0015),
        event.clientX - rect.left,
        event.clientY - rect.top
      );
    },
    { passive: false }
  );

  let drag:
    | { id: number; startX: number; startY: number; x: number; y: number }
    | undefined;
  stage.addEventListener('pointerdown', (event) => {
    stage.setPointerCapture(event.pointerId);
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x,
      y,
    };
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    x = drag.x + event.clientX - drag.startX;
    y = drag.y + event.clientY - drag.startY;
    apply();
  });
  const endDrag = () => {
    drag = undefined;
    stage.classList.remove('is-dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('dblclick', fit);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    document.documentElement.style.overflow = '';
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
    else if (event.key === '+' || event.key === '=') zoomAtCenter(BUTTON_STEP);
    else if (event.key === '-') zoomAtCenter(1 / BUTTON_STEP);
    else if (event.key === '0') fit();
  };
  overlay
    .querySelector('.diagram-zoom-toolbar')!
    .addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest('button')?.dataset
        .action;
      if (action === 'in') zoomAtCenter(BUTTON_STEP);
      else if (action === 'out') zoomAtCenter(1 / BUTTON_STEP);
      else if (action === 'fit') fit();
      else if (action === 'close') close();
    });
  document.addEventListener('keydown', onKey);

  document.documentElement.style.overflow = 'hidden';
  document.body.append(overlay);
  fit();
  overlay.querySelector<HTMLButtonElement>('[data-action="close"]')!.focus();
}

// Mermaid looks its diagrams up by id when it re-renders (a resize is enough), so a copy that
// keeps the id gets restyled or replaced. The copy gets its own id everywhere it appears: the
// root, the scoped <style> rules and the marker references.
function cloneWithOwnIds(source: SVGSVGElement): SVGSVGElement {
  const id = source.id;
  if (!id) return source.cloneNode(true) as SVGSVGElement;
  const markup = source.outerHTML.split(id).join(`${id}-zoom`);
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template.content.firstElementChild as SVGSVGElement;
}
