/**
 * How the app's 3D preview draws a panel. The app builds the panel from its
 * size and these settings, so a new product shows in 3D with no app update.
 *
 * - FLAT: a smooth face (a seamless ceiling panel).
 * - FLUTED: `grooveCount` square ridges across the face (the 5 in "5in1").
 * - INVERTED_CIRCLE: `grooveCount` half-round flutes.
 * - SPANDREL: a flat face with `grooveCount` lines running along it.
 *
 * `surfaceImageUrl` is a straight-on photo of the face (colour and grain);
 * without one the app uses the product's main photo.
 */
export const PANEL_PROFILES = ['FLAT', 'FLUTED', 'INVERTED_CIRCLE', 'SPANDREL'] as const;
export type PanelProfile = (typeof PANEL_PROFILES)[number];

export const GROOVE_COUNT_MAX = 12;

export const PANEL_PROFILE_MESSAGE = 'Choose a valid 3D panel shape.';
export const GROOVE_COUNT_MESSAGE = `Number of grooves must be a whole number from 1 to ${GROOVE_COUNT_MAX}.`;
export const GROOVE_COUNT_REQUIRED_MESSAGE = 'Enter how many grooves the panel has.';
export const FLAT_GROOVES_MESSAGE = 'A flat panel has no grooves.';
export const SURFACE_IMAGE_MESSAGE = 'Please provide a valid surface photo URL.';

const PROFILE_NAMES: Record<PanelProfile, string> = {
  FLAT: 'Flat',
  FLUTED: 'Fluted',
  INVERTED_CIRCLE: 'Inverted circle',
  SPANDREL: 'Spandrel',
};

export const isPanelProfile = (value: unknown): value is PanelProfile =>
  typeof value === 'string' && (PANEL_PROFILES as readonly string[]).includes(value);

const isGrooveCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= GROOVE_COUNT_MAX;

/**
 * What is wrong with a shape and groove count taken together, or null when
 * they fit: a flat panel has no grooves, every other shape needs a count.
 * A missing shape means "not set yet" and allows no count.
 */
export const panel3dProblem = (profile: unknown, grooveCount: unknown): string | null => {
  const hasCount = grooveCount !== undefined && grooveCount !== null;
  if (hasCount && !isGrooveCount(grooveCount)) return GROOVE_COUNT_MESSAGE;
  if (profile === undefined || profile === null) return hasCount ? PANEL_PROFILE_MESSAGE : null;
  if (!isPanelProfile(profile)) return PANEL_PROFILE_MESSAGE;
  if (profile === 'FLAT') return hasCount ? FLAT_GROOVES_MESSAGE : null;
  return hasCount ? null : GROOVE_COUNT_REQUIRED_MESSAGE;
};

/** An http(s) address, as a stored change request must hold for the surface photo. */
export const isSurfaceImageUrl = (value: unknown): boolean => {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

/** "Fluted, 5 grooves", "Flat" or "Not set", for change request summaries. */
export const panel3dLabel = (profile: string | null | undefined, grooveCount: number | null | undefined): string => {
  if (!isPanelProfile(profile)) return 'Not set';
  const name = PROFILE_NAMES[profile];
  if (profile === 'FLAT' || !grooveCount) return name;
  return `${name}, ${grooveCount} groove${grooveCount === 1 ? '' : 's'}`;
};
