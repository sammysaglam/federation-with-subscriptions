import { createGateway } from "../../src/create-gateway";
import { blogPostsMicroservice } from "./microservices/blog-posts";
import { productsMicroservice } from "./microservices/products";
import { usersMicroservice } from "./microservices/users";

(async () => {
  const microservices = await Promise.all([
    productsMicroservice(),
    usersMicroservice(),
    blogPostsMicroservice(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sdl, expressApp, executableSchema } = await createGateway({
    microservices,

    onWebsocketMessage: (data) => {
      console.log("received:", data.toString());
    },
    onWebsocketClose: ((context: any) => {
      console.log({ context });
    }) as any,

    buildHttpHeaders: async ({ req }) => ({
      "authorization": req?.headers.authorization,
    }),
    buildSubscriptionHeaders: async ({ connectionParams }) => ({
      "authorization": connectionParams?.authorization,
    }),
  });
})();
