// Shared AI model IDs.
// Change here to swap models across all edge functions in one place.

// Main content generation and revision passes (blog posts, generated pages,
// refresh, critique/revise, mechanical fix, SEO/AEO metadata).
export const MAIN_MODEL = "google/gemini-3-flash-preview";

// Lightweight, cost-efficient model used only for short helper steps
// (angle brainstorming, tag suggestions, etc.).
export const ANGLE_MODEL = "google/gemini-2.5-flash-lite";

// Image generation model.
export const IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";
