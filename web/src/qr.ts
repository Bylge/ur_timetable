// QR codes for the share sheet. The generator (the qrcode package, MIT) is loaded only when the sheet is
// opened: the plan itself never needs it. Dark on white with a quiet zone in both themes, as scanners expect.

const OPTIONS = { errorCorrectionLevel: "M", margin: 2, color: { dark: "#15181dff", light: "#ffffffff" } } as const;
const svgs = new Map<string, string>();

/** The QR code for a link if it's ready, else null (then call qrSvg and redraw). */
export function cachedQr(text: string): string | null {
  return svgs.get(text) ?? null;
}

export async function qrSvg(text: string): Promise<string> {
  const QR = await import("qrcode");
  const svg = await QR.toString(text, { ...OPTIONS, type: "svg" });
  svgs.set(text, svg);
  return svg;
}

/** A large PNG (data: URL) to download, e.g. for printing. */
export async function qrPng(text: string): Promise<string> {
  const QR = await import("qrcode");
  return QR.toDataURL(text, { ...OPTIONS, width: 1024 });
}
