# Product Design Audit: Project Info Page

Date: 2026-06-25
Surface: ARCHICONCEPT workflow step 1, project info page
Destination: Local folder, `E:\ARCHICONCEPT筑概\product-design-audit\project-info-page`

## Captured Evidence

1. `01-project-info-current.png`
   - Current step 1 with the AI assistant strip open.
   - Health: blocked by overlay and visible form duplication.

2. `01-project-info-current-full.png`
   - Full-page capture with the assistant strip open.
   - Health: shows workflow content, sticky action bar, footer, and overlay competing in one scroll surface.

3. `02-project-info-assistant-closed.png`
   - Current step 1 after closing the assistant strip.
   - Health: assistant overlay is gone, but the form remains structurally confused.

4. `02-project-info-assistant-closed-full.png`
   - Full-page capture after closing assistant strip.
   - Health: exposes residual legacy labels, clipped lower form/action area, and marketing footer inside workflow scroll.

## Audit Scope

This audit is scoped to the visible project info page only. It does not evaluate the full six-step workflow, map editor behavior, API results, or keyboard/focus behavior beyond what is visible in screenshots and DOM metadata.

## User Goal

The user needs to enter project identity, building type, location, area, GFA, design stage, and a short project description without fighting duplicated fields, overlapping controls, or repeated explanatory content.

## Strengths

- The main two-column project fields are now easier to scan than the previous label-below-input state.
- The right status panel gives useful completion feedback and pending items.
- The restrained black-white-gray palette still matches ARCHICONCEPT's architectural SaaS direction.

## UX Risks

1. The original legacy form grid still remains below the migrated fields. It leaves duplicate labels such as `项目名称 / NAME *`, `建筑类型 / TYPE *`, `项目地点 / LOCATION *`, and `用地面积 / AREA` under the textarea. This is the primary source of visual disorder.

2. The top stage copy is not using one stable source of truth. The page can show the old description again after rerendering, so the earlier DOM patch is too fragile.

3. The sticky bottom action bar covers the lower part of the form and the `资料入口` card area. This makes the bottom of the first step feel clipped.

4. The AI assistant strip opens across the bottom of the form and competes with primary actions. For a data-entry page, it should not occupy the main working area by default.

5. The marketing footer appears in the same scroll flow as the workflow app. This makes a focused SaaS task page feel like a mixed product page and static site.

6. The right status panel repeats the same status language as the header and is visually heavy next to the form.

## Accessibility Risks

1. Duplicate legacy labels create a confusing reading order for assistive technology and text navigation.

2. The bottom sticky action bar and assistant strip can obscure interactive content, which is risky for zoomed views and smaller screens.

3. The page contains multiple navigation systems and footer content in the same DOM flow, increasing landmark and reading-order noise.

4. Full keyboard and screen-reader behavior was not tested in this screenshot audit.

## Recommended Fix Scope

1. Remove or hide the old legacy field grid after migrating the five project fields into the new `#step12-project-info-grid`.

2. Move the step 1 header sentence into the workflow step configuration or renderer, instead of patching the DOM after render.

3. Keep only one concise helper sentence in the top stage header and avoid separate explanatory blocks for the same instruction.

4. Make the AI assistant collapsed by default on workflow forms, or dock it as a small chip that does not cover input fields.

5. Add enough bottom padding for the sticky action bar and keep the `资料入口` card fully visible.

6. Hide the marketing footer inside the workflow shell, or move it outside the active workflow route.

7. Compress the right status panel copy so it supports the form instead of repeating the page title and state.

## Evidence Limits

This audit used Chrome screenshots and DOM metadata from the local dev server. It did not verify all breakpoints, browser combinations, keyboard navigation, focus order, or screen-reader output.
