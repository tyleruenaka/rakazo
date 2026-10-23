/**
 * Grok's Primary star badge in the avatar's bottom-right corner. The badge is a fraction of
 * the avatar box, the glyph and the gap cut out of the avatar around it fractions of the badge.
 */
export function primaryStarGeometry(avatarSize: number) {
  const badge = avatarSize * 0.2667;
  return { badge, glyph: badge * 0.5, gap: badge * 0.169 };
}

/** A filled five-point star in a 24-unit box. */
export const PRIMARY_STAR_PATH =
  "M12 2.6 14.59 9.04 21.51 9.51 16.18 13.96 17.88 20.69 12 17 6.12 20.69 7.82 13.96 2.49 9.51 9.41 9.04Z";
