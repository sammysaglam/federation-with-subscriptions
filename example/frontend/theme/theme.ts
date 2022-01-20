import { createGlobalStyle, css } from "styled-components";

export const GlobalStyles = createGlobalStyle`${css`
  * {
    box-sizing: border-box;
    margin: 0;
  }

  body {
    font-family: ${({ theme }) => theme.fonts.primary};
    font-size: ${({ theme }) => theme.fonts.sizes["14"]};
    font-weight: 300;
  }

  h1 {
    font-size: ${({ theme }) => theme.fonts.sizes["56"]};
  }

  h2 {
    font-size: ${({ theme }) => theme.fonts.sizes["48"]};
  }

  h3 {
    font-size: ${({ theme }) => theme.fonts.sizes["36"]};
  }

  h4 {
    font-size: ${({ theme }) => theme.fonts.sizes["24"]};
  }

  h5 {
    font-size: ${({ theme }) => theme.fonts.sizes["20"]};
  }

  h6 {
    font-size: ${({ theme }) => theme.fonts.sizes["16"]};
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-family: ${({ theme }) => theme.fonts.secondary};
  }
`}`;

const rgb =
  (red: number, green: number, blue: number) =>
  (alpha: number | object): any =>
    typeof alpha === "object"
      ? `rgb(${red},${green},${blue})`
      : `rgba(${red},${green},${blue},${alpha})`;

type RgbaReturnType = ReturnType<typeof rgb>;

function colorCollection<Collections>(
  collection: { default: RgbaReturnType } & Collections,
) {
  const collectionKeys = Object.keys(collection);
  type CollectionName = keyof Collections;

  return (
    colorVariantNameOrAlpha: CollectionName | number | object,
  ): RgbaReturnType => {
    if (collectionKeys.includes(colorVariantNameOrAlpha as string)) {
      const key = colorVariantNameOrAlpha as CollectionName;

      // @ts-ignore
      return collection[key];
    }

    if (typeof colorVariantNameOrAlpha === "number") {
      // @ts-ignore
      return collection.default(colorVariantNameOrAlpha as number);
    }

    // @ts-ignore
    return collection.default(colorVariantNameOrAlpha as object);
  };
}

const lightTheme = {
  brand: colorCollection({
    default: rgb(77, 46, 110),
    text: rgb(255, 255, 255),
    hover: rgb(87, 56, 120),
  }),
  text: colorCollection({
    default: rgb(0, 0, 0),
  }),
  background: colorCollection({
    default: rgb(255, 255, 255),
  }),
  warn: colorCollection({
    default: rgb(252, 219, 23),
    text: rgb(0, 0, 0),
  }),
  success: colorCollection({
    default: rgb(13, 186, 111),
    text: rgb(255, 255, 255),
  }),
  error: colorCollection({
    default: rgb(230, 106, 106),
    text: rgb(255, 255, 255),
  }),
};

const darkTheme: typeof lightTheme = {
  brand: colorCollection({
    default: rgb(77, 46, 110),
    text: rgb(255, 255, 255),
    hover: rgb(87, 56, 120),
  }),
  text: colorCollection({
    default: rgb(255, 255, 255),
  }),
  background: colorCollection({
    default: rgb(33, 6, 63),
  }),
  warn: colorCollection({
    default: rgb(252, 219, 23),
    text: rgb(0, 0, 0),
  }),
  success: colorCollection({
    default: rgb(13, 186, 111),
    text: rgb(255, 255, 255),
  }),
  error: colorCollection({
    default: rgb(230, 106, 106),
    text: rgb(255, 255, 255),
  }),
};

const themeConfig = {
  fonts: {
    primary: `DM Mono`,
    secondary: `DM Mono`,
    sizes: {
      "12": "12px",
      "14": "14px",
      "16": "16px",
      "20": "20px",
      "24": "24px",
      "36": "36px",
      "48": "48px",
      "56": "56px",
    },
  },
  zindexes: {
    modal: 100,
    feedbackButton: 99,
  },
};

export const defaultTheme = {
  ...themeConfig,
  colors: darkTheme,
};

export const alternativeTheme: typeof defaultTheme = {
  ...themeConfig,
  colors: lightTheme,
};

export type Color =
  | keyof typeof defaultTheme.colors
  | typeof defaultTheme.colors[keyof typeof defaultTheme.colors];

export type ThemeType = typeof defaultTheme;
