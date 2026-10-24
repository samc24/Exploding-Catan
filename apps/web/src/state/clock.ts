/* The clock every window is judged by: the server's when online, else this
   machine's. Online play installs its source; nothing below the app layer
   needs to know which it is. */
let source: (() => number) | null = null;
export function clock(): number { return source ? source() : Date.now(); }
export function setClockSource(fn: (() => number) | null): void { source = fn; }
