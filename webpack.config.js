require('dotenv').config();

const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin');

const PUBLIC = path.resolve(__dirname, 'public');

// TODO: investigate Symfony's built-in Webpack support

module.exports = {
    mode: process.env.APP_ENV == 'dev' ? 'development' : 'production',
    entry: './src/index.tsx',
    output: {
        filename: 'bundle.js',
        path: PUBLIC,
    },
    devtool: 'eval',
    resolve: {
        extensions: ['.webpack.js', '.web.js', '.ts', '.tsx', '.js', '.css'],
    },
    module: {
        rules: [{
                test: /\.tsx?$/,
                exclude: /node_modules/,
                loader: 'ts-loader',
            },
            {
                test: /\.css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader',
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
        new MiniCssExtractPlugin({
            filename: 'bundle.css',
            path: PUBLIC,
        }),
        new OptimizeCssAssetsPlugin({
            cssProcessor: require('cssnano'),
            cssProcessorOptions: {
                discardComments: {
                    removeAll: true,
                },
            },
            canPrint: true,
        })
    ],
    resolve: {
        alias: {
            'react': 'preact-compat',
            'react-dom': 'preact-compat',
        },
    },
};