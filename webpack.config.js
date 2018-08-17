require('dotenv').config();

const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

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
                use: [{
                        loader: MiniCssExtractPlugin.loader,
                    },
                    'css-loader',
                ],
            }
        ],
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: 'bundle.css',
            path: PUBLIC,
        }),
    ],
    resolve: {
        alias: {
            'react': 'preact-compat',
            'react-dom': 'preact-compat',
        },
    },
};