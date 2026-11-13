/** Collapsed player card height. */
export const MINI_PLAYER_HEIGHT = 64;
/** Material bottom navigation height above the system inset. */
export const TAB_BAR_HEIGHT = 80;
/** Gap between the player card and the tab bar. */
export const MINI_PLAYER_GAP = 8;
/** Vertical gap between stacked surfaces inside a tab. */
export const SURFACE_GAP = 10;
/**
 * Padding a scrolling tab needs so its last row clears the player card. Keeps
 * the space above the card equal to the gap between the filter row and the
 * list, so the column of surfaces is evenly spaced.
 */
export const MINI_PLAYER_CLEARANCE =
  MINI_PLAYER_HEIGHT + MINI_PLAYER_GAP + SURFACE_GAP;
