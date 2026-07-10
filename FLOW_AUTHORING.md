# Interaction Flow Authoring

Interaction flow templates are optional smoke tests for real storefront behavior. They are not enabled by default because selectors are theme-specific.

## Rule

Do not use generic selectors as final evidence. First inspect the theme DOM, then edit/copy the flow template with real selectors.

Good flow tests should answer small questions:

- Does the mobile menu open?
- Does search open and accept typing?
- Does collection filter/sort open?
- Can product variant/quantity/add-cart controls be reached?
- Is cart note/checkout visible?

## Workflow

1. Open the preview page with DevTools MCP or Chrome.
2. Inspect the real button/input/container selectors.
3. Copy one template:
   - `INTERACTION_FLOW.template.json`
   - `INTERACTION_FLOW.product.template.json`
   - `INTERACTION_FLOW.collection.template.json`
   - `INTERACTION_FLOW.cart.template.json`
4. Save the project-specific copy, for example:
   - `scratch/qa/interaction-flow.home.json`
   - `scratch/qa/interaction-flow.product.json`
5. Replace generic selectors with real selectors.
6. Run:

```powershell
node RESTYLE_MASTER_KIT/qa_restyle_check.js --base "<preview-url>" --paths / --flow scratch/qa/interaction-flow.home.json --out scratch/qa
```

## Flow Schema

```json
{
  "flows": [
    {
      "name": "search-opens",
      "path": "/",
      "viewports": [375, 1440],
      "steps": [
        { "click": ".header-search-button" },
        { "waitFor": ".search-modal.is-open" },
        { "fill": "input[name='q']", "value": "serum" },
        { "press": "Enter" },
        { "waitMs": 800 }
      ]
    }
  ]
}
```

Supported steps:

| Step | Meaning |
|---|---|
| `click` | Click first matching selector |
| `fill` + `value` | Fill first matching input |
| `press` | Press keyboard key |
| `waitFor` | Wait for selector visible by default |
| `expectVisible` | Assert selector is visible |
| `waitMs` | Wait fixed milliseconds |

`waitFor` supports optional `state`:

| State | Meaning |
|---|---|
| `visible` | Default. Selector exists and is visible |
| `attached` | Selector exists in DOM, visible or not |
| `hidden` | Selector is hidden or detached |
| `detached` | Selector is removed from DOM |

Example:

```json
{ "waitFor": ".cart-drawer", "state": "attached" }
```

Path matching is normalized. `/cart`, `/cart/`, `/cart?view=drawer`, and a full URL with pathname `/cart` are treated as the same flow path.

## State Reset

By default, `qa_restyle_check.js` reloads the page before each flow. This prevents one flow from leaving a menu/drawer/filter open and breaking the next flow.

Use `--no-flow-reload` only when you intentionally test a chained state.

## Keep It Small

Prefer 1-3 flows per page type. Do not turn this into full E2E coverage. Use it to catch obvious broken interactions after a restyle.
