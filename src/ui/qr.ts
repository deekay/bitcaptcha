import QrCreator from "qr-creator";

export function renderQrCode(
  container: HTMLElement,
  invoice: string,
  size: number = 200,
): void {
  // Clear any existing QR code
  container.innerHTML = "";

  const canvas = document.createElement("canvas");
  container.appendChild(canvas);

  QrCreator.render(
    {
      text: `bitcoin:?lightning=${invoice}`,
      radius: 0.4,
      ecLevel: "L",
      fill: "#000000",
      background: "#ffffff",
      size,
    },
    canvas,
  );
}
