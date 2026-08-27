"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  composeDockIcon,
  installDockIconOverlay,
} = require("./dock-icon-overlay.cjs");

function image(pixels, size = { width: 1, height: 1 }) {
  return {
    getSize: () => size,
    isEmpty: () => false,
    resize: () => image(pixels, size),
    toBitmap: () => Buffer.from(pixels),
  };
}

test("composeDockIcon applies the overlay inside the base alpha", () => {
  const base = image([100, 120, 140, 128]);
  const overlay = image([40, 20, 10, 64]);
  let result;
  const nativeImage = {
    createFromBitmap(pixels, options) {
      result = { pixels: [...pixels], options };
      return result;
    },
  };

  const composed = composeDockIcon(nativeImage, base, overlay, 1);

  assert.equal(composed, result);
  assert.deepEqual(result, {
    pixels: [95, 100, 110, 128],
    options: { width: 1, height: 1 },
  });
});

test("installDockIconOverlay wraps default and supplied Dock icons", () => {
  const defaultIcon = image([100, 100, 100, 255]);
  const suppliedIcon = image([80, 80, 80, 255]);
  const overlay = image([20, 20, 20, 128]);
  const applied = [];
  const logs = [];
  const app = {
    dock: {
      setIcon(icon) {
        applied.push(icon);
      },
    },
  };
  const nativeImage = {
    createFromBitmap(pixels, options) {
      return image(pixels, options);
    },
    createFromNamedImage(name) {
      assert.equal(name, "NSApplicationIcon");
      return defaultIcon;
    },
    createFromPath(file) {
      assert.equal(file, "/ChatGPTX.app/Contents/Resources/overlay.png");
      return overlay;
    },
  };

  const installed = installDockIconOverlay({
    app,
    nativeImage,
    overlayFile: "/ChatGPTX.app/Contents/Resources/overlay.png",
    size: 1,
    log: (event, data) => logs.push({ event, data }),
  });
  app.dock.setIcon(null);
  app.dock.setIcon(suppliedIcon);

  assert.equal(installed, true);
  assert.equal(applied.length, 2);
  assert.deepEqual([...applied[0].toBitmap()], [70, 70, 70, 255]);
  assert.deepEqual([...applied[1].toBitmap()], [60, 60, 60, 255]);
  assert.deepEqual(
    logs.map(({ event }) => event),
    [
      "dock-icon-overlay-installed",
      "dock-icon-overlay-applied",
      "dock-icon-overlay-applied",
    ],
  );
});

test("installDockIconOverlay keeps the stock icon when composition fails", () => {
  const suppliedIcon = { isEmpty: () => false };
  const applied = [];
  const logs = [];
  const app = {
    dock: {
      setIcon(icon) {
        applied.push(icon);
      },
    },
  };
  const nativeImage = {
    createFromNamedImage: () => image([0, 0, 0, 255]),
    createFromPath: () => image([0, 0, 0, 255]),
  };

  installDockIconOverlay({
    app,
    nativeImage,
    overlayFile: "/overlay.png",
    log: (event, data) => logs.push({ event, data }),
  });
  app.dock.setIcon(suppliedIcon);

  assert.deepEqual(applied, [suppliedIcon]);
  assert.equal(logs.at(-1).event, "dock-icon-overlay-failed");
});
