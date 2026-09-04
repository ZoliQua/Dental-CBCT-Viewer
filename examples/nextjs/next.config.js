/** @type {import('next').NextConfig} */
const nextConfig = {
  // REQUIRED: the viewer's DICOM decode workers use SharedArrayBuffer, which
  // needs cross-origin isolation. Without these headers image decoding will not
  // run. Apply them to every route that renders the viewer.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
