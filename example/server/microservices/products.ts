import fs from "fs";
import { PubSub, withFilter } from "graphql-subscriptions";
import path from "path";

import { createMicroservice } from "../../../src";

const pubsub = new PubSub();

const NAME = "Products";
const PORT = 4001;

const db = {
  products: [{ id: "1", name: "T-shirt" }],
};

export const productsMicroservice = async () => {
  const typeDefs = fs.readFileSync(
    path.join(__dirname, "products.graphql"),
    "utf-8",
  );

  const microservice = await createMicroservice({
    label: NAME,
    port: PORT,
    typeDefs: async () => {
      const dbLookupResult = [{ fieldKey: "color", type: "STRING" }];

      const newTypeDefs = `${typeDefs.replace(
        /type\s+Product\s+{([^}])+}/m,
        "",
      )}
        type Product {
          id: ID!
          name: String!
          sammysSpecialField: String!
          ${dbLookupResult.map(({ fieldKey }) => `${fieldKey}: String`)}
          testField${(Math.random() * 1000).toFixed(0)}: String
        }
      `;

      return newTypeDefs;
    },
    resolvers: () => ({
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
        id: (root) => root.id,
        sammysSpecialField: () => String(Math.random().toFixed(5)),
      },
    }),
    context: async ({ req }) => ({
      jwt: req.headers.authorization,
    }),
    subscriptionContext: (ctx, message, args, headers) => {
      console.log(headers);

      return {
        jwt: headers?.authorization,
        hello: "subscription header",
      };
    },
  });

  return microservice;
};
