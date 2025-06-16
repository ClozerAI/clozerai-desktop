// Add this utility function after the imports and before the App component
export default function resizeImage(
  dataUrl: string,
  maxWidth: number = 1920,
  maxHeight: number = 1080,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // Calculate new dimensions while maintaining aspect ratio
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const aspectRatio = width / height;

        if (width > height) {
          width = Math.min(width, maxWidth);
          height = width / aspectRatio;
        } else {
          height = Math.min(height, maxHeight);
          width = height * aspectRatio;
        }

        // Ensure we don't exceed either dimension
        if (width > maxWidth) {
          width = maxWidth;
          height = width / aspectRatio;
        }
        if (height > maxHeight) {
          height = maxHeight;
          width = height * aspectRatio;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // Draw the resized image
      ctx.drawImage(img, 0, 0, width, height);

      // Convert back to data URL
      resolve(canvas.toDataURL('image/jpeg', 0.85)); // Use JPEG with 85% quality for better compression
    };
    img.src = dataUrl;
  });
}
