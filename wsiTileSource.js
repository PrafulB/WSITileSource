async function isGeoTIFF(imageSource) {
    let isTiffOrSVS = false
    let srcName = ""
    if (imageSource instanceof File) {
      srcName = imageSource.name
      isTiffOrSVS = srcName.match(/\.(tif|tiff|svs|gtiff)$/i);
    }
    else {
      isTiffOrSVS = imageSource.match(/\.(tif|tiff|svs|gtiff)$/i);
      if (!isTiffOrSVS) {
        // Check Content-Disposition
        // Should make a HEAD request, but GDC returns a 400, so making an aborted GET for now.
        const ac = new AbortController()
        const req = await fetch(imageSource, {
          signal: ac.signal
        })
        ac.abort()
        const filename = req.headers?.get("Content-Disposition")?.split("filename=")[1]
        isTiffOrSVS = filename?.match(/\.(tif|tiff|svs|gtiff)$/i);
      }
    }
    console.log(isTiffOrSVS)
    return isTiffOrSVS
  }

export async function createTileSource(imageSource, numWorkers = undefined, options = {}) {

    if (numWorkers === undefined) {
        numWorkers = navigator.hardwareConcurrency || 1;
    }
    // Check if we should use GeoTIFFTileSource (memory/network efficient for SVS/TIFF)
    if (await isGeoTIFF(imageSource)) {
        const { default: OpenSeadragon } = await import("https://cdn.jsdelivr.net/npm/openseadragon@5.0.1/+esm");
        const { default: attachTileSource } = await import(import.meta.resolve(`./GeoTIFFTileSource.js`));
        attachTileSource(OpenSeadragon)
        if (OpenSeadragon.GeoTIFFTileSource) {
            console.log("Using GeoTIFFTileSource for suspected SVS/TIFF file");
            return OpenSeadragon.GeoTIFFTileSource.getAllTileSources(imageSource, { cache: true, logLatency: true, slideOnly: true, numWorkers });
        }
    }

    // Fallback to OpenSlideTileSource otherwise
    const { default: OpenSlide } = await import(import.meta.resolve(`./openslide-wasm/openslide.js`));
    const { OpenSlideTileSource } = await import(import.meta.resolve(`./OpenSlideTileSource.js`));

    const openSlide = new OpenSlide({ workers: numWorkers });
    await openSlide.initialize();
    const slide = await openSlide.open(imageSource);

    const tileSource = new OpenSlideTileSource(slide, options);
    await tileSource.initialize();

    return tileSource;
}