import {
  ApolloServerPluginDrainHttpServer,
  ApolloServerPluginLandingPageGraphQLPlayground,
} from "apollo-server-core";
import express from "express";
import fs from "fs";
import { PubSub, withFilter } from "graphql-subscriptions";
import http from "http";
import path from "path";

import { createExpressMicroservice } from "../../../src";

const pubsub = new PubSub();

const NAME = "Products";
const PORT = 4001;

const db = {
  products: [{ id: "1", name: "T-shirt" }],
};

export const productsMicroservice = async () => {
  const app = express();
  const httpServer = http.createServer(app);

  const microservice = createExpressMicroservice({
    label: NAME,
    typeDefs: fs.readFileSync(
      path.join(__dirname, "products.graphql"),
      "utf-8",
    ),
    resolvers: {
      Query: {
        products: () => db.products,
      },
      Mutation: {
        updateProduct: () => {
          pubsub.publish("PRODUCT_UPDATED", {
            productUpdates: {
              ...db.products[0],
              name: `New name ${Math.random()}`,
            },
          });

          return db.products[0];
        },
      },
      Subscription: {
        productUpdates: {
          subscribe: withFilter(
            (payload, variables, context) => {
              console.log({
                subscriptionContext: context,
              });

              return pubsub.asyncIterator(["PRODUCT_UPDATED"]);
            },
            (payload, variables, context) => {
              console.log({
                subscriptionContext: context,
              });

              return true;
            },
          ),
        },
      },
      User: {
        favouriteProducts: () => db.products,
        hello: () => "world",
      },
      Product: {
        id: (root, args, context) => {
          console.log({ queryContext: context });
          return root.id;
        },
      },
    },
    context: ({ req }) => ({
      jwt: req.headers.authorization,
    }),
    subscriptionContext: (ctx, message, args, headers) => {
      console.log(headers);

      return {
        jwt: headers?.authorization,
        hello: "subscription header",
      };
    },

    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      ApolloServerPluginLandingPageGraphQLPlayground(),
    ],
  });

  await microservice.start();

  const { listen } = microservice.applyMiddleware({ app });

  return listen(PORT);
};
