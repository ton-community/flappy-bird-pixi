const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require("copy-webpack-plugin");

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: './src/index.ts',
    devtool: 'inline-source-map',
    module: {
      rules: [
        {
          test: /\.ts?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.(png|svg|fft)$/,
          type: 'asset/resource',
        },
        {
          test: /\.html$/i,
          loader: 'html-loader',
        },
      ],
    },
    output: {
      filename: 'bundle.js',
      path: path.resolve(__dirname, 'dist'),
      assetModuleFilename: "assets/[hash][ext][query]",
      clean: true,
    },
    devServer: {
      static: path.join(__dirname, 'dist'),
      compress: true,
      port: 4000,
      allowedHosts: 'all',
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      fallback: {
        buffer: require.resolve('buffer/'),
      }
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development')
      }),
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
      }),
      new CopyPlugin({
        patterns: [
          {from: "assets", to: "assets"},
        ],
      }),
      new HtmlWebpackPlugin({
        template: './index.html',
      })
    ],
    mode: 'production',
  };
};
