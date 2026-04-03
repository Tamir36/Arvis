/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "3000",
        pathname: "/uploads/**",
      },
    ],
  },
  serverExternalPackages: ["@prisma/client", "bcryptjs", "sharp"],
  webpack: (config, { dev }) => {
    if (dev) {
      // Prevent intermittent missing chunk/module errors during hot reload.
      config.cache = false;
    }
    return config;
  },
};

module.exports = nextConfig;
