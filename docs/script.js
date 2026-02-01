// --- Constants for Hex Grid Geometry (Pointy-Top Orientation) ---
// HEX_SIZE: Distance from the center to a corner of the hex.
// This will be dynamically adjusted to fit the screen.
const BASE_HEX_SIZE = 50; // A base size for calculation, will be scaled.
const SQRT3 = Math.sqrt(3);

// Hex class using Cube Coordinates (q + r + s = 0)
class Hex {
    constructor(q, r, s) {
        this.q = q;
        this.r = r;
        this.s = s;
        // Ensure coordinates sum to zero. This is a basic check and might not cover all edge cases perfectly without more complex correction.
        if (Math.round(q + r + s) !== 0) {
            console.warn(`Hex coordinates do not sum to zero: ${q} + ${r} + ${s} = ${q + r + s}. Attempting correction.`);
            // Simple correction: if q, r are given, calculate s.
            if (q !== undefined && r !== undefined) {
                this.s = -q - r;
            } else if (q !== undefined && s !== undefined) {
                this.r = -q - s;
            } else if (r !== undefined && s !== undefined) {
                this.q = -r - s;
            } else {
                // Default to origin if all are undefined or correction is impossible
                this.q = 0; this.r = 0; this.s = 0;
            }
        }
    }

    // Static method to add two hexes
    static add(hexA, hexB) {
        return new Hex(hexA.q + hexB.q, hexA.r + hexB.r, hexA.s + hexB.s);
    }

    // Static method to check if two hexes are equal
    static equals(hexA, hexB) {
        return hexA.q === hexB.q && hexA.r === hexB.r && hexA.s === hexB.s;
    }

    // Method to get axial coordinates (useful for some calculations)
    axial() {
        return { q: this.q, r: this.r };
    }
}

// --- Coordinate Conversion Functions ---
// These functions use the 'layout' object which contains orientation and size.
// For pointy-top orientation:
// x = size * (sqrt(3) * q + sqrt(3)/2 * r)
// y = size * (3/2 * r)
// where q, r are axial coordinates. We'll derive axial from cube internally.

function hex_to_pixel(hex, layout) {
    const M = layout.orientation;
    const size = layout.hex_size;
    const origin = layout.origin;

    const q = hex.q; // Using cube coordinates directly for conversion
    const r = hex.r;

    const pixelX = size.q * (M.f0.x * q + M.f1.x * r) + origin.x;
    const pixelY = size.r * (M.f2.y * q + M.f3.y * r) + origin.y;

    return { x: pixelX, y: pixelY };
}

// Function to round floating point hex coordinates to nearest integer hex
function hex_round(hex) {
    let rx = Math.round(hex.q);
    let ry = Math.round(hex.r);
    let rz = Math.round(hex.s);

    const x_diff = Math.abs(rx - hex.q);
    const y_diff = Math.abs(ry - hex.r);
    const z_diff = Math.abs(rz - hex.s);

    if (x_diff > y_diff && x_diff > z_diff) {
        rx = -ry - rz;
    } else if (y_diff > z_diff) {
        ry = -rx - rz;
    } else {
        rz = -rx - ry;
    }
    return new Hex(rx, ry, rz);
}

// Converts pixel coordinates to hex coordinates
function pixel_to_hex(point, layout) {
    const M = layout.orientation;
    const size = layout.hex_size;
    const origin = layout.origin;

    // Normalize point relative to origin
    const pt = { x: (point.x - origin.x) / size.q,
                 y: (point.y - origin.y) / size.r };

    // Convert to axial coordinates
    const q = M.f0.x * pt.x + M.f1.x * pt.y;
    const r = M.f2.y * pt.x + M.f3.y * pt.y;

    // Round to nearest hex and create a Hex object
    return hex_round(new Hex(q, r, -q - r));
}

// --- PixiJS Setup ---
let app;
let hexContainer;
let gameHexes = []; // Stores Hex objects
let hexGraphicsMap = new Map(); // Maps Hex objects to PIXI.Graphics

let currentHexSize; // The dynamically calculated hex size
let currentScreenCenter; // The center of the screen
let currentMaxRadius; // The maximum radius of hexes to display

// Hexagon drawing function using Pixi Graphics
function drawHex(hex, graphics, options = {}) {
    graphics.clear(); // Clear previous drawing
    graphics.lineStyle(options.lineWidth || 1, options.lineColor || 0x333333);
    graphics.beginFill(options.fillColor || 0xcccccc);

    const pixelPos = hex_to_pixel(hex, {
        orientation: HEX_CONSTANTS.layout.orientation,
        hex_size: { q: currentHexSize, r: currentHexSize },
        origin: currentScreenCenter
    });

    // Calculate corner points for a pointy-top hex
    const hexCorners = [
        { x: currentHexSize * SQRT3, y: 0 },
        { x: currentHexSize * SQRT3 / 2, y: currentHexSize },
        { x: -currentHexSize * SQRT3 / 2, y: currentHexSize },
        { x: -currentHexSize * SQRT3, y: 0 },
        { x: -currentHexSize * SQRT3 / 2, y: -currentHexSize },
        { x: currentHexSize * SQRT3 / 2, y: -currentHexSize }
    ];

    const points = hexCorners.map(corner =>
        new PIXI.Point(pixelPos.x + corner.x, pixelPos.y + corner.y)
    );

    graphics.drawPolygon(points);
    graphics.endFill();

    // Draw coordinates text
    const text = new PIXI.Text(`${hex.q},${hex.r},${hex.s}`, {
        fontSize: 12,
        fill: 0x000000,
        align: 'center'
    });
    text.anchor.set(0.5); // Center the text
    text.x = pixelPos.x;
    text.y = pixelPos.y;
    graphics.addChild(text); // Add text to the graphics object
}

// Function to update the hex grid display based on screen size
function updateGridDisplay() {
    // Clear previous hexes and graphics
    hexContainer.removeChildren();
    hexGraphicsMap.clear();
    gameHexes = []; // Clear hex object list

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    currentScreenCenter = { x: screenWidth / 2, y: screenHeight / 2 };

    // Calculate the maximum radius of hexes that can fit on the screen
    // The height occupied by R rings is roughly (2R+1) * hex_height/2
    // The width occupied is roughly (2R+1) * hex_width*0.75
    // We want to fit the grid such that it fills the screen without excessive padding.
    // Let's estimate by fitting based on hex height and width.
    // A rough estimate for radius R: total height ~ R * (2 * BASE_HEX_SIZE), total width ~ R * (2 * BASE_HEX_SIZE * SQRT3)

    // Calculate the maximum radius that fits within the screen dimensions.
    // Consider the "diameter" of a hex grid of radius R.
    // Pointy-top hex grid:
    // Max width: ~ (2*R + 1) * BASE_HEX_SIZE * SQRT3 / 2 * 2 = (2R+1) * BASE_HEX_SIZE * SQRT3
    // Max height: ~ (2*R + 1) * BASE_HEX_SIZE

    // Let's use height as the primary constraint for scaling.
    // `(2 * R + 1) * H / 2 <= screenHeight / 2` => `(2R+1) * H <= screenHeight`
    // `R <= (screenHeight / H - 1) / 2` where H is related to hex_size.
    // Let's use a simpler approach: find the scale factor for BASE_HEX_SIZE.
    // The dimensions of a hex grid of radius `R` can be approximated.
    // The widest point for a pointy-top hex grid is roughly `(2R+1) * BASE_HEX_SIZE * SQRT3 / 2`.
    // The tallest point is roughly `(2R+1) * BASE_HEX_SIZE`.

    // Let's determine the `currentMaxRadius` that fits on screen.
    // For radius R, the max extent in one direction is roughly R * height_of_hex_column.
    // Height of hex column (center-to-center for pointy top): `HEX_SIZE * 1.5`
    // Width of hex column (center-to-center for pointy top): `HEX_SIZE * SQRT3`
    // Let's use these for fitting.

    // A more direct way: calculate the required size for a given radius to fill the screen.
    // Assume we want to display up to `maxRadius` rings.
    // If we want to show `N` rings (so radius `N-1`), the diameter is roughly `(2*(N-1)+1)` hex units.
    // Let's set a target radius, and then scale the hex size.
    // Aim to display a grid with `maxRadius` rings.
    const targetMaxRadius = 5; // Arbitrary radius to target initially. This will be adjusted.

    // Calculate required hex size to fit `targetMaxRadius` rings within screen dimensions.
    let requiredSizeForWidth = Infinity;
    if (targetMaxRadius > 0) {
        requiredSizeForWidth = (screenWidth / (2 * targetMaxRadius + 1)) / SQRT3;
    } else { // If radius is 0 (only center hex)
        requiredSizeForWidth = screenWidth / 2; // roughly
    }

    let requiredSizeForHeight = Infinity;
    if (targetMaxRadius > 0) {
        requiredSizeForHeight = (screenHeight / (2 * targetMaxRadius + 1)) / 2;
    } else { // If radius is 0
        requiredSizeForHeight = screenHeight / 2;
    }

    // The actual hex size must satisfy both constraints.
    currentHexSize = Math.min(requiredSizeForWidth, requiredSizeForHeight) * 0.9; // Use 90% to add padding.

    // Determine actual max radius that fits with calculated currentHexSize.
    // `currentHexSize = (screenHeight / (2 * R + 1)) / 2` => `R = (screenHeight / currentHexSize / 2 - 1) / 2`
    const R_from_height = (screenHeight / currentHexSize / 2 - 1) / 2;
    const R_from_width = (screenWidth / currentHexSize / SQRT3 - 1) / 2;
    currentMaxRadius = Math.max(0, Math.floor(Math.min(R_from_height, R_from_width))); // Ensure non-negative radius

    // Generate hexes within the calculated radius
    for (let q = -currentMaxRadius; q <= currentMaxRadius; q++) {
        for (let r = Math.max(-currentMaxRadius, -q - currentMaxRadius); r <= Math.min(currentMaxRadius, -q + currentMaxRadius); r++) {
            const s = -q - r;
            const hex = new Hex(q, r, s);
            gameHexes.push(hex);

            // Create PIXI.Graphics for the hex
            const graphics = new PIXI.Graphics();
            drawHex(hex, graphics); // Draw with default style
            hexContainer.addChild(graphics);
            hexGraphicsMap.set(hex, graphics); // Map hex to its graphics object
        }
    }
}

// Variables to track the currently selected hex
let selectedHex = null;
let selectedHexGraphics = null;

// Handle hex click event
function onHexClick(event) {
    const mouseX = event.data.global.x;
    const mouseY = event.data.global.y;
    const clickPoint = { x: mouseX, y: mouseY };

    // Convert click point to hex coordinates using current screen parameters
    const clickedHex = pixel_to_hex(clickPoint, {
        orientation: HEX_CONSTANTS.layout.orientation,
        hex_size: { q: currentHexSize, r: currentHexSize },
        origin: currentScreenCenter
    });

    // Find the actual hex object in our gameHexes list that matches the clickedHex
    let foundHex = null;
    for (const hex of gameHexes) {
        if (Hex.equals(hex, clickedHex)) {
            foundHex = hex;
            break;
        }
    }

    // Remove highlight from previously selected hex
    if (selectedHexGraphics) {
        const prevGraphics = hexGraphicsMap.get(selectedHex);
        if (prevGraphics) {
            drawHex(selectedHex, prevGraphics); // Redraw with default style
        }
        selectedHexGraphics = null;
        selectedHex = null;
    }

    // Apply highlight to the newly clicked hex if it's valid
    if (foundHex) {
        const graphics = hexGraphicsMap.get(foundHex);
        if (graphics) {
            drawHex(foundHex, graphics, {
                fillColor: 0xffffa0, // Highlight color
                lineWidth: 3,
                lineColor: 0xff0000 // Highlight border color
            });
            selectedHex = foundHex;
            selectedHexGraphics = graphics;
        }
    }
}

// Handle window resize event
function onWindowResize() {
    // Resize PixiJS renderer
    app.renderer.resize(window.innerWidth, window.innerHeight);
    // Update screen center
    currentScreenCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    // Redraw the grid with new dimensions
    updateGridDisplay();
}

// --- Initialization ---
function init() {
    // Create PixiJS application
    app = new PIXI.Application({
        view: document.querySelector('canvas'),
        resizeTo: window, // Make canvas automatically resize with window
        autoDensity: true, // For high DPI displays
        backgroundColor: 0x000000 // Black background
    });

    // Create a container for all hex graphics
    hexContainer = new PIXI.Container();
    app.stage.addChild(hexContainer);

    // Set up event listeners
    window.addEventListener('resize', onWindowResize);
    app.view.addEventListener('pointerdown', onHexClick); // Use pointerdown for mouse and touch

    // Initial grid draw
    onWindowResize(); // Trigger initial draw and setup based on window size
}

// --- Global Constants for Layout ---
// These constants will be used by the conversion functions.
// They are defined here but will be used within functions that have access to currentHexSize.
const HEX_CONSTANTS = {
    layout: {
        orientation: {
            start_angle: 0.5, // 30 degrees in turns
            f0: { x: SQRT3, y: SQRT3/2 }, f1: { x: SQRT3/2, y: SQRT3/2 },
            f2: { x: 0, y: SQRT3 }, f3: { x: -SQRT3/2, y: SQRT3/2 },
            f4: { x: -SQRT3, y: 0 }, f5: { x: -SQRT3/2, y: -SQRT3/2 }
        },
        // hex_size: { q: BASE_HEX_SIZE, r: BASE_HEX_SIZE }, // This will be currentHexSize
        // origin: { x: 0, y: 0 } // This will be currentScreenCenter
    }
};


// --- Start the application ---
// Wait for the DOM to be fully loaded before initializing
window.addEventListener('load', () => {
    init();
});
