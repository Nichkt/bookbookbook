import { unzipSync, type UnzipFileInfo } from "fflate"

export interface UnzipLimits {
  /** The most a file may unpack to, by its path in the zip: 0 leaves it out. */
  limit(name: string): number
  /** The most every file kept may unpack to, together. */
  maxTotal: number
  maxEntries: number
}

/**
 * Unpacks only the files wanted, within sane sizes, so a stray or hostile zip can't eat the memory or the time.
 * Stored files must be the size they claim, and the files unpacked can't share data: their packed sizes add up to
 * no more than the zip. So the work grows with the zip's size, not with what its directory claims. Throws if the
 * zip can't be read or breaks a limit.
 */
export function unzipLimited(data: Uint8Array, limits: UnzipLimits): Map<string, Uint8Array> {
  let entries = 0
  let packed = 0
  let unpacked = 0
  const wanted = (file: UnzipFileInfo) => {
    if (++entries > limits.maxEntries) throw new Error("Too many files")
    const limit = limits.limit(file.name)
    if (!limit || (file.compression !== 0 && file.compression !== 8) || file.originalSize > limit) return false
    if (file.compression === 0 && file.size !== file.originalSize) throw new Error("Bad size")
    packed += file.size
    unpacked += file.originalSize
    if (packed > data.length || unpacked > limits.maxTotal) throw new Error("Too big")
    return true
  }
  return new Map(Object.entries(unzipSync(data, { filter: wanted })))
}
