import { BaseContext } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { stitchSchemas } from "@graphql-tools/stitch";
import { stitchingDirectives } from "@graphql-tools/stitching-directives";
import { AsyncExecutor, observableToAsyncIterable } from "@graphql-tools/utils";
import { FilterRootFields, FilterTypes, wrapSchema } from "@graphql-tools/wrap";
import axios from "axios";
import { json } from "body-parser";
import cors from "cors";
import express, { Request, Response } from "express";
import {
  ExecutionArgs,
  getOperationAST,
  OperationTypeNode,
  print,
} from "graphql";
import gql from "graphql-tag";
import { Context, createClient, SubscribeMessage } from "graphql-ws";
import { useServer } from "graphql-ws/lib/use/ws";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

import { ExtendedApolloServer } from "./ExtendedApolloServer";

const createGatewaySchema = async (
  microservices: CreateGatewayParameters["microservices"],
  buildHttpHeaders: CreateGatewayParameters["buildHttpHeaders"],
  buildSubscriptionHeaders: CreateGatewayParameters["buildSubscriptionHeaders"],

  fallbackReq?: Request,
) => {
  const { stitchingDirectivesTransformer } = stitchingDirectives();

  const remoteSchemas = await Promise.all(
    microservices.map(async ({ endpoint }) => {
      // @ts-ignore
      const httpExecutor: AsyncExecutor = async ({
        document,
        variables,
        operationName,
        extensions,
        context: contextForHttpExecutor,
      }) => {
        const query = print(document);

        const fallback = { req: fallbackReq, res: undefined };

        const isSubscriptionContext =
          contextForHttpExecutor?.type === "subscription";

        const fetchResult = await axios.post(
          `http://${endpoint}`,
          { query, variables, operationName, extensions },
          {
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
          },
        );

        return fetchResult.data;
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as Record<string, any>,
                operationName,
                extensions,
              },
              {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                next: (data: any) => observer.next && observer.next(data),
                error: (err) => {
                  if (!observer.error) {
                    return;
                  }
                  if (err instanceof Error) {
                    observer.error(err);
                    return;
                  } else if (err instanceof CloseEvent) {
                    observer.error(
                      new Error(`Socket closed with event ${err.code}`),
                    );
                    return;
                  } else if (Array.isArray(err)) {
                    // graphQLError[]
                    observer.error(
                      new Error(err.map(({ message }) => message).join(", ")),
                    );
                    return;
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

          return true;
        }

        return true;
      }),
    ],
  });

  return finalSchema;
};

type CreateGatewayParameters = {
  readonly port?: number;
  readonly microservices: readonly { readonly endpoint: string }[];

  readonly onWebsocketMessage?: (
    message: WebSocket.RawData,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
  ) => void;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly onWebsocketClose?: (context: any) => void;

  readonly buildHttpHeaders?: ({
    req,
    res,
  }: {
    readonly req: Request | undefined;
    readonly res: Response | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) => Promise<any> | any;

  readonly buildSubscriptionHeaders?: (
    context: Context,
    message: SubscribeMessage,
    args: ExecutionArgs,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any> | any;
};

export const createGateway = async <TContext extends BaseContext>({
  microservices,
  port = 4000,
  onWebsocketMessage,
  onWebsocketClose,
  buildHttpHeaders,
  buildSubscriptionHeaders,
}: CreateGatewayParameters) => {
  const app = express();
  const httpServer = http.createServer(app);

  const apolloServer = new ExtendedApolloServer<TContext>({
    schema: () =>
      createGatewaySchema(
        microservices,
        buildHttpHeaders,
        buildSubscriptionHeaders,
      ),
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  });

  await apolloServer.start();

  app.use(
    "/graphql",
    cors<cors.CorsRequest>(),
    json(),
    expressMiddleware(apolloServer, {
      context: async (contextForHttpExecutor) => ({
        type: "http",
        value: contextForHttpExecutor,
      }),
    }),
  );

  const server = httpServer.listen({ port }, async () => {
    const wsServer = new WebSocketServer({
      noServer: true,
    });

    const wsServerGraphql = new WebSocketServer({
      noServer: true,
    });

    wsServer.on("connection", (ws) => {
      // eslint-disable-next-line functional/no-let, @typescript-eslint/no-explicit-any
      let context: any = {};

      // eslint-disable-next-line functional/no-conditional-statements
      if (onWebsocketMessage) {
        ws.on("message", (message: WebSocket.RawData) => {
          onWebsocketMessage(message, context);

          try {
            const messageParsed = JSON.parse(String(message));

            if (messageParsed.action === "SET_CONTEXT") {
              context = messageParsed.context;
              return;
            }
          } catch (error) {
            // do nothing
          }
        });
      }

      if (onWebsocketClose) {
        ws.on("close", () => onWebsocketClose(context));
        return;
      }
    });

    server.on("upgrade", (request, socket, head) => {
      const pathname = request.url;

      if (pathname === "/") {
        wsServerGraphql.handleUpgrade(request, socket, head, (ws) => {
          wsServerGraphql.emit("connection", ws);
        });
        return;
      } else if (pathname === "/ws") {
        wsServer.handleUpgrade(request, socket, head, (ws) => {
          wsServer.emit("connection", ws);
        });
        return;
      }

      socket.destroy();
      return;
    });

    useServer(
      {
        schema: await createGatewaySchema(
          microservices,
          buildHttpHeaders,
          buildSubscriptionHeaders,
        ),
        context: (...contextForWsExecutor) => ({
          type: "subscription",
          value: contextForWsExecutor,
        }),
      },
      wsServerGraphql,
    );

    console.log(`🚀 Gateway ready at http://localhost:${port || 4000}/graphql`);
  });

  return {
    expressApp: app,
  };
};
