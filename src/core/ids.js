// Random ids for boards and invite links, from the browser's secure random source.
// The alphabet skips look-alikes (0/o, 1/l/i) so codes are easy to read aloud.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
// Bytes at or above this value would make some characters more likely; skip them
const UNBIASED_LIMIT = 256 - (256 % ALPHABET.length);

export function randomId(length = 24) {
  const out = [];
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < UNBIASED_LIMIT) out.push(ALPHABET.charAt(byte % ALPHABET.length));
      if (out.length === length) break;
    }
  }
  return out.join("");
}

// Board ids: 20 random characters (~99 bits), grouped for readability
export const newBoardCode = () => randomId(20).match(/.{4}/g).join("-");
