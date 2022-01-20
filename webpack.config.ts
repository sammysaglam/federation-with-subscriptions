import ReactRefreshWebpackPlugin from "@pmmmwh/react-refresh-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import path from "path";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";
import { Configuration as WebpackConfiguration, DefinePlugin } from "webpack";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";
// @ts-ignore
import { Configuration as WebpackDevServerConfiguration } from "webpack-dev-server";

interface Configuration extends WebpackConfiguration {
  devServer?: WebpackDevServerConfiguration;
}

const WEBPACKDEV_PORT = process.env.DEV_PORT
  ? Number(process.env.DEV_PORT)
  : 8000;

const config: (options: any) => Configuration = (options) => {
  const isProduction = !options.WEBPACK_SERVE || options.analyze;
  const isAnalyze = Boolean(options.analyze);

  return {
    mode: isProduction ? "production" : "development",
    devtool: isProduction ? false : "eval-cheap-module-source-map",
    entry: "./example/frontend/entry.tsx",
    module: {
      rules: [
        {
          test: /\.(ts|tsx|js)$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
            options: {
              plugins: [
                [
                  "babel-plugin-styled-components",
                  {
                    displayName: !isProduction,
                    fileName: !isProduction,
                  },
                ],
                !isProduction && require.resolve("react-refresh/babel"),
              ].filter((plugin) => Boolean(plugin)),
            },
          },
        },
        {
          test: /\.svg$/,
          loader: "svg-react-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.(png|webp|svg)$/,
          type: "asset/resource",
        },
      ],
    },
    devServer: {
      historyApiFallback: true,
      hot: true,
      contentBase: path.join(__dirname),
      compress: true,
      port: WEBPACKDEV_PORT,
      host: "0.0.0.0",
      disableHostCheck: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers":
          "X-Requested-With, content-type, Authorization",
      },
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      plugins: [new TsconfigPathsPlugin() as any],
    },
    output: {
      path: path.join(__dirname, "build"),
      filename: "[name].js",
    },
    plugins: [
      isAnalyze && new BundleAnalyzerPlugin(),
      new CopyPlugin({
        patterns: [
          {
            from: "./example/frontend/index.html",
            to: "index.html",
          },
        ],
      }) as any,
      new DefinePlugin({
        "process.env.MICROSERVICES_URL": JSON.stringify(
          process.env.MICROSERVICES_URL,
        ),
      }),
      new ForkTsCheckerWebpackPlugin({
        typescript: {
          memoryLimit: 8192,
        },
      }),
      !isProduction && new ReactRefreshWebpackPlugin(),
    ].filter(Boolean),
  };
};

export default config;
