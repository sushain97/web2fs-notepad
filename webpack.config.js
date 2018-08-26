require('dotenv').config();

const path = require('path');
const fs = require('fs');

const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const WebpackAssetsManifest = require('webpack-assets-manifest');
const CleanWebpackPlugin = require('clean-webpack-plugin');

const SRC_PATH = path.resolve(__dirname, 'src');
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
    },
    devtool: 'eval',
    resolve: {
        extensions: ['.webpack.js', '.web.js', '.ts', '.tsx', '.js'],
    },
    module: {
        rules: [{
                test: /\.tsx?$/,
                exclude: /node_modules/,
                loader: 'ts-loader',
            },
            {
                test: /\.(sa|sc|c)ss$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader',
                    'sass-loader',
                ],
            },
            {
                test: /\.(png|woff|woff2|eot|ttf|svg)$/i,
                use: [{
                    loader: 'url-loader',
                    options: {
                        limit: 8192,
                        fallback: 'file-loader',
                    },
                }],
            }
        ],
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
    ],
};