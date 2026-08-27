"use strict";

const DEFAULT_ICON_NAME = "NSApplicationIcon";
const DEFAULT_ICON_SIZE = 1024;

function composeDockIcon(
  nativeImage,
  baseImage,
  overlayImage,
  size = DEFAULT_ICON_SIZE,
) {
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new TypeError("Dock icon size must be a positive integer");
  }
  const dimensions = { width: size, height: size };
  const base = baseImage.resize(dimensions);
  const overlay = overlayImage.resize(dimensions);
  const originalBasePixels = base.toBitmap();
  const overlayPixels = overlay.toBitmap();
  if (
    originalBasePixels.length !== size * size * 4 ||
    overlayPixels.length !== originalBasePixels.length
  ) {
    throw new Error("Dock icon bitmap has an unexpected size");
  }
  const composedPixels = Buffer.from(originalBasePixels);

  for (let offset = 0; offset < composedPixels.length; offset += 4) {
    const baseAlpha = originalBasePixels[offset + 3] / 255;
    const overlayAlpha = overlayPixels[offset + 3] / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      composedPixels[offset + channel] = Math.round(
        overlayPixels[offset + channel] * baseAlpha +
          originalBasePixels[offset + channel] * (1 - overlayAlpha),
      );
    }
    composedPixels[offset + 3] = originalBasePixels[offset + 3];
  }

  return nativeImage.createFromBitmap(composedPixels, dimensions);
}

function installDockIconOverlay({
  app,
  nativeImage,
  overlayFile,
  size = DEFAULT_ICON_SIZE,
  log = () => {},
}) {
  if (!app?.dock || typeof app.dock.setIcon !== "function") return false;
  if (!overlayFile) throw new Error("Dock icon overlay file is required");

  const overlay = nativeImage.createFromPath(overlayFile);
  if (!overlay || overlay.isEmpty()) {
    throw new Error(`Dock icon overlay is unreadable: ${overlayFile}`);
  }
  const defaultIcon = nativeImage.createFromNamedImage(DEFAULT_ICON_NAME);
  if (!defaultIcon || defaultIcon.isEmpty()) {
    throw new Error("The application Dock icon is unavailable");
  }

  const dock = app.dock;
  const setIcon = dock.setIcon.bind(dock);
  dock.setIcon = (icon) => {
    try {
      const base = icon == null || icon.isEmpty() ? defaultIcon : icon;
      const composed = composeDockIcon(
        nativeImage,
        base,
        overlay,
        size,
      );
      log("dock-icon-overlay-applied", {
        baseSize: base.getSize(),
        overlaySize: overlay.getSize(),
      });
      return setIcon(composed);
    } catch (error) {
      log("dock-icon-overlay-failed", { error: String(error) });
      return setIcon(icon);
    }
  };

  log("dock-icon-overlay-installed", { file: overlayFile, size });
  return true;
}

module.exports = {
  composeDockIcon,
  installDockIconOverlay,
};
