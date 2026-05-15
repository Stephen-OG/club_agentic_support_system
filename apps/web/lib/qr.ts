import QRCode from "qrcode";

export async function generateQrCodeDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    margin: 1,
    scale: 10,
    color: {
      dark: "#14211f",
      light: "#ffffff"
    }
  });
}
