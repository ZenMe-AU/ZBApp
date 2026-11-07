# Contrast Axes UX - Quick Reference Guide

## New Features

### 🖱️ Pan (Drag to Move)
**How to use:**
- Click and drag anywhere on the chart to pan left/right/up/down
- The view follows your mouse in real-time
- Great for exploring dense clusters of keywords

**Why it's useful:**
- Navigate without zooming to see different areas
- Maintain your current zoom level while exploring
- Smooth, responsive movement

---

### 🔍 Zoom (Ctrl + Scroll)
**How to use:**
- Hold down `Ctrl` (or `Cmd` on Mac) while scrolling your mouse wheel
- Scroll **up** to zoom **in**
- Scroll **down** to zoom **out**
- Zoom is always centered on where your cursor is

**Why it's useful:**
- Fine-grained zoom control for detailed inspection
- Slow zoom factors (1.1x / 0.9x) for precise navigation
- Cursor-centered zoom keeps your focus point visible

**Note:** Ctrl+scroll is slower and more precise than standard Plotly zoom

---

### 📊 Bubble Sizing (Size by dropdown)
**Three sizing modes:**

1. **Uniform** (default)
   - All bubbles are the same size
   - Clean, uncluttered view
   - Best when you care about position, not abundance

2. **Identity count**
   - Bubble size = how many identities share this keyword
   - Larger bubbles = more people have this preference
   - Useful for identifying widely-shared keywords
   - Range: 5–17 pixels

3. **Best mode score**
   - Bubble size = strongest mode affinity for that keyword
   - Larger bubbles = keyword is strongly aligned with some mode
   - Useful for spotting high-confidence keywords
   - Range: 5–17 pixels

**How to change:**
- Use the "Size by" dropdown in the toolbar
- Chart updates instantly as you switch

---

## Tips & Tricks

- **Combine features**: Use `Size by: Identity count` + pan/zoom to find widely-shared preferences
- **Focus exploration**: Switch to `Size by: Best mode score` to identify strong mode signals
- **Pan first, zoom second**: Pan to center your area of interest, then zoom in for details
- **Ctrl+scroll is more precise** than Plotly's built-in zoom for fine control

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Zoom in | `Ctrl` + Scroll Up |
| Zoom out | `Ctrl` + Scroll Down |
| Pan | Click + Drag |
| Reset zoom | Double-click on plot (Plotly default) |
| Home | Click "Home" button (Plotly toolbar) |

---

## Troubleshooting

**Pan not working?**
- Make sure you're clicking directly on the chart area, not on the legend or axis labels
- The pan action starts on mousedown and continues while dragging

**Zoom not working?**
- Hold `Ctrl` (Windows/Linux) or `Cmd` (Mac) while scrolling
- Some laptops may require `Fn` + trackpad scroll

**Bubble sizes not changing?**
- Switch the "Size by" dropdown to a different option
- The chart should update instantly
- If not, try reloading the page
