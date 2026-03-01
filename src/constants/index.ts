// Fonts
export const FONTS = {
  mono: 'Menlo',
};

// Typography Scale - Centralized font sizes and styles
export const TYPOGRAPHY = {
  // Display / Hero numbers
  display: {
    fontSize: 22,
    fontFamily: FONTS.mono,
    fontWeight: '200' as const,
    letterSpacing: -0.5,
  },

  // Headings
  h1: {
    fontSize: 24,
    fontFamily: FONTS.mono,
    fontWeight: '300' as const,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 16,
    fontFamily: FONTS.mono,
    fontWeight: '400' as const,
    letterSpacing: -0.2,
  },
  h3: {
    fontSize: 13,
    fontFamily: FONTS.mono,
    fontWeight: '400' as const,
    letterSpacing: -0.2,
  },

  // Body text
  body: {
    fontSize: 14,
    fontFamily: FONTS.mono,
    fontWeight: '400' as const,
  },
  bodySmall: {
    fontSize: 13,
    fontFamily: FONTS.mono,
    fontWeight: '400' as const,
  },

  // Labels (whispers)
  label: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    fontWeight: '400' as const,
    letterSpacing: 0.3,
  },
  labelSmall: {
    fontSize: 9,
    fontFamily: FONTS.mono,
    fontWeight: '400' as const,
    letterSpacing: 0.3,
  },

  // Metadata / Details
  meta: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    fontWeight: '300' as const,
  },
  metaSmall: {
    fontSize: 9,
    fontFamily: FONTS.mono,
    fontWeight: '300' as const,
  },
};

// Spacing Scale - Consistent whitespace
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

// Onboarding slides
export const ONBOARDING_SLIDES = [
  {
    id: 'welcome',
    keyword: 'WILDME',
    title: 'Wildlife\nRe-identification.',
    description: 'Identify and track individual animals using on-device AI. No cloud required.',
  },
  {
    id: 'capture',
    keyword: 'CAPTURE',
    title: 'Snap a Photo.\nAI Does the Rest.',
    description: 'Take a photo in the field and our detector finds every animal. Embeddings match them to known individuals instantly.',
  },
  {
    id: 'privacy',
    keyword: 'PRIVATE',
    title: 'Your Data\nStays on Device.',
    description: 'All detection, embedding, and matching runs locally. Sync only when you choose to.',
  },
  {
    id: 'hardware',
    keyword: 'READY',
    title: 'Tuned for\nYour Hardware.',
    description: 'Optimized for on-device inference. We detect your hardware and configure the pipeline automatically.',
  },
];
