import { makeExecutableSchema } from "@graphql-tools/schema";
import {
  federationToStitchingSDL,
  stitchingDirectives,
} from "@graphql-tools/stitching-directives";
import { IResolvers } from "@graphql-tools/utils";
import { PluginDefinition } from "apollo-server-core";
import {
  ApolloServer as ApolloExpressServer,
  ExpressContext,
} from "apollo-server-express";
import { ExecutionArgs } from "graphql";
import { Context, SubscribeMessage } from "graphql-ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { WebSocketServer } from "ws";

// eslint-disable-next-line @typescript-eslint/ban-types
export type CreateExpressMicroserviceParams<TContext = {}> = {
  typeDefs: string;
  resolvers: IResolvers<any, TContext>;

  label: string;

  context?: (expressContext: ExpressContext) => TContext;
  subscriptionContext?: (
    ctx: Context,
    message: SubscribeMessage,
    args: ExecutionArgs,
    headers: Record<string, string>,
  ) => Record<string, any>;

  plugins?: PluginDefinition[];
};

export const createExpressMicroservice = ({
  typeDefs,
  resolvers,
  context,
  subscriptionContext,
  label,
  plugins,
}: CreateExpressMicroserviceParams) => {
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

  const apolloExpressServer = new ApolloExpressServer({
    schema: executableSchema,
    plugins,
    context,
  });

  return {
    schema: executableSchema,

    start: async () => {
      await apolloExpressServer.start();
    },

    applyMiddleware: ({
      app,
      path = "/graphql",
      ...rest
    }: Parameters<typeof apolloExpressServer["applyMiddleware"]>[0]) => {
      apolloExpressServer.applyMiddleware({
        app,
        path,
        ...rest,
      });

      type ReturnType = { endpoint: string };

      return {
        listen: (port: number) =>
          new Promise<ReturnType>((resolve) => {
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
                `🚀 Microservice "${label}" ready at http://localhost:${port}${path}`,
              );

              resolve({ endpoint: `localhost:${port}${path}` });
            });
          }),
      };
    },
  };
};
