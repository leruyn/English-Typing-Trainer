module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // No manual reanimated/worklets plugin here: babel-preset-expo (SDK 57)
    // auto-registers react-native-worklets/plugin when the package is
    // installed, and react-native-reanimated/plugin is just a forward to it
    // in Reanimated 4 - listing it manually applied the same transform
    // twice.
  };
};
