// Presentation and native integration are separate: the same HTML table works
// in ordinary browsers without a preload script or Electron APIs.
export const hasDesktopBridge=()=>!!globalThis.window?.worldOrderDesktop;
export const usesGameLayout=()=>typeof globalThis.document!=='undefined'||hasDesktopBridge();
