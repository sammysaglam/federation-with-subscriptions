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

  const typeDefs = fs.readFileSync(
    path.join(__dirname, "products.graphql"),
    "utf-8",
  );

  const microservice = await createExpressMicroservice({
    label: NAME,
    typeDefs: async (context) => {
      console.log("dude!", context);

      // wait for 100ms (e.g. in real life, this could be a DB lookup)
      await new Promise((resolve) => setTimeout(resolve, 100));

      const newTypeDefs = `${typeDefs.replace(
        /type\s+Product\s+{([^}])+}/m,
        "",
      )}
        type Product {
          id: ID!
          name: String!
          sammysSpecialField: String!
          randomField${(Math.random() * 1000).toFixed(0)}: String
        }
      `;

      return newTypeDefs;
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    resolvers: (apolloContext) => ({
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
        sammysSpecialField: () => String(Math.random().toFixed(5)),
      },
    }),
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
