import {
  ApolloServerOptionsWithStaticSchema,
  BaseContext,
} from "@apollo/server";
import {
  expressMiddleware,
  ExpressMiddlewareOptions,
} from "@apollo/server/express4";
import { makeExecutableSchema } from "@graphql-tools/schema";
import {
  federationToStitchingSDL,
  stitchingDirectives,
} from "@graphql-tools/stitching-directives";
import { json } from "body-parser";
import cors from "cors";
import express from "express";
import { ExecutionArgs } from "graphql";
import { Context, SubscribeMessage } from "graphql-ws";
import { useServer } from "graphql-ws/lib/use/ws";
import http from "http";
import { WebSocketServer } from "ws";

import {
  ExecuteHTTPGraphQLRequestParams,
  ExtendedApolloServer,
  ExtendedApolloServerOptionsTypeDefs,
} from "./ExtendedApolloServer";

const createExecutableSchema = <TContext extends BaseContext>({
  typeDefs,
  resolvers,
}: {
  readonly typeDefs: string;
  readonly resolvers: NonNullable<
    ApolloServerOptionsWithStaticSchema<TContext>["resolvers"]
  >;
}) => {
  const config = stitchingDirectives();

  const stitchingSDL = `
    ${federationToStitchingSDL(typeDefs, config)}

    extend type Query {
      _sdl: String!
    }
  `;

  const hasEntities = Boolean(stitchingSDL.match(/\n\s+_entities\(/));

  const executableSchema = makeExecutableSchema<TContext>({
    typeDefs: stitchingSDL,
    resolvers: [
      ...(Array.isArray(resolvers) ? resolvers : [resolvers]),

      // add the SDL are queryable field so the gateway can have access to the full schema
      { Query: { _sdl: () => stitchingSDL } },

      // this will be the result of converting federation SDL to stitching SDL
      // (see https://www.graphql-tools.com/docs/schema-stitching/stitch-federation)
      hasEntities
        ? {
            Query: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              _entities: (root: any, { representations }: any) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                representations.map((representation: any) => representation),
            },
            _Entity: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              __resolveType: ({ __typename }: any) => __typename,
            },
          }
        : {},
    ],
  });

  return executableSchema;
};

type Params<TContext extends BaseContext> =
  ExtendedApolloServerOptionsTypeDefs<TContext> & {
    readonly label: string;
    readonly port: number;
    readonly path?: string;

    readonly context?: ExpressMiddlewareOptions<TContext>["context"];
    readonly subscriptionContext?: (
      ctx: Context,
      message: SubscribeMessage,
      args: ExecutionArgs,
      headers: Record<string, string>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Record<string, any>;
  };

export const createMicroservice = async <TContext extends BaseContext>({
  label,
  port,
  path = "/graphql",

  typeDefs,
  resolvers,
  context,
  subscriptionContext,
}: Params<TContext>) => {
  const createSchema = async (
    params: ExecuteHTTPGraphQLRequestParams<TContext>,
  ) =>
    createExecutableSchema({
      typeDefs:
        typeof typeDefs === "function" ? await typeDefs(params) : typeDefs,

      resolvers:
        (typeof resolvers === "function"
          ? await resolvers(params)
          : resolvers) ?? [],
    });

  const apolloServer = new ExtendedApolloServer<TContext>({
    schema: (params) => createSchema(params),
  });

  const app = express();
  const httpServer = http.createServer(app);

  await apolloServer.start();

  app.use(
    "/graphql",
    cors<cors.CorsRequest>(),
    json(),
    expressMiddleware(apolloServer, {
      context,
    }),
  );

  const { endpoint } = await new Promise<{ readonly endpoint: string }>(
    (resolve) => {
      const server = httpServer.listen({ port }, async () => {
        const wsServer = new WebSocketServer({
          server,
          path: "/graphql",
        });

        useServer(
          {
            schema: await createSchema({
              context: undefined,
              httpGraphQLRequest: undefined,
            }),
            context: (ctx, message, args) =>
              subscriptionContext?.(ctx, message, args, {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(message.payload.variables?.__headers as any),
              }),
          },
          wsServer,
        );

        console.log(
          `🚀 Microservice "${label}" ready at http://localhost:${port}${path}`,
        );

        resolve({ endpoint: `localhost:${port}${path}` });
      });
    },
  );

  return {
    endpoint,
  };
};
