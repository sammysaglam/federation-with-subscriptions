import { WebSocket, WebSocketServer } from "ws";

import { createGateway } from "../../src/create-gateway";
import { blogPostsMicroservice } from "./microservices/blog-posts";
import { productsMicroservice } from "./microservices/products";
import { usersMicroservice } from "./microservices/users";

export const wss = new WebSocketServer({ port: 8080 });

export const socket = new WebSocket("ws://localhost:8080");

(async () => {
  wss.on("connection", (_ws: any) => {
    _ws.on("message", (data: any) => {
      console.log(`\n\n${data} \n\n`);
    });

    _ws.send(
      "\n\n============== welcome from websocket server 🚀 ============== ",
    );
  });

  const microservices = await Promise.all([
    productsMicroservice(),
    usersMicroservice(),
    blogPostsMicroservice(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sdl, expressApp, executableSchema } = await createGateway({
    microservices,

    buildHttpHeaders: async ({ req }) => ({
      "authorization": req?.headers.authorization,
    }),
    buildSubscriptionHeaders: async ({ connectionParams }) => ({
      "authorization": connectionParams?.authorization,
    }),
  });
})();
