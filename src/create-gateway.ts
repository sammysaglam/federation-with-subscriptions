import { makeExecutableSchema } from "@graphql-tools/schema";
import { stitchSchemas } from "@graphql-tools/stitch";
import { stitchingDirectives } from "@graphql-tools/stitching-directives";
import {
  AsyncExecutor,
  observableToAsyncIterable,
  printSchemaWithDirectives,
} from "@graphql-tools/utils";
import { FilterRootFields, FilterTypes, wrapSchema } from "@graphql-tools/wrap";
import { ApolloServerPluginDrainHttpServer } from "apollo-server-core";
import {
  ApolloServer as ApolloExpressServer,
  ExpressContext,
} from "apollo-server-express";
import { fetch } from "cross-undici-fetch";
import express from "express";
import {
  ExecutionArgs,
  getOperationAST,
  OperationTypeNode,
  print,
  printSchema,
} from "graphql";
import gql from "graphql-tag";
import { Context, createClient, SubscribeMessage } from "graphql-ws";
import { useServer } from "graphql-ws/lib/use/ws";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

type Headers = Record<string, string | undefined | unknown>;

// eslint-disable-next-line @typescript-eslint/ban-types
type CreateGatewayParameters = {
  port?: number;
  microservices: { endpoint: string }[];

  buildHttpHeaders?: ({
    req,
    res,
  }: {
    req: ExpressContext["req"] | undefined;
    res: ExpressContext["res"] | undefined;
  }) => Promise<Headers> | Headers;

  buildSubscriptionHeaders?: (
    context: Context,
    message: SubscribeMessage,
    args: ExecutionArgs,
  ) => Promise<Headers> | Headers;
};

export const createGateway = async ({
  microservices,
  port,
  buildHttpHeaders,
  buildSubscriptionHeaders,
}: CreateGatewayParameters) => {
  const { stitchingDirectivesTransformer } = stitchingDirectives();

  const remoteSchemas = await Promise.all(
    microservices.map(async ({ endpoint }) => {
      const httpExecutor: AsyncExecutor = async ({
        document,
        variables,
        operationName,
        extensions,
        context: contextForHttpExecutor,
      }) => {
        const query = print(document);

        const fallback = { req: undefined, res: undefined };

        const isSubscriptionContext =
          contextForHttpExecutor?.type === "subscription";

        const fetchResult = await fetch(`http://${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",

            ...(isSubscriptionContext
              ? await buildSubscriptionHeaders?.(
                  contextForHttpExecutor?.value?.[0],
                  contextForHttpExecutor?.value?.[1],
                  contextForHttpExecutor?.value?.[2],
                )
              : await buildHttpHeaders?.(
                  contextForHttpExecutor?.value || fallback,
                )),
          },
          body: JSON.stringify({ query, variables, operationName, extensions }),
        });

        return fetchResult.json();
      };

      const subscriptionClient = createClient({
        url: `ws://${endpoint}`,
        webSocketImpl: WebSocket,
      });

      const wsExecutor: AsyncExecutor = async ({
        document,
        variables,
        operationName,
        extensions,
        context: contextForWsExecutor,
      }) => {
        const subscriptionHeaders = await buildSubscriptionHeaders?.(
          contextForWsExecutor?.value?.[0],
          contextForWsExecutor?.value?.[1],
          contextForWsExecutor?.value?.[2],
        );

        return observableToAsyncIterable({
          subscribe: (observer) => ({
            unsubscribe: subscriptionClient.subscribe(
              {
                query: print(document),
                variables: {
                  ...variables,

                  __headers: subscriptionHeaders,
                } as Record<string, any>,
                operationName,
                extensions,
              },
              {
                next: (data) => observer.next && observer.next(data as any),
                error: (err) => {
                  if (!observer.error) {
                    return;
                  }
                  if (err instanceof Error) {
                    observer.error(err);
                  } else if (err instanceof CloseEvent) {
                    observer.error(
                      new Error(`Socket closed with event ${err.code}`),
                    );
                  } else if (Array.isArray(err)) {
                    // graphQLError[]
                    observer.error(
                      new Error(err.map(({ message }) => message).join(", ")),
                    );
                  }
                },
                complete: () => observer.complete && observer.complete(),
              },
            ),
          }),
        });
      };

      const executor: AsyncExecutor = async (args) => {
        // get the operation node of from the document that should be executed
        const operation = getOperationAST(args.document, args.operationName);
        // subscription operations should be handled by the wsExecutor
        if (operation?.operation === OperationTypeNode.SUBSCRIPTION) {
          return wsExecutor(args);
        }
        // all other operations should be handles by the httpExecutor
        return httpExecutor(args);
      };

      const sdlResponse: any = await httpExecutor({
        document: gql`
          {
            _sdl
          }
        `,
      });

      const sdl = sdlResponse?.data?._sdl;

      if (!sdl) {
        throw new Error("microservice SDL could not be found!");
      }

      const remoteSchema = wrapSchema({
        schema: makeExecutableSchema({ typeDefs: sdl }),
        executor,
      });

      return {
        schema: remoteSchema,
      };
    }),
  );

  // build the combined schema
  const gatewaySchema = stitchSchemas({
    subschemaConfigTransforms: [stitchingDirectivesTransformer],
    subschemas: remoteSchemas,
  });

  const finalSchema = wrapSchema({
    schema: gatewaySchema,
    transforms: [
      new FilterTypes((type) => {
        switch (type.name) {
          case "_Entity":
            return false;

          default:
            return true;
        }
      }),
      new FilterRootFields((operationName, fieldName) => {
        if (operationName === "Query") {
          switch (fieldName) {
            case "_sdl":
              return false;

            default:
              return true;
          }
        }

        return true;
      }),
    ],
  });

  const app = express();
  const httpServer = http.createServer(app);

  const apolloServer = new ApolloExpressServer({
    schema: finalSchema,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    context: (contextForHttpExecutor) => ({
      type: "http",
      value: contextForHttpExecutor,
    }),
  });

  await apolloServer.start();

  apolloServer.applyMiddleware({ app, path: "/graphql", cors: true });

  const server = app.listen(port || 4000, () => {
    // create and use the websocket server
    const wsServer = new WebSocketServer({
      server,
      path: "/graphql",
    });

    useServer(
      {
        schema: finalSchema,
        context: (...contextForWsExecutor) => ({
          type: "subscription",
          value: contextForWsExecutor,
        }),
      },
      wsServer,
    );

    console.log(`🚀 Gateway ready at http://localhost:${port || 4000}/graphql`);
  });

  return {
    expressApp: app,

    executableSchema: finalSchema,

    // an option to print out the schema SDL
    sdl: (options: { withDirectives?: boolean } = {}) =>
      options.withDirectives ?? true
        ? printSchemaWithDirectives(finalSchema)
        : printSchema(finalSchema),
  };
};
