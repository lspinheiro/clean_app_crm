import imageCompression, { type Options } from "browser-image-compression";

export const COMPANY_LOGO_MAX_BYTES = 400_000;
const allowedInputTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export const companyLogoCompressionOptions = {
  maxSizeMB: 0.35,
  maxWidthOrHeight: 512,
  useWebWorker: true,
  fileType: "image/webp",
  initialQuality: 0.82,
} satisfies Options;

type Compressor = (file: File, options: Options) => Promise<File>;

export async function compressCompanyLogo(
  source: File,
  compress: Compressor = imageCompression,
): Promise<File> {
  if (!allowedInputTypes.has(source.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }

  let output = await compress(source, companyLogoCompressionOptions);
  if (output.type !== "image/webp") {
    const [, canvas] = await imageCompression.drawFileInCanvas(output);
    output = await imageCompression.canvasToFile(
      canvas,
      "image/webp",
      "logo.webp",
      source.lastModified,
      0.82,
    );
  }

  if (output.type !== "image/webp" || output.size > COMPANY_LOGO_MAX_BYTES) {
    throw new Error("We could not compress that logo below 400 KB.");
  }

  return new File([output], "logo.webp", {
    type: "image/webp",
    lastModified: source.lastModified,
  });
}
