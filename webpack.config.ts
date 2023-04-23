import ReactRefreshWebpackPlugin from "@pmmmwh/react-refresh-webpack-plugin";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import path from "path";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";
import { Configuration as WebpackConfiguration, DefinePlugin } from "webpack";
import { Configuration as WebpackDevServerConfiguration } from "webpack-dev-server";

import { booleanFilter } from "./src/utils";

interface Configuration extends WebpackConfiguration {
  readonly devServer?: WebpackDevServerConfiguration;
}

const WEBPACKDEV_PORT = process.env.DEV_PORT
  ? Number(process.env.DEV_PORT)
  : 8000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const config: (options: any) => Configuration = (options) => {
  const isProduction = !options.WEBPACK_SERVE || options.analyze;

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
      open: true,
      historyApiFallback: true,
      hot: true,
      static: [path.resolve(__dirname, "example/frontend/public")],
      compress: true,
      port: WEBPACKDEV_PORT,
      allowedHosts: "all",
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
      plugins: [new TsconfigPathsPlugin()],
    },
    output: {
      path: path.join(__dirname, "build"),
      filename: "[name].js",
    },
    plugins: [
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
    ].filter(booleanFilter),
  };
};

// eslint-disable-next-line import/no-default-export
export default config;
