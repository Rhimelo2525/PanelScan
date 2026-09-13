# Design system and assets

Authority: `web/src/index.css`, layout/UI components, and `web/components.json`. Tailwind 4 uses CSS imports and semantic variables; shadcn's configured style is `radix-nova` with Radix primitives and Lucide icons.

## Typography, spacing and radius

Geist Variable is imported from `@fontsource-variable/geist`; headings share the sans font. CSS classes include `type-display` (clamp 2.9–5.6rem), `type-h1` (2.25–3.5rem), `type-h2` (1.75–2.75rem), `type-h3`, lead/body/label/caption/metric styles. Numeric metrics use tabular figures.

Container width is at most 76rem with `px-5 sm:px-7 lg:px-10`. Section rhythm uses `py-20 sm:py-26 lg:py-34`; the tight variant uses `py-14 sm:py-18 lg:py-22`.

Base radius is 1rem for storefront and .75rem for Admin. sm/md/lg/xl/2xl multiply it by .5/.75/1/1.25/1.5; 3xl/4xl use 1.75/2. Cards use `surface-card`, grouped panels `surface-panel`, and clipped images `surface-media`.

## Colors

| Token | Storefront | Admin surface |
| --- | --- | --- |
| Background | `#f7f4ee` | `#f4f4f6` |
| Foreground | `#29241f` | `#17181c` |
| Card | `#fbfaf7` | `#ffffff` |
| Primary | `#7a5f4d` | `#23252c` |
| Secondary | `#eee8df` | `#eceef1` |
| Border | `#d9d0c5` | `#e0e2e7` |

Status colors include positive `#1f6f4a`, warning `#8a5a12`, critical `#9b2c2c`, info `#1f5980`, with paired surface colors and text labels. `.dark` overrides exist, but no user-facing theme switch is implemented in the inspected navigation. Do not advertise a complete selectable dark-mode experience.

## Components, responsiveness and motion

Shared primitives include buttons, inputs, selects, sheets, dialogs, cards, badges, skeletons, and toast notifications. Feature components reuse these primitives rather than introducing a second Admin component library.

The source uses Tailwind's standard `sm`, `md`, `lg`, and `xl` variants without custom breakpoint overrides. Storefront navigation changes to a mobile sheet below `lg`; staff previews use a section selector below `lg`. `DataTable` renders cards below `md`, tables from `md`, and secondary table columns from `lg`. Product grids grow from one to four columns. Forms also use named container queries so field layout follows available sheet width.

Storefront motion tokens are 140/200/280ms; Admin overrides them to 110/160/220ms. CSS defines fade, rise, swap, directional entry, hover lift, and image zoom. `useRevealOnScroll` uses IntersectionObserver with a 1200ms visibility fallback. Reduced-motion rules remove reveal transforms and collapse transitions/animations. These are source-implemented behaviors, not a completed browser-accessibility audit.

## Existing brand assets

All files below exist under `web/public/brand/`; no duplicate assets are required.

| File | Confirmed use/status |
| --- | --- |
| `panelscan-logo.png` | Used by `BrandMark` and `BrandLogo` in `components/layout/brand.tsx` |
| `panelscan-logo-512.png` | Existing derivative; not selected by the inspected brand component |
| `panelscan-logo.jpg` | Existing JPEG variant |
| `panelscan-logo-600.jpg` | Existing JPEG derivative |
| `favicon-64.png` | Referenced as the 64x64 icon in `web/index.html` |
| `apple-touch-icon.png` | Referenced in `web/index.html` |

Preserve aspect ratio and the supplied artwork. `BrandMark` uses a contained background image; `BrandLogo` uses an image with `object-contain`, PanelScan/Disenyo alt text, and declared 720x720 dimensions. Do not infer actual binary dimensions or file sizes from filenames or HTML attributes. No transparent variant is established by the inspected asset list.

`web/public/images/` contains four representative WebP assets: `home/hero-fluted-interior.webp`, `categories/wall-panels.webp`, `categories/ceiling-panels.webp`, and `interiors/panel-installation.webp`. Their existing README identifies them as visualizations, not photographs of actual client products or completed projects.

Custom-order development credit: `anxndd_`, **GreyStudio**. This attribution does not imply that all supplied brand assets were authored by the developer or transfer their ownership.
