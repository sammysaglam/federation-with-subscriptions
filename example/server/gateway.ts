import { createGateway } from "../../src/createGateway";
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
  const { expressApp } = await createGateway({
    microservices,

    onWebsocketMessage: (data) => {
      console.log("received:", data.toString());
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onWebsocketClose: (context: any) => {
      console.log({ context });
    },

    buildHttpHeaders: async ({ req }) => ({
      "authorization": req?.headers.authorization,
    }),
    buildSubscriptionHeaders: async ({ connectionParams }) => ({
      "authorization": connectionParams?.authorization,
    }),
  });
})();
