// ── Trip branding ─────────────────────────────────────────────────────────
// The one place to rename the app for a new holiday. (The itinerary content,
// dates and travellers live in data/itinerary.json + src/lib/family.ts.)
//
// When starting a new trip, also update — see TEMPLATE.md:
//   • index.html         <title> + apple-mobile-web-app-title
//   • vite.config.ts     VitePWA manifest name / short_name / theme_color
//   • tailwind.config.ts + src/styles.css  the colour palette (optional)
export const APP = {
  /** Full name on the login splash. */
  name: 'My Family Holiday',
  /** Short name in the top header. */
  short: 'Holiday',
  /** Single letter/emoji for the logo tile. */
  iconLetter: '🏝️',
}
