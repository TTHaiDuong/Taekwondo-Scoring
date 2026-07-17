import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    turbo: {
      rules: {
        "*.svg": {
          loaders: ["@svgr/webpack"],
          as: "*.js",
        },
      },
    },
  },
  devIndicators: {
    appIsrStatus: false,   // tắt static / dynamic route badge
    buildActivity: false, // tắt build spinner
    buildActivityPosition: 'bottom-right', // (tuỳ chọn)
  },
};

export default nextConfig;
