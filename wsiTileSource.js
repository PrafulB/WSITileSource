function isGeoTIFF(source) {
    let filename = '';
    if (source instanceof File) {
        filename = source.name;
    } else if (source instanceof URL) {
        filename = source.pathname;
    } else if (typeof source === 'string') {
        filename = source;
    }

    return /\.(svs|tif|tiff)$/i.test(filename);
}

export async function createTileSource(imageSource, numWorkers = undefined, options = {}) {

    if (numWorkers === undefined) {
        numWorkers = navigator.hardwareConcurrency || 4;
    }
    // Check if we should use GeoTIFFTileSource (memory efficient for SVS/TIFF)
    if (isGeoTIFF(imageSource)) {
        const { default: OpenSeadragon } = await import("https://esm.sh/openseadragon");
        const { default: attachTileSource } = await import(import.meta.resolve(`./GeoTIFFTileSource.js`));
        attachTileSource(OpenSeadragon)
        if (OpenSeadragon.GeoTIFFTileSource) {
            console.log("Using GeoTIFFTileSource for suspected SVS/TIFF file");
            return OpenSeadragon.GeoTIFFTileSource.getAllTileSources(imageSource, { cache: false, logLatency: true, slideOnly: true });
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