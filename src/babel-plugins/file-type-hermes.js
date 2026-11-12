/**
 * Hermes cannot parse the dynamic `import()` calls file-type uses to lazily load
 * Node-only modules in `fileTypeFromFile`. That path never runs on React Native,
 * but the syntax breaks the bundle, so the call becomes a rejected promise.
 * Scoped to file-type by filename so app code keeps Metro's dynamic imports.
 */
module.exports = function fileTypeHermes({ types: t }) {
  const isFileTypeModule = filename =>
    /[\\/]node_modules[\\/]file-type[\\/]/.test(filename ?? '');

  return {
    name: 'file-type-hermes-compat',
    visitor: {
      CallExpression(path, state) {
        if (path.node.callee.type !== 'Import') return;
        if (!isFileTypeModule(state.file.opts.filename)) return;

        path.replaceWith(
          t.callExpression(
            t.memberExpression(t.identifier('Promise'), t.identifier('reject')),
            [
              t.newExpression(t.identifier('Error'), [
                t.stringLiteral(
                  'Dynamic import() is not supported in this React Native bundle.',
                ),
              ]),
            ],
          ),
        );
      },
    },
  };
};
