module.exports = {
  plugins: {
    "postcss-preset-env": {
      stage: 3,
      features: {
        "nesting-rules": true,
        "custom-properties": true,
        "custom-media-queries": true,
        "color-function": true,
        "gap-properties": true,
        "color-mod-function": true
      },
      preserve: true
    },
    "postcss-color-mod-function": {},
    "autoprefixer": {
      grid: true
    }
  }
};
