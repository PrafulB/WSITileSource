import { WorkerCommandBase, WorkerResponse, OpenSlideT, FileEntry } from "./types";
export interface ReadRegionOptions {
    signal?: AbortSignal;
}
interface CommandOptions {
    signal?: AbortSignal;
}
declare class OpenSlideWorker {
    id: string;
    private worker;
    private promiseFns;
    constructor();
    numTasks(): number;
    sendCommand(command: WorkerCommandBase, opts?: CommandOptions): Promise<WorkerResponse>;
}
export interface OpenSlideOptions {
    workers?: number;
}
export default class OpenSlide {
    private workers;
    /**
     * Creates an instance of OpenSlide with a specified number of workers.
     *
     * @param {OpenSlideOptions} options - Options for OpenSlide.
     * @param {number} options.workers - The number of workers to create (default: 1).
     * @returns {OpenSlide} An instance of OpenSlide.
     * @throws {Error} If the number of workers is less than 1.
     */
    constructor(options?: OpenSlideOptions);
    initialize(): Promise<void>;
    /**
     * Open a WSI with OpenSlide.
     * In the case of multi-file formats like DICOM, MIRAX, and Hamamatsu-VMS, use the `FileEntry[]` array
     * where each entry contains a `File` and its corresponding path.
     * The _first_ file in the array will be used to open the slide.
     *
     * @param file A File, File array, FileEntry array, URL, or string representing the file path or URL to open.
     * @param downloadToLocal Whether to download the file to local storage (only applicable for URLs).
     * @returns A promise that resolves to an OpenSlideImage instance.
     */
    open(file: File | File[] | FileEntry[] | URL | string, downloadToLocal?: boolean): Promise<OpenSlideImage>;
}
interface OpenSlideHandle {
    osr: OpenSlideT;
    worker: OpenSlideWorker;
}
declare class OpenSlideImage {
    private handles;
    constructor(handles: OpenSlideHandle[]);
    /**
     * Close the OpenSlide image.
     * @returns A promise that resolves when the image is closed.
     */
    close(): Promise<void>;
    private getHandle;
    /**
     * Get the names of all properties in the image.
     * @returns An array of property names.
     */
    getPropertyNames(): Promise<string[]>;
    /**
     * Get the value of a property by name.
     * @param name - The name of the property.
     * @returns The value of the property, or null if not found.
     */
    getPropertyValue(name: string): Promise<string | null>;
    /**
     * Get the number of levels in the image.
     * @returns The number of levels in the image.
     */
    getLevelCount(): Promise<number>;
    /**
     * Get the dimensions of a given level.
     * @param level - The level of the image.
     * @returns The dimensions of the specified level as a tuple [width, height].
     */
    getLevelDimensions(level: number): Promise<[number, number]>;
    /**
     * Get the downsample factor for a given level.
     * @param level - The level of the image.
     * @returns The downsample factor for the specified level.
     */
    getLevelDownsample(level: number): Promise<number>;
    /**
     * Get the best level for a given downsample factor.
     * @param downsample - The desired downsample factor.
     * @returns The best level for the specified downsample factor.
     */
    getBestLevelForDownsample(downsample: number): Promise<number>;
    /**
     * Read a region of the image at the specified level and dimensions.
     * @param x - The x coordinate of the top-left corner of the region.
     * @param y - The y coordinate of the top-left corner of the region.
     * @param level - The level of the image to read from.
     * @param width - The width of the region to read.
     * @param height - The height of the region to read.
     * @returns A promise that resolves to a Uint8ClampedArray containing the pixel data in RGBA format.
     */
    readRegion(x: number, y: number, level: number, width: number, height: number, options?: ReadRegionOptions): Promise<Uint8ClampedArray>;
    /**
     * Read the ICC color profile embedded in the image.
     * @returns A promise that resolves to an ArrayBuffer containing the ICC profile data, or null if no profile is available.
     */
    readIccProfile(): Promise<Uint8Array | null>;
}
export type { OpenSlideImage };
export type { FileEntry };
/**
 * Convert an array of File objects to an array of FileEntry objects.
 *
 * @param files An array of File objects.
 * @returns An array of FileEntry objects, each containing the file and its path.
 */
export declare function fileEntriesFromFiles(files: File[]): FileEntry[];
interface ApplyAlphaOptions {
    backgroundColor?: [number, number, number];
    inPlace?: boolean;
}
/**
 * Apply alpha compositing to the image data, following the
 * idiosyncrasies noted in the OpenSlide documentation.
 * By default the operation is performed in place.
 * Ref: https://openslide.org/docs/premultiplied-argb/
 *
 * @param imageData The image data in RGBA format as a Uint8ClampedArray.
 * @param options Options for applying alpha compositing.
 * @param options.backgroundColor The background color to use for fully transparent pixels (default: [255, 255, 255]).
 * @param options.inPlace Whether to modify the imageData in place (default: true).
 */
export declare function applyAlpha(imageData: Uint8ClampedArray, options?: ApplyAlphaOptions): Uint8ClampedArray;
