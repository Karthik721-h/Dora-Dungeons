/**
 * emailNormalizer
 *
 * Converts speech-recognition output into a valid email string.
 *
 * Examples:
 *   "john dot doe at gmail dot com"         → john.doe@gmail.com
 *   "myname at hotmail dot co dot uk"       → myname@hotmail.co.uk
 *   "alice underscore w at yahoo dot com"   → alice_w@yahoo.com
 *   "bob dash smith at outlook dot com"     → bob-smith@outlook.com
 */
export function normalizeEmailSpeech(raw: string): string {
  let s = raw.toLowerCase().trim();

  // Strip trailing punctuation from recognition
  s = s.replace(/[.,!?;:]+$/, "");

  // Already looks like an email — return as-is
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return s;

  // Spoken symbol substitutions (order matters — apply before stripping spaces)
  s = s
    .replace(/\s+at\s+/g, "@")
    .replace(/\s+dot\s+/g, ".")
    .replace(/\s+underscore\s+/g, "_")
    .replace(/\s+(?:dash|hyphen|minus)\s+/g, "-")
    .replace(/\s+plus\s+/g, "+")
    .replace(/\s+hash\s+/g, "#")
    .replace(/\s+number\s+sign\s+/g, "#");

  // Remove all residual spaces (speech recognition puts spaces between letters)
  s = s.replace(/\s+/g, "");

  return s;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
