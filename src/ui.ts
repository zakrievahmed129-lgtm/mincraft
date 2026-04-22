import { HOTBAR_SIZE, type InventorySlot } from './ecs/components/inventory';
import { BlockType, getBlockLabel } from './world/chunk';

type UISlotView = {
  root: HTMLDivElement;
  icon: HTMLDivElement;
  count: HTMLSpanElement;
};

type FloatingDropState = {
  id: string;
  x: number;
  y: number;
  scale: number;
  blockType: number;
  count: number;
};

type BreakOverlayState = {
  x: number;
  y: number;
  size: number;
  progress: number;
  blockType: number;
};

export class UI {
  private container: HTMLDivElement;
  private hotbarSlots: UISlotView[] = [];
  private inventorySlots: UISlotView[] = [];
  private floatingDropEls = new Map<string, HTMLDivElement>();
  private healthHearts: HTMLDivElement[] = [];
  private hungerIcons: HTMLDivElement[] = [];
  private activeSlot = 0;
  private saturationFill!: HTMLDivElement;
  private timeChip!: HTMLDivElement;
  private statusLabel!: HTMLDivElement;
  private underwaterOverlay!: HTMLDivElement;
  private damageOverlay!: HTMLDivElement;
  private floatingLayer!: HTMLDivElement;
  private inventoryOverlay!: HTMLDivElement;
  private breakOverlay!: HTMLDivElement;
  private breakText!: HTMLDivElement;
  private hideTimer: number | null = null;

  private blockColors: Record<number, string> = {
    [BlockType.Grass]: '#52852f',
    [BlockType.Dirt]: '#866043',
    [BlockType.Stone]: '#7d7d7d',
    [BlockType.Wood]: '#6b4a2a',
    [BlockType.Leaves]: '#497231',
    [BlockType.Water]: '#2d67d6',
  };

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'game-ui';
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 50;
      font-family: Inter, Arial, sans-serif;
      color: #fff;
      user-select: none;
    `;

    document.body.appendChild(this.container);
    this.createOverlays();
    this.createFloatingLayer();
    this.createVitals();
    this.createHotbar();
    this.createInventoryOverlay();

    window.addEventListener('wheel', (e) => {
      if (e.deltaY > 0) this.setActiveSlot((this.activeSlot + 1) % HOTBAR_SIZE);
      else this.setActiveSlot((this.activeSlot - 1 + HOTBAR_SIZE) % HOTBAR_SIZE);
    });

    window.addEventListener('keydown', (e) => {
      if (e.key >= '1' && e.key <= '9') {
        this.setActiveSlot(parseInt(e.key, 10) - 1);
      }
      if (e.key.toLowerCase() === 'e') {
        this.toggleInventory();
      }
    });
  }

  private createOverlays() {
    this.underwaterOverlay = document.createElement('div');
    this.underwaterOverlay.style.cssText = `
      position: absolute;
      inset: 0;
      opacity: 0;
      background:
        radial-gradient(circle at 50% 35%, rgba(170, 230, 255, 0.16), rgba(40, 96, 160, 0.12) 34%, rgba(4, 18, 45, 0.55) 100%),
        linear-gradient(180deg, rgba(20, 70, 130, 0.12), rgba(8, 18, 50, 0.34));
      transition: opacity 160ms ease;
    `;

    this.damageOverlay = document.createElement('div');
    this.damageOverlay.style.cssText = `
      position: absolute;
      inset: 0;
      opacity: 0;
      background: radial-gradient(circle at center, rgba(255,255,255,0) 56%, rgba(180, 15, 15, 0.42) 100%);
      transition: opacity 120ms ease;
      mix-blend-mode: screen;
    `;

    this.statusLabel = document.createElement('div');
    this.statusLabel.style.cssText = `
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      min-width: 280px;
      text-align: center;
      color: rgba(255,255,255,0.96);
      padding: 8px 14px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.38);
      backdrop-filter: blur(8px);
      font-size: 13px;
      opacity: 0;
      transition: opacity 240ms ease;
    `;

    this.timeChip = document.createElement('div');
    this.timeChip.style.cssText = `
      position: absolute;
      top: 16px;
      right: 16px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(7, 12, 22, 0.45);
      color: #d6eaff;
      font-size: 13px;
      letter-spacing: 0.04em;
      box-shadow: 0 0 20px rgba(60, 120, 200, 0.18);
    `;
    this.timeChip.textContent = '06:00';

    this.breakOverlay = document.createElement('div');
    this.breakOverlay.style.cssText = `
      position: absolute;
      width: 56px;
      height: 56px;
      opacity: 0;
      border: 2px solid rgba(255,255,255,0.4);
      box-shadow: 0 0 0 1px rgba(0,0,0,0.5), inset 0 0 28px rgba(0,0,0,0.22);
      transform: translate(-50%, -50%);
      background:
        linear-gradient(45deg, transparent 18%, rgba(255,255,255,0.1) 19%, transparent 21%),
        linear-gradient(-40deg, transparent 34%, rgba(255,255,255,0.08) 35%, transparent 37%),
        linear-gradient(90deg, transparent 49%, rgba(255,255,255,0.12) 50%, transparent 52%),
        linear-gradient(8deg, transparent 62%, rgba(255,255,255,0.12) 63%, transparent 66%);
      transition: opacity 70ms linear;
    `;

    this.breakText = document.createElement('div');
    this.breakText.style.cssText = `
      position: absolute;
      transform: translate(-50%, calc(-50% + 42px));
      font-size: 11px;
      color: rgba(255,255,255,0.9);
      text-shadow: 0 2px 8px rgba(0,0,0,0.7);
      opacity: 0;
    `;

    this.container.appendChild(this.underwaterOverlay);
    this.container.appendChild(this.damageOverlay);
    this.container.appendChild(this.breakOverlay);
    this.container.appendChild(this.breakText);
    this.container.appendChild(this.statusLabel);
    this.container.appendChild(this.timeChip);
  }

  private createFloatingLayer() {
    this.floatingLayer = document.createElement('div');
    this.floatingLayer.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
    `;
    this.container.appendChild(this.floatingLayer);
  }

  private createVitals() {
    const vitals = document.createElement('div');
    vitals.style.cssText = `
      position: absolute;
      left: 50%;
      bottom: 78px;
      transform: translateX(-196px);
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;

    const healthContainer = document.createElement('div');
    healthContainer.style.cssText = `display: flex; gap: 2px;`;
    for (let i = 0; i < 10; i++) {
      const heart = document.createElement('div');
      heart.style.cssText = `
        width: 16px;
        height: 16px;
        background-color: #ff2a2a;
        clip-path: polygon(50% 20%, 80% 0, 100% 20%, 100% 50%, 50% 100%, 0 50%, 0 20%, 20% 0);
        border: 1px solid #4a0000;
      `;
      this.healthHearts.push(heart);
      healthContainer.appendChild(heart);
    }

    const hungerContainer = document.createElement('div');
    hungerContainer.style.cssText = `display: flex; gap: 2px;`;
    for (let i = 0; i < 10; i++) {
      const hunger = document.createElement('div');
      hunger.style.cssText = `
        width: 16px;
        height: 16px;
        border-radius: 4px 4px 8px 8px;
        background: linear-gradient(180deg, #ffcc6b, #b86d11);
        border: 1px solid #5a2d00;
      `;
      this.hungerIcons.push(hunger);
      hungerContainer.appendChild(hunger);
    }

    const saturationTrack = document.createElement('div');
    saturationTrack.style.cssText = `
      width: 168px;
      height: 7px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.45);
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.1);
    `;
    this.saturationFill = document.createElement('div');
    this.saturationFill.style.cssText = `
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, #ffd66b, #fff4b0);
    `;
    saturationTrack.appendChild(this.saturationFill);

    vitals.appendChild(healthContainer);
    vitals.appendChild(hungerContainer);
    vitals.appendChild(saturationTrack);
    this.container.appendChild(vitals);
  }

  private createHotbar() {
    const hotbarContainer = document.createElement('div');
    hotbarContainer.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 4px;
      padding: 4px;
      background: rgba(0, 0, 0, 0.6);
      border: 2px solid #555;
      border-radius: 4px;
    `;

    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = this.createSlotView(i);
      this.hotbarSlots.push(slot);
      hotbarContainer.appendChild(slot.root);
    }

    this.container.appendChild(hotbarContainer);
    this.setActiveSlot(0);
  }

  private createInventoryOverlay() {
    this.inventoryOverlay = document.createElement('div');
    this.inventoryOverlay.id = 'inventory-overlay';
    this.inventoryOverlay.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 432px;
      min-height: 336px;
      background: #c6c6c6;
      border: 4px solid #fff;
      border-right-color: #555;
      border-bottom-color: #555;
      display: none;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      pointer-events: auto;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      color: #333;
    `;

    const title = document.createElement('div');
    title.innerText = 'Inventaire';
    title.style.cssText = `font-weight: bold;`;
    this.inventoryOverlay.appendChild(title);

    const desc = document.createElement('div');
    desc.innerText = 'Les slots demarrent vides. Ramassez des blocs pour remplir la barre rapide.';
    desc.style.cssText = `font-size: 12px; color: #454545;`;
    this.inventoryOverlay.appendChild(desc);

    const grid = document.createElement('div');
    grid.style.cssText = `display: grid; grid-template-columns: repeat(9, 1fr); gap: 4px;`;
    for (let i = 0; i < 27; i++) {
      const slot = this.createSlotView(i + HOTBAR_SIZE);
      this.inventorySlots.push(slot);
      grid.appendChild(slot.root);
    }

    this.inventoryOverlay.appendChild(grid);
    this.container.appendChild(this.inventoryOverlay);
  }

  private createSlotView(index: number): UISlotView {
    const root = document.createElement('div');
    root.style.cssText = `
      position: relative;
      width: 36px;
      height: 36px;
      background: rgba(255, 255, 255, 0.1);
      border: 2px solid #888;
      box-shadow: inset 0 0 10px rgba(0,0,0,0.45);
      overflow: hidden;
      cursor: pointer;
    `;
    
    root.draggable = true;
    root.addEventListener('dragstart', (e) => this.handleDragStart(e, index));
    root.addEventListener('dragover', (e) => e.preventDefault());
    root.addEventListener('drop', (e) => this.handleDrop(e, index));

    const icon = document.createElement('div');
    icon.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      width: 16px;
      height: 16px;
      transform: translate(-50%, -50%);
      border: 2px solid rgba(0,0,0,0.28);
      box-shadow: inset -2px -2px 0 rgba(0,0,0,0.22), inset 2px 2px 0 rgba(255,255,255,0.2);
      opacity: 0;
      image-rendering: pixelated;
    `;

    const count = document.createElement('span');
    count.style.cssText = `
      position: absolute;
      right: 2px;
      bottom: 1px;
      font-size: 12px;
      font-weight: 700;
      color: #fff;
      text-shadow: 1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000;
      opacity: 0;
    `;

    root.appendChild(icon);
    root.appendChild(count);
    return { root, icon, count };
  }

  private renderSlot(slotView: UISlotView, slot: InventorySlot | undefined) {
    if (!slot || slot.count <= 0 || slot.blockType === BlockType.Air) {
      slotView.icon.style.opacity = '0';
      slotView.count.style.opacity = '0';
      slotView.root.title = 'Vide';
      return;
    }

    slotView.icon.style.opacity = '1';
    slotView.icon.style.background = this.getBlockSurface(slot.blockType);
    slotView.count.style.opacity = '1';
    slotView.count.textContent = String(slot.count);
    slotView.root.title = `${getBlockLabel(slot.blockType)} x${slot.count}`;
  }

  private getBlockSurface(blockType: number): string {
    if (blockType === BlockType.Water) {
      return 'linear-gradient(180deg, rgba(110,180,255,0.95), rgba(45,103,214,0.95))';
    }
    if (blockType === BlockType.Leaves) {
      return 'linear-gradient(135deg, #5a8e38, #356423)';
    }
    return this.blockColors[blockType] || '#ffffff';
  }

  private slotsData: InventorySlot[] | null = null;

  public setInventory(slots: InventorySlot[]) {
    this.slotsData = slots;
    this.refreshInventory();
  }

  private refreshInventory() {
    if (!this.slotsData) return;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      this.renderSlot(this.hotbarSlots[i], this.slotsData[i]);
    }
    for (let i = 0; i < this.inventorySlots.length; i++) {
      this.renderSlot(this.inventorySlots[i], this.slotsData[i + HOTBAR_SIZE]);
    }
  }

  private handleDragStart(e: DragEvent, index: number) {
    if (!this.slotsData || !this.slotsData[index] || this.slotsData[index].count === 0) {
      e.preventDefault();
      return;
    }
    e.dataTransfer?.setData('text/plain', index.toString());
  }

  private handleDrop(e: DragEvent, toIndex: number) {
    e.preventDefault();
    if (!this.slotsData) return;
    const fromIndexStr = e.dataTransfer?.getData('text/plain');
    if (!fromIndexStr) return;
    const fromIndex = parseInt(fromIndexStr, 10);
    if (fromIndex === toIndex) return;

    // Swap logic
    const tempType = this.slotsData[toIndex].blockType;
    const tempCount = this.slotsData[toIndex].count;
    
    // Stack items if same type
    if (tempType === this.slotsData[fromIndex].blockType && tempType !== BlockType.Air) {
      const space = 64 - tempCount;
      const transfer = Math.min(space, this.slotsData[fromIndex].count);
      this.slotsData[toIndex].count += transfer;
      this.slotsData[fromIndex].count -= transfer;
      if (this.slotsData[fromIndex].count === 0) {
        this.slotsData[fromIndex].blockType = BlockType.Air;
      }
    } else {
      this.slotsData[toIndex].blockType = this.slotsData[fromIndex].blockType;
      this.slotsData[toIndex].count = this.slotsData[fromIndex].count;
      this.slotsData[fromIndex].blockType = tempType;
      this.slotsData[fromIndex].count = tempCount;
    }
    this.refreshInventory();
  }

  public setFloatingDrops(items: FloatingDropState[]) {
    const activeIds = new Set(items.map((item) => item.id));

    for (const [id, el] of this.floatingDropEls.entries()) {
      if (!activeIds.has(id)) {
        el.remove();
        this.floatingDropEls.delete(id);
      }
    }

    for (const item of items) {
      let el = this.floatingDropEls.get(item.id);
      if (!el) {
        el = document.createElement('div');
        el.style.cssText = `
          position: absolute;
          width: 30px;
          height: 30px;
          transform: translate(-50%, -50%);
          border-radius: 8px;
          border: 2px solid rgba(255,255,255,0.26);
          box-shadow: 0 8px 18px rgba(0,0,0,0.35);
        `;

        const count = document.createElement('span');
        count.style.cssText = `
          position: absolute;
          right: -4px;
          bottom: -6px;
          font-size: 12px;
          font-weight: 700;
          color: #fff;
          text-shadow: 1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000;
        `;
        el.appendChild(count);
        this.floatingLayer.appendChild(el);
        this.floatingDropEls.set(item.id, el);
      }

      el.style.left = `${item.x}px`;
      el.style.top = `${item.y}px`;
      el.style.scale = `${item.scale}`;
      el.style.background = this.getBlockSurface(item.blockType);
      const countEl = el.firstChild as HTMLSpanElement;
      countEl.textContent = String(item.count);
    }
  }

  public setBreakOverlay(state: BreakOverlayState | null) {
    if (!state) {
      this.breakOverlay.style.opacity = '0';
      this.breakText.style.opacity = '0';
      return;
    }

    const step = Math.max(0, Math.min(9, Math.floor(state.progress * 10)));
    const intensity = 0.15 + step * 0.08;
    this.breakOverlay.style.left = `${state.x}px`;
    this.breakOverlay.style.top = `${state.y}px`;
    this.breakOverlay.style.width = `${state.size}px`;
    this.breakOverlay.style.height = `${state.size}px`;
    this.breakOverlay.style.opacity = String(Math.min(1, 0.18 + state.progress * 0.82));
    this.breakOverlay.style.background = `
      linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.08)),
      linear-gradient(${36 + step * 2}deg, transparent 18%, rgba(255,255,255,${intensity}) 19%, transparent 21%),
      linear-gradient(${-42 - step * 3}deg, transparent 32%, rgba(255,255,255,${intensity * 0.88}) 33%, transparent 36%),
      linear-gradient(90deg, transparent 48%, rgba(255,255,255,${intensity * 1.08}) 50%, transparent 52%),
      linear-gradient(6deg, transparent 62%, rgba(255,255,255,${intensity}) 63%, transparent 66%),
      linear-gradient(-80deg, transparent 70%, rgba(255,255,255,${intensity * 0.76}) 71%, transparent 74%),
      ${this.getBlockSurface(state.blockType)}
    `;
    this.breakText.style.left = `${state.x}px`;
    this.breakText.style.top = `${state.y}px`;
    this.breakText.style.opacity = '1';
    this.breakText.textContent = `Casse ${(state.progress * 100).toFixed(0)}%`;
  }

  public showPickup(label: string, count: number) {
    this.setStatusMessage(`Ramasse: +${count} ${label}`);
  }

  public setHealth(health: number, maxHealth: number) {
    const ratio = Math.max(0, Math.min(1, health / Math.max(1, maxHealth)));
    for (let i = 0; i < this.healthHearts.length; i++) {
      const threshold = (i + 1) / this.healthHearts.length;
      this.healthHearts[i].style.opacity = ratio >= threshold ? '1' : ratio > threshold - 0.1 ? '0.55' : '0.18';
      this.healthHearts[i].style.transform = health <= 4 ? `translateY(${Math.sin(performance.now() * 0.02 + i) * 1.2}px)` : 'translateY(0px)';
    }
  }

  public setHunger(hunger: number, maxHunger: number, saturation: number, maxSaturation: number) {
    const ratio = Math.max(0, Math.min(1, hunger / Math.max(1, maxHunger)));
    for (let i = 0; i < this.hungerIcons.length; i++) {
      const threshold = (i + 1) / this.hungerIcons.length;
      this.hungerIcons[i].style.opacity = ratio >= threshold ? '1' : ratio > threshold - 0.1 ? '0.55' : '0.18';
      this.hungerIcons[i].style.filter = hunger < 4 ? 'saturate(0.75) brightness(0.85)' : 'none';
    }
    const saturationRatio = Math.max(0, Math.min(1, saturation / Math.max(1, maxSaturation)));
    this.saturationFill.style.width = `${saturationRatio * 100}%`;
  }

  public setUnderwater(active: boolean, intensity: number) {
    this.underwaterOverlay.style.opacity = active ? String(Math.min(0.92, 0.18 + intensity * 0.58)) : '0';
  }

  public setDamageFlash(amount: number) {
    this.damageOverlay.style.opacity = String(Math.max(0, Math.min(0.9, amount)));
  }

  public setTimeOfDay(label: string, daylight: number) {
    this.timeChip.textContent = label;
    const glow = Math.round(40 + daylight * 110);
    this.timeChip.style.boxShadow = `0 0 20px rgba(${glow}, ${glow + 20}, 220, 0.18)`;
  }

  public setStatusMessage(message: string) {
    this.statusLabel.textContent = message;
    this.statusLabel.style.opacity = message ? '1' : '0';
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (message) {
      this.hideTimer = window.setTimeout(() => {
        this.statusLabel.style.opacity = '0';
      }, 3200);
    }
  }

  public setActiveSlot(index: number) {
    if (index < 0 || index >= HOTBAR_SIZE) return;
    if (this.hotbarSlots[this.activeSlot]) {
      this.hotbarSlots[this.activeSlot].root.style.borderColor = '#888';
      this.hotbarSlots[this.activeSlot].root.style.borderWidth = '2px';
    }
    this.activeSlot = index;
    if (this.hotbarSlots[this.activeSlot]) {
      this.hotbarSlots[this.activeSlot].root.style.borderColor = '#fff';
      this.hotbarSlots[this.activeSlot].root.style.borderWidth = '3px';
    }
  }

  public getActiveSlotIndex(): number {
    return this.activeSlot;
  }

  public toggleInventory() {
    if (!this.inventoryOverlay) return;

    if (this.inventoryOverlay.style.display === 'none') {
      this.inventoryOverlay.style.display = 'flex';
      document.exitPointerLock();
    } else {
      this.inventoryOverlay.style.display = 'none';
      const canvas = document.getElementById('gpu-canvas');
      if (canvas) canvas.requestPointerLock();
    }
  }
}
