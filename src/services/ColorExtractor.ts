/**
 * Picks a lively colour from a cover so the glow behind the vinyl follows
 * the song. If the image cannot be read (some hosts block it) it returns
 * null and the default accent is used instead.
 */
export class ColorExtractor {
  private readonly cache = new Map<string, string | null>();

  async dominant(url: string): Promise<string | null> {
    if (!url) return null;
    if (this.cache.has(url)) return this.cache.get(url) ?? null;
    let color: string | null = null;
    try {
      color = await this.sample(url);
    } catch {
      color = null;
    }
    this.cache.set(url, color);
    return color;
  }

  private sample(url: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          resolve(null);
          return;
        }
        context.drawImage(image, 0, 0, size, size);
        try {
          resolve(this.pickVivid(context.getImageData(0, 0, size, size).data));
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(new Error('cover not readable'));
      image.src = url;
    });
  }

  /** Averages the most saturated pixels and nudges the result to a usable brightness. */
  private pickVivid(data: Uint8ClampedArray): string | null {
    let red = 0;
    let green = 0;
    let blue = 0;
    let weightSum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const brightness = max / 255;
      const weight = saturation * saturation * (brightness > 0.2 ? 1 : 0.1);
      red += r * weight;
      green += g * weight;
      blue += b * weight;
      weightSum += weight;
    }
    if (weightSum < 0.5) return null;
    const lift = (value: number): number => Math.min(255, Math.round((value / weightSum) * 1.15 + 20));
    return `rgb(${lift(red)}, ${lift(green)}, ${lift(blue)})`;
  }
}
