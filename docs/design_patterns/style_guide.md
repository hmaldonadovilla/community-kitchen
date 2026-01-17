# Typography Recommendation for Applications

## Recommended font choice (industry standard)

Use the platform’s system font (system UI font stack) for all applications.

### Why

- Optimised for screens and readability
- Familiar to users (no learning effort)
- Fast loading (no font files)
- Best accessibility support
- Consistent across apps on the same device

### What this means in practice

- iOS / iPadOS: SF Pro
- Android: Roboto
- Windows: Segoe UI
- macOS: San Francisco
- Web: system-ui (maps automatically to the above)

## Recommended CSS (for web apps)

```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
```

### Font usage best practices

- Labels: medium or semibold
- Content: regular
- Warnings: regular text with icon (do not rely on bold or colour alone)
- Avoid ALL CAPS text (reduces readability and increases visual noise)

General rule:
Do not mix fonts within the same application. Use a single system font consistently across all screens and components.
