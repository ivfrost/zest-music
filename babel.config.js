module.exports = api => {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      ['inline-import', { extensions: ['.sql'] }],
      // Hermes does not support the RegExp `v` (unicodeSets) flag yet, and
      // file-type@22 (used by music-metadata) relies on it. This transpiles
      // those regexes to an equivalent `u`-flag form.
      '@babel/plugin-transform-unicode-sets-regex',
      // file-type also contains a Node-only dynamic import() that Hermes
      // cannot parse. The plugin is scoped to that package.
      './src/babel-plugins/file-type-hermes',
      'react-native-worklets/plugin',
    ],
  };
};
