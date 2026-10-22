/* Whether this screen is driven by a finger. Words and target sizes follow. */
export const COARSE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
export const Tap = COARSE ? "Tap" : "Click";
export const tap = COARSE ? "tap" : "click";
