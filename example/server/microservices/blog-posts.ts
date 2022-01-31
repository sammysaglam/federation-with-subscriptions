import fs from "fs";
import path from "path";

import { createMicroservice } from "../../../src";

const NAME = "Blog Posts";
const PORT = 4003;

const db = {
  blogPosts: [{ id: "1", title: "T-shirt" }],
};

export const blogPostsMicroservice = () =>
  createMicroservice({
    label: NAME,
    port: PORT,
    typeDefs: fs.readFileSync(
      path.join(__dirname, "blog-posts.graphql"),
      "utf-8",
    ),
    resolvers: {
      Query: {
        blogPosts: () => db.blogPosts,
      },
      User: {
        blogPosts: (root) => {
          console.log("root on user's blog posts", { root });

          return db.blogPosts;
        },
      },
      Product: {
        relevantBlogPostsForProduct: () => db.blogPosts,
      },
    },
    context: ({ req }) => ({
      jwt: req.headers.authorization,
    }),
    subscriptionContext: (ctx, message, args, headers) => ({
      jwt: headers?.authorization,
    }),
  });
