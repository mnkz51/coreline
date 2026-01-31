// script.js

// --- Configuration ---
const HEX_SIZE = 50; // Radius of the hex (distance from center to corner for pointy top, or half-width for flat top)
const HEX_ORIENTATION = 'flat-top'; // 'flat-top' or 'pointy-top'
const HIGHLIGHT_COLOR = 0xFFFF00;
const HEX_LINE_COLOR = 0x666666;
const HEX_FILL_COLOR = 0x333333;
const TEXT_COLOR = 0xFFFFFF;

// --- Hex Class (Logic) ---
class Hex {
    constructor(q, r, s) {
        if (q + r + s !== 0) {
            throw new Error(`Hex coordinates must sum to 0: q(${q}) + r(${r}) + s(${s}) = ${q + r + s}`);
        }
        this.q = q;
        this.r = r;
        this.s = s;
        this.id = `${q},${r},${s}`; // Unique identifier for the hex
    }

    // Convert cube to axial (q, r)
    toAxial() {
        return { q: this.q, r: this.r };
    }

    // Get the pixel coordinates of the hex center
    // orientation: 'flat-top' or 'pointy-top'
    // size: radius of the hex
    // origin: { x, y } of the grid's (0,0) hex
    toPixel(orientation, size, origin) {
        let x, y;
        if (orientation === 'flat-top') {
            x = size * (3 / 2 * this.q);
            y = size * (Math.sqrt(3) / 2 * this.q + Math.sqrt(3) * this.r);
        } else { // pointy-top
            x = size * (Math.sqrt(3) * this.q + Math.sqrt(3) / 2 * this.r);
            y = size * (3 / 2 * this.r);
        }
        return { x: x + origin.x, y: y + origin.y };
    }

    // Get the vertices for drawing a hex polygon
    // orientation: 'flat-top' or 'pointy-top'
    // size: radius of the hex
    getVertices(orientation, size) {
        const vertices = [];
        for (let i = 0; i < 6; i++) {
            const angle_deg = orientation === 'flat-top' ? 60 * i : 60 * i + 30;
            const angle_rad = Math.PI / 180 * angle_deg;
            vertices.push({
                x: size * Math.cos(angle_rad),
                y: size * Math.sin(angle_rad)
            });
        }
        return vertices;
    }
}

// --- HexGrid Class (Logic) ---
class HexGrid {
    constructor(hexSize, hexOrientation) {
        this.hexSize = hexSize;
        this.hexOrientation = hexOrientation;
        this.hexes = new Map(); // Stores Hex objects by their ID
        this.gridCenter = { x: 0, y: 0 }; // Will be set during grid generation
    }

    // Generates a rectangular grid of hexes to fill a given screen area
    generateGrid(width, height) {
        this.hexes.clear();
        let qMin, qMax, rMin, rMax;

        if (this.hexOrientation === 'flat-top') {
            // Approximate number of hexes needed to fill width and height
            const hexWidth = this.hexSize * 2;
            const hexHeight = this.hexSize * Math.sqrt(3);

            qMax = Math.ceil(width / (this.hexSize * 1.5)) + 1;
            rMax = Math.ceil(height / hexHeight) + 1;
            qMin = -qMax;
            rMin = -rMax;

            // Adjust grid center to visually center the grid
            this.gridCenter.x = width / 2;
            this.gridCenter.y = height / 2;

            for (let q = qMin; q <= qMax; q++) {
                for (let r = rMin; r <= rMax; r++) {
                    const s = -q - r;
                    const hex = new Hex(q, r, s);
                    const pixel = hex.toPixel(this.hexOrientation, this.hexSize, this.gridCenter);

                    // Only add hexes that are roughly within the screen bounds
                    if (pixel.x > -this.hexSize * 2 && pixel.x < width + this.hexSize * 2 &&
                        pixel.y > -this.hexSize * 2 && pixel.y < height + this.hexSize * 2) {
                        this.hexes.set(hex.id, hex);
                    }
                }
            }
        } else { // pointy-top
            const hexWidth = this.hexSize * Math.sqrt(3);
            const hexHeight = this.hexSize * 2;

            qMax = Math.ceil(width / hexWidth) + 1;
            rMax = Math.ceil(height / (this.hexSize * 1.5)) + 1;
            qMin = -qMax;
            rMin = -rMax;

            // Adjust grid center to visually center the grid
            this.gridCenter.x = width / 2;
            this.gridCenter.y = height / 2;

            for (let q = qMin; q <= qMax; q++) {
                for (let r = rMin; r <= rMax; r++) {
                    const s = -q - r;
                    const hex = new Hex(q, r, s);
                    const pixel = hex.toPixel(this.hexOrientation, this.hexSize, this.gridCenter);

                    // Only add hexes that are roughly within the screen bounds
                    if (pixel.x > -this.hexSize * 2 && pixel.x < width + this.hexSize * 2 &&
                        pixel.y > -this.hexSize * 2 && pixel.y < height + this.hexSize * 2) {
                        this.hexes.set(hex.id, hex);
                    }
                }
            }
        }
    }

    getHexes() {
        return Array.from(this.hexes.values());
    }
}

// --- Game Renderer (Rendering) ---
class GameRenderer {
    constructor(app, hexGrid) {
        this.app = app;
        this.hexGrid = hexGrid;
        this.hexGraphicsContainer = new PIXI.Container();
        this.app.stage.addChild(this.hexGraphicsContainer);
        this.highlightGraphic = null;
        this.selectedHexId = null;

        this.drawGrid();
        this.setupEventListeners();
    }

    drawGrid() {
        this.hexGraphicsContainer.removeChildren(); // Clear existing hexes
        this.highlightGraphic = null; // Reset highlight

        const hexes = this.hexGrid.getHexes();
        for (const hex of hexes) {
            const pixel = hex.toPixel(this.hexGrid.hexOrientation, this.hexGrid.hexSize, this.hexGrid.gridCenter);
            const hexGraphic = this.createHexGraphic(hex, pixel);
            this.hexGraphicsContainer.addChild(hexGraphic);
        }
        if (this.selectedHexId) {
             const selectedHex = this.hexGrid.hexes.get(this.selectedHexId);
             if (selectedHex) {
                 this.drawHighlight(selectedHex);
             } else {
                 this.selectedHexId = null; // Hex no longer exists, clear selection
             }
        }
    }

    createHexGraphic(hex, pixel) {
        const graphics = new PIXI.Graphics();
        graphics.lineStyle(2, HEX_LINE_COLOR, 1);
        graphics.beginFill(HEX_FILL_COLOR, 1);

        const vertices = hex.getVertices(this.hexGrid.hexOrientation, this.hexGrid.hexSize);
        graphics.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            graphics.lineTo(vertices[i].x, vertices[i].y);
        }
        graphics.closePath();
        graphics.endFill();

        graphics.position.set(pixel.x, pixel.y);
        graphics.interactive = true;
        graphics.buttonMode = true;
        graphics.hex = hex; // Attach hex data to the graphic for easy access

        // Debug text
        const text = new PIXI.Text(`(${hex.q},${hex.r},${hex.s})`, {
            fontFamily: 'Arial',
            fontSize: 12,
            fill: TEXT_COLOR,
            align: 'center',
        });
        text.anchor.set(0.5);
        graphics.addChild(text);

        return graphics;
    }

    drawHighlight(hex) {
        if (this.highlightGraphic) {
            this.hexGraphicsContainer.removeChild(this.highlightGraphic);
            this.highlightGraphic.destroy();
        }

        const pixel = hex.toPixel(this.hexGrid.hexOrientation, this.hexGrid.hexSize, this.hexGrid.gridCenter);
        this.highlightGraphic = new PIXI.Graphics();
        this.highlightGraphic.lineStyle(4, HIGHLIGHT_COLOR, 1);
        
        const vertices = hex.getVertices(this.hexGrid.hexOrientation, this.hexGrid.hexSize);
        this.highlightGraphic.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            this.highlightGraphic.lineTo(vertices[i].x, vertices[i].y);
        }
        this.highlightGraphic.closePath();
        
        this.highlightGraphic.position.set(pixel.x, pixel.y);
        this.hexGraphicsContainer.addChild(this.highlightGraphic);
        this.selectedHexId = hex.id;
    }

    onHexClick(event) {
        const hex = event.currentTarget.hex;
        if (hex) {
            console.log('Hex clicked:', hex.id);
            this.drawHighlight(hex);
        }
    }

    setupEventListeners() {
        this.hexGraphicsContainer.on('pointerdown', this.onHexClick, this);
    }

    resize() {
        this.app.renderer.resize(window.innerWidth, window.innerHeight);
        this.hexGrid.generateGrid(window.innerWidth, window.innerHeight);
        this.drawGrid();
    }
}

// --- Main Application Entry Point ---
window.onload = () => {
    // 1. Setup PIXI.Application
    const app = new PIXI.Application({
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0x000000,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
    });
    document.body.appendChild(app.view);

    // 2. Setup HexGrid (Logic)
    const hexGrid = new HexGrid(HEX_SIZE, HEX_ORIENTATION);
    hexGrid.generateGrid(app.screen.width, app.screen.height);

    // 3. Setup GameRenderer (Rendering)
    const gameRenderer = new GameRenderer(app, hexGrid);

    // 4. Handle Window Resize
    window.addEventListener('resize', () => gameRenderer.resize());

    console.log('Core-Line game started!');
};