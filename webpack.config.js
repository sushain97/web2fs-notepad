require('dotenv').config();

const util = require('util');
const path = require('path');
const fs = require('fs');
const child_process = require('child_process');
const tmp = require('tmp');

const { NormalModuleReplacementPlugin } = require('webpack');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const WebpackAssetsManifest = require('webpack-assets-manifest');
const WebpackRequireFrom = require('webpack-require-from');

const icons = require('@blueprintjs/icons');

const SRC_PATH = path.resolve(__dirname, 'src', 'scripts');
const ASSETS_PATH = path.resolve(__dirname, 'public', 'assets');
const iconsFile = tmp.fileSync();

class BlueprintIconShakingPlugin {
  static extraIcons = ['key-command', 'key-option'];

  apply(compiler) {
    const exec = util.promisify(child_process.exec);
    const writeFile = fs.promises.writeFile;

    const iconsShaker = async _ => {
      const usedIcons = new Set([
        ...(await exec(`grep -ohER 'IconNames.[A-Z_]+' ${SRC_PATH}`)).stdout
          .split('\n')
          .map(i => i.split('.', 2)[1])
          .filter(Boolean)
          .map(i => i.toLowerCase().replace('_', '-')),
        ...BlueprintIconShakingPlugin.extraIcons,
      ]);

      const iconSvgPaths16 = Object.fromEntries(
        Object.entries(icons.IconSvgPaths16).filter(([iconName, _]) => usedIcons.has(iconName)),
      );
      const iconSvgPaths20 = Object.fromEntries(
        Object.entries(icons.IconSvgPaths20).filter(([iconName, _]) => usedIcons.has(iconName)),
      );

      await writeFile(
        iconsFile.name,
        `export const IconSvgPaths16 = ${JSON.stringify(iconSvgPaths16, null, 2)}
    export const IconSvgPaths20 = ${JSON.stringify(iconSvgPaths20, null, 2)}`,
      );
    };

    compiler.hooks.beforeRun.tapPromise('BlueprintIconShakingPlugin', iconsShaker);
    compiler.hooks.watchRun.tapPromise('BlueprintIconShakingPlugin', iconsShaker);
  }
}

const development = process.env.APP_ENV == 'dev';

module.exports = {
  mode: development ? 'development' : 'production',
  entry: fs.readdirSync(SRC_PATH).reduce((entrypoints, name) => {
    if (!fs.statSync(path.join(SRC_PATH, name)).isDirectory() && name.endsWith('.tsx')) {
      entrypoints[path.basename(name, '.tsx')] = path.join(SRC_PATH, name);
    }
    return entrypoints;
  }, {}),
  output: {
    filename: '[name].[contenthash].bundle.js',
    chunkFilename: '[name].[contenthash].chunk.js',
    publicPath: '/assets/',
    path: ASSETS_PATH,
    globalObject: 'this',
  },
  devtool: 'eval',
  resolve: {
    extensions: ['.webpack.js', '.web.js', '.ts', '.tsx', '.js'],
  },
  module: {
    rules: [
      {
        test: /worker\.ts$/,
        loader: 'worker-loader',
        options: {
          publicPath: '/assets/',
          inline: true,
        },
      },
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        loader: 'ts-loader',
      },
      {
        test: /\.(sa|sc|c)ss$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
      },
      {
        test: /\.(png|woff|woff2|eot|ttf|svg)$/i,
        use: [
          {
            loader: 'url-loader',
            options: {
              limit: 8192,
              fallback: 'file-loader',
            },
          },
        ],
      },
    ],
  },
  performance: {
    maxEntrypointSize: 1.5e9,
    maxAssetSize: 1.25e9,
  },
  plugins: [
    new CleanWebpackPlugin([ASSETS_PATH]),
    new MiniCssExtractPlugin({
      filename: '[name].[contenthash].bundle.css',
      path: ASSETS_PATH,
    }),
    !development &&
      new OptimizeCssAssetsPlugin({
        cssProcessor: require('cssnano'),
        cssProcessorOptions: {
          discardComments: {
            removeAll: true,
          },
        },
        canPrint: true,
      }),
    new WebpackAssetsManifest(),
    new WebpackRequireFrom({
      replaceSrcMethodName: 'mungeImportScriptsUrl',
      suppressErrors: true,
    }),
    new NormalModuleReplacementPlugin(/.*\/generated\/iconSvgPaths.*/, iconsFile.name),
    new BlueprintIconShakingPlugin(),
  ].filter(Boolean),
};
