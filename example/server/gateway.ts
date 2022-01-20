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

  await createGateway({
    microservices,

    buildHttpHeaders: ({ req }) => ({
      "authorization": req?.headers.authorization,
    }),
    buildSubscriptionHeaders: ({ connectionParams }) => ({
      "authorization": connectionParams?.authorization,
    }),
  });
})();
