import {
  ApolloServerPluginDrainHttpServer,
  ApolloServerPluginLandingPageGraphQLPlayground,
} from "apollo-server-core";
import express from "express";
import http from "http";

import { createExpressMicroservice } from ".";
import { CreateExpressMicroserviceParams } from "./create-express-microservice";

// eslint-disable-next-line @typescript-eslint/ban-types
type CreateMicroserviceParams<TContext = {}> =
  CreateExpressMicroserviceParams<TContext> & { port: number };

export const createMicroservice = async ({
  typeDefs,
  resolvers,
  context,
  subscriptionContext,
  label,
  port,
}: Omit<CreateMicroserviceParams, "plugins">) => {
  const app = express();
  const httpServer = http.createServer(app);

  const microservice = await createExpressMicroservice({
    label,
    typeDefs,
    resolvers,
    context,
    subscriptionContext,

    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      ApolloServerPluginLandingPageGraphQLPlayground(),
    ],
  });

  await microservice.start();

  const { listen } = microservice.applyMiddleware({ app });

  return listen(port);
};
