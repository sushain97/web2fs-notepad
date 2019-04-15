require('dotenv').config();

const path = require('path');
const fs = require('fs');

const CleanWebpackPlugin = require('clean-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const WebpackAssetsManifest = require('webpack-assets-manifest');
const WebpackRequireFrom = require('webpack-require-from');

const SRC_PATH = path.resolve(__dirname, 'src', 'scripts');
const ASSETS_PATH = path.resolve(__dirname, 'public', 'assets');

module.exports = {
  mode: process.env.APP_ENV == 'dev' ? 'development' : 'production',
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
  ],
};
