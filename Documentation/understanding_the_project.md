## Q&A

### Q: What are assets?
Assets are the non-code files your app needs to look right and feel complete — things like images, fonts, icons, and splash screens. Think of them like the decorations in a room: the walls and structure are your code, but assets are the paint, furniture, and pictures on the wall.

In Beta Breaker, the `assets/` folder holds things like the app icon (what users see on their home screen), the splash screen image (what flashes while the app loads), and the adaptive icon for Android. Expo knows to bundle these files into your final app binary so they're available offline — they don't need to be downloaded at runtime.

The key distinction: **code** tells the app what to *do*, **assets** tell it what to *look like*. If you removed all assets, the app would still run — it would just be ugly and missing its branding.

### Q: What is in the components directory?
The `components/` directory is like a toolbox with labeled drawers — each subdirectory holds reusable UI building blocks organized by what part of the app they belong to.

- **`ui/`** — Generic primitives that could work in any app: buttons, cards, text inputs, modals. The Lego bricks everything else is built from.
- **`routes/`** — Components specific to displaying climbing routes: route cards, route lists, grade badges.
- **`session/`** — Components for the climbing session experience: the timer, the quick-log sheet.
- **`badges/`** — Achievement/badge display components.
- **`streaks/`** — Streak visualization (climb X days in a row).
- **`challenges/`** — Challenge-related UI.
- **`social/`** — Leaderboards, community feed elements.
- **`notifications/`** — Notification list/items.
- **`navigation/`** — Navigation helpers (tab bar customization, etc.).

The loose files at the top (`useClientOnlyValue.ts`, `useColorScheme.ts`) are small hooks from the Expo template that handle platform differences between web and native. The pattern is: **`ui/` holds generic pieces, domain folders hold app-specific pieces**. A screen in `app/` assembles components from these drawers like snapping Legos together, rather than building everything from scratch each time.
