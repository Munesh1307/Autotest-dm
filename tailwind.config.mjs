/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,jsx,mdx}",
    "./src/components/**/*.{js,jsx,mdx}",
    "./src/app/**/*.{js,jsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: "var(--primary)",
      },
      screens: {
        xs: "480px",
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px",
        costom550: "550px",
        costom390: "390px",
        costom860: "860px",
        costom890: "890px",
        costom895: "895px",
        costom1150: "1150px",
        costom1080: "1080px",
        costom410: "410px",
        costom960: "960px",
        costom1660: "1660px",
      },
    },
    fontFamily: {
      poppins: "var(--font-poppins)",
    },
  },
  plugins: [],
};
