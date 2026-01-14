export class OpenSlideTileSource extends OpenSeadragon.TileSource {
    constructor(slide, options = {}) {
        // Don't call super yet - we need to set up levels first
        const config = {
            tileSize: options.tileSize || 256,
            tileOverlap: options.tileOverlap || 0
        };

        super(config);

        this.slide = slide;
        this._opsOptions = options;
        this._ready = false;

        // Detect WebP support once
        this._supportsWebP = this._detectWebPSupport();
    }

    _detectWebPSupport() {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    }

    /**
     * Initialize levels - call this after construction with async data
     */
    async initialize() {
        const levelCount = await this.slide.getLevelCount();
        const [fullWidth, fullHeight] = await this.slide.getLevelDimensions(0);

        let nativeTileWidth = 256;
        let nativeTileHeight = 256;

        try {
            const propNames = await this.slide.getPropertyNames();

            const getProp = async (name) => {
                if (propNames.includes(name)) {
                    return await this.slide.getPropertyValue(name);
                }
                return null;
            };

            const w = await getProp('openslide.level[0].tile-width');
            const h = await getProp('openslide.level[0].tile-height');

            if (w) nativeTileWidth = parseInt(w);
            if (h) nativeTileHeight = parseInt(h);

            console.log(`Native tile size detected: ${nativeTileWidth}x${nativeTileHeight}`);
        } catch (e) {
            console.warn('Could not read native tile size, using default 256x256', e);
        }

        // Use native tile size unless explicitly overridden
        this.tileSize = this._opsOptions.tileSize || Math.min(nativeTileWidth, nativeTileHeight);

        // Log OpenSlide levels for debugging
        console.log("OpenSlide pyramid structure:");
        for (let i = 0; i < levelCount; i++) {
            const [w, h] = await this.slide.getLevelDimensions(i);
            console.log(`  OpenSlide Level ${i}: ${w}x${h} (downsample: ${fullWidth / w})`);
        }

        this.width = fullWidth;
        this.height = fullHeight;
        this.tileOverlap = this._opsOptions.tileOverlap || 0;
        this.dimensions = new OpenSeadragon.Point(fullWidth, fullHeight);
        this.aspectRatio = fullWidth / fullHeight;
        this.minLevel = 0;

        // Build levels array similar to GeoTIFFTileSource
        const openSlideLevels = [];
        for (let i = 0; i < levelCount; i++) {
            const [levelWidth, levelHeight] = await this.slide.getLevelDimensions(i);
            const downsample = fullWidth / levelWidth;

            openSlideLevels.push({
                width: levelWidth,
                height: levelHeight,
                openSlideLevel: i,
                downsample: downsample
            });
        }

        // Check if we need synthetic levels (like GeoTIFFTileSource does)
        const hasPyramid = this._checkValidPyramid(openSlideLevels);

        if (hasPyramid) {
            // Use OpenSlide levels directly
            this.levels = openSlideLevels.map(level => ({
                ...level,
                tileWidth: this.tileSize,
                tileHeight: this.tileSize,
                scalefactor: 1 / level.downsample
            }));
        } else {
            // Create synthetic levels for files with sparse pyramids
            const numPowersOfTwo = Math.ceil(Math.log2(Math.max(
                fullWidth / this.tileSize,
                fullHeight / this.tileSize
            )));
            const levelsToUse = [...Array(numPowersOfTwo).keys()].filter(v => v % 2 == 0);

            this.levels = levelsToUse.map(levelnum => {
                const scale = Math.pow(2, levelnum);
                const targetWidth = fullWidth / scale;

                // Find smallest OpenSlide level with sufficient resolution
                const openSlideLevel = openSlideLevels
                    .filter(l => l.width * (l.width / targetWidth) >= fullWidth)
                    .slice(-1)[0] || openSlideLevels[openSlideLevels.length - 1];

                return {
                    width: targetWidth,
                    height: fullHeight / scale,
                    tileWidth: this.tileSize,
                    tileHeight: this.tileSize,
                    openSlideLevel: openSlideLevel.openSlideLevel,
                    downsample: scale * openSlideLevel.width / fullWidth,
                    scalefactor: 1 / (scale * openSlideLevel.width / fullWidth)
                };
            });
        }

        // Sort by width (smallest to largest) to match OSD convention
        this.levels.sort((a, b) => a.width - b.width);
        this.maxLevel = this.levels.length - 1;

        console.log("OSD levels created:");
        this.levels.forEach((level, i) => {
            console.log(`  OSD Level ${i}: ${level.width.toFixed(0)}x${level.height.toFixed(0)} -> OpenSlide Level ${level.openSlideLevel}`);
        });

        this._tileWidth = this.tileSize;
        this._tileHeight = this.tileSize;
        this._ready = true;

        // Cache for tiles to avoid redundant reads
        this._tileCache = new Map();
        this._maxCacheSize = this._opsOptions.cacheSize || 100;

        return this;
    }

    _checkValidPyramid(levels) {
        // Check if levels form a valid monotonic pyramid
        for (let i = 1; i < levels.length; i++) {
            if (levels[i].width >= levels[i - 1].width) {
                return false;
            }
        }
        return true;
    }

    /**
     * Return the tileWidth for a given level.
     */
    getTileWidth(level) {
        if (this.levels && this.levels.length > level) {
            return this.levels[level].tileWidth;
        }
        return this.tileSize;
    }

    /**
     * Return the tileHeight for a given level.
     */
    getTileHeight(level) {
        if (this.levels && this.levels.length > level) {
            return this.levels[level].tileHeight;
        }
        return this.tileSize;
    }

    getLevelScale(level) {
        if (this.levels && this.levels.length > 0 && level >= this.minLevel && level <= this.maxLevel) {
            return this.levels[level].width / this.levels[this.maxLevel].width;
        }
        return NaN;
    }

    /**
     * OpenSeadragon calls this to get a URL identifier for caching
     */
    getTileUrl(level, x, y) {
        return `${level}/${x}/${y}`;
    }

    /**
     * The core logic: Fetch data from WASM and pass to OSD.
     */
    async downloadTileStart(context) {
        const { src } = context;
        const [level, x, y] = src.split('/').map(Number);

        if (!this.levels || level >= this.levels.length) {
            context.finish(null, src, 'Invalid level');
            return;
        }

        const levelInfo = this.levels[level];
        const openSlideLevel = levelInfo.openSlideLevel;
        const tileSize = this.tileSize;

        // Check cache first
        const cacheKey = `${openSlideLevel}_${x}_${y}`;
        if (this._tileCache.has(cacheKey)) {
            const cachedImage = this._tileCache.get(cacheKey);
            context.finish(cachedImage.cloneNode());
            return;
        }

        try {
            // Calculate tile bounds at this OSD level
            const tileX = x * tileSize;
            const tileY = y * tileSize;
            let tileWidth = tileSize;
            let tileHeight = tileSize;

            // Clip to level bounds
            if (tileX + tileWidth > levelInfo.width) {
                tileWidth = levelInfo.width - tileX;
            }
            if (tileY + tileHeight > levelInfo.height) {
                tileHeight = levelInfo.height - tileY;
            }

            // Convert to Level 0 (full resolution) coordinates
            const downsample = levelInfo.downsample;
            const l0_x = Math.floor(tileX * downsample);
            const l0_y = Math.floor(tileY * downsample);

            const readWidth = Math.ceil(tileWidth);
            const readHeight = Math.ceil(tileHeight);

            const controller = new AbortController();
            context.userData = { controller };

            const pixelBuffer = await this.slide.readRegion(
                l0_x,
                l0_y,
                openSlideLevel,
                readWidth,
                readHeight,
                { signal: controller.signal }
            );

            const canvas = document.createElement("canvas");
            canvas.width = readWidth;
            canvas.height = readHeight;
            const ctx = canvas.getContext('2d', { alpha: false });
            ctx.putImageData(new ImageData(pixelBuffer, readWidth, readHeight), 0, 0);

            const format = this._supportsWebP ? 'image/webp' : 'image/jpeg';
            const quality = 0.9;
            const dataURL = canvas.toDataURL(format, quality);

            const image = new Image();
            image.onload = () => {
                if (this._tileCache.size >= this._maxCacheSize) {
                    const firstKey = this._tileCache.keys().next().value;
                    this._tileCache.delete(firstKey);
                }
                this._tileCache.set(cacheKey, image);
                context.finish(image);
            };
            image.onerror = image.onabort = () => {
                context.finish(null, src, 'Image load failed');
            };
            image.src = dataURL;

        } catch (error) {
            if (error.name === 'AbortError') {
                // Ignore aborted request
            } else {
                console.error("Error reading tile:", error);
                context.finish(null, src, error.message);
            }
        }
    }

    downloadTileAbort(context) {
        if (context.userData && context.userData.controller) {
            context.userData.controller.abort();
        }
    }
}

Object.defineProperty(OpenSlideTileSource.prototype, "ready", {
    set: function ready(r) {
    },
    get: function ready() {
        return this._ready;
    }
});