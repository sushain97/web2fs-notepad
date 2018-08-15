require('dotenv').config();

const path = require('path');

module.exports = {
    mode: process.env.APP_ENV == 'dev' ? 'development' : 'production',
    entry: './src/index.js',
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                loader: "babel-loader",
            },
        ],
    },
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'public'),
    },
};
