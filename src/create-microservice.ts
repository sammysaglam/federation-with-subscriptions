import { makeExecutableSchema } from "@graphql-tools/schema";
import {
  federationToStitchingSDL,
  stitchingDirectives,
} from "@graphql-tools/stitching-directives";
import { IResolvers } from "@graphql-tools/utils";
import {
  ApolloServerPluginDrainHttpServer,
  ApolloServerPluginLandingPageGraphQLPlayground,
} from "apollo-server-core";
import {
  ApolloServer as ApolloExpressServer,
  ExpressContext,
} from "apollo-server-express";
import express from "express";
import { ExecutionArgs } from "graphql";
import { Context, SubscribeMessage } from "graphql-ws";
import { useServer } from "graphql-ws/lib/use/ws";
import http from "http";
import { WebSocketServer } from "ws";

// eslint-disable-next-line @typescript-eslint/ban-types
type CreateMicroserviceParams<TContext = {}> = {
  typeDefs: string;
  resolvers: IResolvers<any, TContext>;

  port: number;
  label: string;

  context?: (expressContext: ExpressContext) => TContext;
  subscriptionContext?: (
    ctx: Context,
    message: SubscribeMessage,
    args: ExecutionArgs,
    headers: Record<string, string>,
  ) => Record<string, any>;
};

export const createMicroservice = async ({
  typeDefs,
  resolvers,
  context,
  subscriptionContext,
  label,
  port,
}: CreateMicroserviceParams) => {
  const config = stitchingDirectives();

  const stitchingSDL = `
    ${federationToStitchingSDL(typeDefs, config)}

    extend type Query {
      _sdl: String!
    }
  `;

  const hasEntities = Boolean(stitchingSDL.match(/\n\s+_entities\(/));

  const executableSchema = makeExecutableSchema({
    typeDefs: stitchingSDL,
    resolvers: [
      resolvers,

      // add the SDL are queryable field so the gateway can have access to the full schema
      { Query: { _sdl: () => stitchingSDL } },

      // this will be the result of converting federation SDL to stitching SDL
      // (see https://www.graphql-tools.com/docs/schema-stitching/stitch-federation)
      hasEntities
        ? {
            Query: {
              _entities: (root: any, { representations }: any) =>
                representations.map((representation: any) => representation),
            },
            _Entity: {
              __resolveType: ({ __typename }: any) => __typename,
            },
          }
        : {},
    ],
  });

  const app = express();
  const httpServer = http.createServer(app);

  const apolloExpressServer = new ApolloExpressServer({
    schema: executableSchema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      ApolloServerPluginLandingPageGraphQLPlayground(),
    ],
    context,
  });

  await apolloExpressServer.start();

  apolloExpressServer.applyMiddleware({ app, path: "/graphql" });

  type ReturnType = { endpoint: string; expressApp: typeof app };

  return new Promise<ReturnType>((resolve) => {
    const server = app.listen(port, () => {
      const wsServer = new WebSocketServer({
        server,
        path: "/graphql",
      });

      useServer(
        {
          schema: executableSchema,
          context: (ctx, message, args) =>
            subscriptionContext?.(ctx, message, args, {
              ...(message.payload.variables?.__headers as any),
            }),
        },
        wsServer,
      );

      console.log(
        `🚀 Microservice "${label}" ready at http://localhost:${port}/graphql`,
      );

      resolve({
        endpoint: `localhost:${port}/graphql`,
        expressApp: app,
      });
    });
  });
};
