import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ["100.84.211.41", "10.254.33.22", "10.254.78.215"],
};

export default nextConfig;
