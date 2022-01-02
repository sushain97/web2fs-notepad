require('dotenv').config();

const util = require('util');
const path = require('path');
const fs = require('fs');
const child_process = require('child_process');
const tmp = require('tmp');

const { NormalModuleReplacementPlugin } = require('webpack');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const WebpackAssetsManifest = require('webpack-assets-manifest');

const icons = require('@blueprintjs/icons');

const SRC_PATH = path.resolve(__dirname, 'src', 'scripts');
const iconsFile = tmp.fileSync();

class BlueprintIconShakingPlugin {
  static extraIcons = ['key-command', 'key-option'];

  apply(compiler) {
    const exec = util.promisify(child_process.exec);
    const { writeFile, readFile } = fs.promises;

    const iconsShaker = async () => {
      const usedIcons = new Set([
        ...(await exec(`grep -ohER 'IconNames.[A-Z_]+' ${SRC_PATH}`)).stdout
          .split('\n')
          .map((i) => i.split('.', 2)[1])
          .filter(Boolean)
          .map((i) => i.toLowerCase().replace('_', '-')),
        ...BlueprintIconShakingPlugin.extraIcons,
      ]);

      const iconSvgPaths16 = Object.fromEntries(
        Object.entries(icons.IconSvgPaths16).filter(([iconName]) => usedIcons.has(iconName)),
      );
      const iconSvgPaths20 = Object.fromEntries(
        Object.entries(icons.IconSvgPaths20).filter(([iconName]) => usedIcons.has(iconName)),
      );

      const fileContent = `export const IconSvgPaths16 = ${JSON.stringify(iconSvgPaths16, null, 2)}
      export const IconSvgPaths20 = ${JSON.stringify(iconSvgPaths20, null, 2)}`;

      if ((await readFile(iconsFile.name, 'utf-8')) != fileContent) {
        await writeFile(iconsFile.name, fileContent);
      }
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
    path: path.resolve(__dirname, 'public', 'assets'),
    globalObject: 'this',
  },
  devtool: development ? 'eval-cheap-source-map' : false,
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
          inline: 'fallback',
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
        type: 'asset',
      },
    ],
  },
  performance: {
    hints: 'error',
    maxEntrypointSize: development ? 8e6 : 1.25e6,
    maxAssetSize: development ? 8e6 : 1.25e6,
  },
  optimization: {
    minimizer: [new CssMinimizerPlugin(), '...'],
  },
  plugins: [
    new CleanWebpackPlugin(),
    new MiniCssExtractPlugin({
      filename: '[name].[contenthash].bundle.css',
    }),
    new WebpackAssetsManifest(),
    new NormalModuleReplacementPlugin(/.*\/generated\/iconSvgPaths.*/, iconsFile.name),
    new BlueprintIconShakingPlugin(),
  ],
};
